/**
 * SePay bank-transfer checkout — a second payment method alongside Stripe. A learner picks a
 * plan, gets a fixed VND amount + a one-time reference code + a VietQR code to scan in their
 * banking app, and transfers. SePay's webhook (once its API key is configured — see
 * sepay.server.ts) or an admin's manual confirm then activates the plan exactly like a Stripe
 * webhook would, by writing an ordinary row into `subscriptions`.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gt, gte, max, sql } from "drizzle-orm";
import { z } from "zod";

import { withAdmin, withUser } from "@/db";
import {
  bankTransferOrders,
  billingEvents,
  processedWebhookEvents,
  profiles,
  subscriptions,
} from "@/db/schema/schema";
import {
  activateBankTransferOrder,
  assertCanPurchase,
  attachedTransactionIds,
  claimTransfer,
  reportedAtByOrder,
  ensureSepayReconciler,
  fetchSepayAccountStatus,
  getLastReconcile,
  LATE_PAYMENT_DAYS,
  reconcileSepay,
} from "./bank-transfer.server";
import { findActivePlanByPriceId } from "./billing.functions";
import { sendEmail } from "./email.server";
import { logAdminAction, logBillingEvent } from "./entitlements.server";
import { getPaymentsEnv } from "./payments-env";
import { requireAdmin, requireAuth } from "./require-auth";
import {
  extractReferenceCode,
  generateReferenceCode,
  getActiveSepayBankAccount,
  getSepayApiKey,
  getSepayWebhookSecret,
  sepayQrImageUrl,
  transferContentFor,
  usdCentsToVnd,
  vietQrImageUrl,
} from "./sepay.server";

const ORDER_LIFETIME_MINUTES = 30;
/** Clicking "pay by bank transfer" again reuses the learner's pending order for the same plan as long as it
 * has at least this long left, instead of minting a new code every click (one account once had 5). */
const REUSE_MIN_REMAINING_MINUTES = 5;

export type BankTransferOrder = Awaited<ReturnType<typeof toOrderRow>>;

async function toOrderRow(row: typeof bankTransferOrders.$inferSelect, reportedAt: string | null = null) {
  const bank = await getActiveSepayBankAccount();
  const qrUrl = sepayQrImageUrl(row.amountVnd, row.referenceCode, bank) || vietQrImageUrl(row.amountVnd, row.referenceCode, bank);
  return {
    id: row.id,
    plan_key: row.planKey,
    price_id: row.priceId,
    billing_interval: row.billingInterval,
    amount_vnd: row.amountVnd,
    reference_code: row.referenceCode,
    // What the learner must type in the bank note (adds "SEVQR " for VietinBank — see transferContentFor).
    transfer_content: transferContentFor(row.referenceCode, bank),
    status: row.status,
    expires_at: row.expiresAt,
    paid_at: row.paidAt,
    created_at: row.createdAt,
    bank_name: bank.bankName,
    account_number: bank.accountNumber,
    account_name: bank.accountName,
    qr_url: qrUrl,
    /** When the learner pressed "I've made the transfer" (null if they have not). */
    reported_at: reportedAt,
  };
}

export const createBankTransferOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { priceId: string }) => z.object({ priceId: z.string().min(1).max(80) }).parse(data))
  .handler(async ({ data, context }) => {
    const found = await findActivePlanByPriceId(data.priceId);
    if (!found) throw new Error("That plan is not available.");
    const { plan, interval, amount: usdCents } = found;
    // No buying a plan the learner already has, except renewing it in its last days.
    await assertCanPurchase(context.userId, plan.tier, "bank_transfer");
    // Converted from the plan's own USD price (the one number that's actually kept up to date)
    // at the current rate — no separate VND price list to fall out of sync.
    const amountVnd = usdCentsToVnd(usdCents);

    const reusable = await withAdmin((db) =>
      db
        .select()
        .from(bankTransferOrders)
        .where(
          and(
            eq(bankTransferOrders.userId, context.userId),
            eq(bankTransferOrders.priceId, data.priceId),
            eq(bankTransferOrders.status, "pending"),
            gt(bankTransferOrders.expiresAt, new Date(Date.now() + REUSE_MIN_REMAINING_MINUTES * 60 * 1000).toISOString()),
          ),
        )
        .orderBy(desc(bankTransferOrders.createdAt))
        .limit(1),
    );
    if (reusable[0]) return await toOrderRow(reusable[0]);

    const expiresAt = new Date(Date.now() + ORDER_LIFETIME_MINUTES * 60 * 1000).toISOString();
    let referenceCode = generateReferenceCode();
    // Astronomically unlikely to collide, but the column is UNIQUE — retry once with a fresh
    // code rather than surface a raw constraint error to the learner.
    const insertOrder = async () =>
      withAdmin((db) =>
        db
          .insert(bankTransferOrders)
          .values({
            userId: context.userId,
            planKey: plan.planKey,
            priceId: data.priceId,
            productId: plan.tier,
            billingInterval: interval,
            amountVnd,
            referenceCode,
            expiresAt,
          })
          .returning(),
      );
    let rows;
    try {
      rows = await insertOrder();
    } catch {
      referenceCode = generateReferenceCode();
      rows = await insertOrder();
    }
    const row = rows[0];
    if (!row) throw new Error("Could not start the bank transfer order.");

    await logBillingEvent("bank_transfer_order_created", {
      userId: context.userId,
      planKey: plan.planKey,
      env: getPaymentsEnv(),
      metadata: { orderId: row.id, amountVnd },
    });

    return await toOrderRow(row);
  });

/** Polled by the "waiting for your transfer" page every few seconds. */
export const getBankTransferOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const rows = await withUser(context.userId, (db) =>
      db
        .select()
        .from(bankTransferOrders)
        .where(and(eq(bankTransferOrders.id, data.orderId), eq(bankTransferOrders.userId, context.userId)))
        .limit(1),
    );
    const row = rows[0];
    if (!row) throw new Error("Order not found.");
    // While the learner is waiting on this page, also ask SePay directly (throttled to one call per ~15s
    // site-wide) so the plan activates even if the webhook never arrives. Fire-and-forget: the next poll a
    // few seconds later sees the result, and a slow SePay never holds this request up.
    if (row.status === "pending" || row.status === "expired") {
      ensureSepayReconciler();
      reconcileSepay().catch((error) => console.warn("[sepay] reconciliation from checkout poll failed:", error));
    }
    // Lazily flip a stale pending order to expired — the customer never sees a pending order
    // that quietly stayed "pending" forever after the 30-minute window passed.
    if (row.status === "pending" && new Date(row.expiresAt).getTime() < Date.now()) {
      await withAdmin((db) =>
        db.update(bankTransferOrders).set({ status: "expired", updatedAt: new Date().toISOString() }).where(eq(bankTransferOrders.id, row.id)),
      );
      row.status = "expired";
    }
    const reportedAt = row.status === "paid" ? null : await lastReportFor(row.id);
    return await toOrderRow(row, reportedAt);
  });

async function lastReportFor(orderId: string): Promise<string | null> {
  const rows = await withAdmin((db) =>
    db
      .select({ at: max(billingEvents.createdAt) })
      .from(billingEvents)
      .where(and(eq(billingEvents.event, "bank_transfer_reported"), sql`${billingEvents.metadata}->>'orderId' = ${orderId}`)),
  );
  return rows[0]?.at ?? null;
}

/** Emails the admin (ADMIN_NOTIFY_EMAIL) when a learner says they paid but nothing matched yet. Best effort. */
async function notifyAdminOfReport(order: typeof bankTransferOrders.$inferSelect, learnerEmail: string) {
  const to = process.env["ADMIN_NOTIFY_EMAIL"];
  if (!to) return;
  const site = (process.env["APP_URL"] ?? "https://lingoraenglishai.com").replace(/\/+$/, "");
  try {
    await sendEmail({
      to,
      subject: `[Lingora] Học viên báo đã chuyển khoản: ${order.referenceCode}`,
      html: `<p>Học viên <strong>${learnerEmail.replace(/[<>&"]/g, "")}</strong> bấm "Tôi đã chuyển khoản" cho đơn
<strong>${order.referenceCode}</strong> (${order.planKey} · ${order.billingInterval}, ${order.amountVnd.toLocaleString("vi-VN")} đ),
nhưng hệ thống chưa thấy khoản tiền khớp trên SePay.</p>
<p>Hãy kiểm tra sao kê ngân hàng. Nếu tiền đã vào: Admin → Billing → Bank transfers → gắn giao dịch (Attach) hoặc xác nhận tay.</p>
<p><a href="${site}/admin">${site}/admin</a></p>`,
    });
  } catch (error) {
    console.warn("[sepay] could not email the admin about a reported transfer:", error);
  }
}

/**
 * The learner's "I've made the transfer" button. Checks SePay right away (throttled site-wide); if the
 * money is there the plan activates on the spot. If not, the report is recorded (visible to the admin,
 * plus an email when ADMIN_NOTIFY_EMAIL is set) so a transfer that did not match automatically — wrong note,
 * wrong amount, sent late — gets a human look instead of being forgotten. Works for expired orders too.
 */
export const reportBankTransferSent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const load = async () =>
      (
        await withUser(context.userId, (db) =>
          db
            .select()
            .from(bankTransferOrders)
            .where(and(eq(bankTransferOrders.id, data.orderId), eq(bankTransferOrders.userId, context.userId)))
            .limit(1),
        )
      )[0];
    let row = await load();
    if (!row) throw new Error("Order not found.");
    if (row.status === "cancelled") throw new Error("This order was cancelled. Please contact support.");
    if (row.status === "paid") return { status: "paid" as const, reported_at: null };

    ensureSepayReconciler();
    await reconcileSepay().catch((error) => console.warn("[sepay] reconciliation on learner report failed:", error));
    row = (await load()) ?? row;
    if (row.status === "paid") return { status: "paid" as const, reported_at: null };

    const previous = await lastReportFor(row.id);
    // One recorded report (and one admin email) per order every 10 minutes, however often it is pressed.
    if (previous && Date.now() - Date.parse(previous) < 10 * 60_000) {
      return { status: row.status, reported_at: previous };
    }
    await logBillingEvent("bank_transfer_reported", {
      userId: context.userId,
      planKey: row.planKey,
      intervalKey: row.billingInterval,
      metadata: { orderId: row.id, referenceCode: row.referenceCode, amountVnd: row.amountVnd },
    });
    const profile = await withAdmin((db) =>
      db.select({ email: profiles.email }).from(profiles).where(eq(profiles.id, context.userId)).limit(1),
    );
    await notifyAdminOfReport(row, profile[0]?.email ?? context.userId);
    return { status: row.status, reported_at: new Date().toISOString() };
  });

/* --------------------------------------------------------------- admin */

/**
 * Manual override for a transfer SePay never recorded (e.g. one sent before the "SEVQR" fix, which SePay
 * could not see): the admin has found the money in the real bank statement. Requires a written reason and
 * is recorded in admin_audit_log — this button once activated 16 unpaid orders in 25 seconds, unlogged.
 * When SePay did record the transfer, attach it instead (adminAttachSepayTransaction).
 */
export const adminConfirmBankTransferOrder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: { orderId: string; reason: string }) =>
    z.object({ orderId: z.string().uuid(), reason: z.string().trim().min(8).max(300) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const order = await activateBankTransferOrder(data.orderId, null);
    await logAdminAction(context.userId, "bank_transfer_confirmed_manually", order.userId, {
      orderId: order.id,
      referenceCode: order.referenceCode,
      amountVnd: order.amountVnd,
      reason: data.reason,
    });
    return await toOrderRow(order as typeof bankTransferOrders.$inferSelect);
  });

/**
 * The normal way to settle by hand: link an order to a real transfer SePay recorded (one the automatic
 * match skipped — wrong note, wrong amount, paid after a revoke…). The transfer must be in SePay's list and
 * not already used by another order.
 */
export const adminAttachSepayTransaction = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: { orderId: string; transactionId: string }) =>
    z.object({ orderId: z.string().uuid(), transactionId: z.string().regex(/^[0-9]{1,20}$/) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await reconcileSepay();
    const transfer = getLastReconcile().transactions.find((t) => t.id === data.transactionId);
    if (!transfer || transfer.amountIn <= 0) throw new Error("That transfer is not in SePay's recent incoming transactions.");
    if ((await attachedTransactionIds()).has(transfer.id)) throw new Error("That transfer is already attached to an order.");

    const rows = await withAdmin((db) => db.select().from(bankTransferOrders).where(eq(bankTransferOrders.id, data.orderId)).limit(1));
    const target = rows[0];
    if (!target) throw new Error("Order not found.");
    if (target.status === "paid") throw new Error("That order is already paid.");

    // Mark the transfer as handled first so the automatic matcher can never also use it.
    await claimTransfer(transfer.id, "admin");
    const order = await activateBankTransferOrder(target.id, transfer.id);
    await logAdminAction(context.userId, "bank_transfer_attached", order.userId, {
      orderId: order.id,
      referenceCode: order.referenceCode,
      orderAmountVnd: order.amountVnd,
      transactionId: transfer.id,
      transferAmount: transfer.amountIn,
      transferContent: transfer.content.slice(0, 160),
      previousOrderStatus: target.status,
    });
    return { ok: true as const };
  });

/** "Reconcile now" button: checks SePay immediately instead of waiting for the 2-minute background run. */
export const adminReconcileSepayNow = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    ensureSepayReconciler();
    return await reconcileSepay({ force: true });
  });

/**
 * Health of the SePay link plus every incoming transfer that is not attached to a paid order. Built from
 * live SePay data each time it is opened, so a broken link (like the VietinBank "SEVQR" problem, where the
 * bank account received money but SePay saw nothing for two weeks) is visible at a glance.
 */
export const adminSepayStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    ensureSepayReconciler();
    const apiKeyConfigured = Boolean(getSepayApiKey());
    const webhookSecretConfigured = Boolean(getSepayWebhookSecret());

    const reconcile = apiKeyConfigured ? await reconcileSepay() : null;
    const transactions = getLastReconcile().transactions;

    let account = null;
    let accountError: string | null = null;
    try {
      account = await fetchSepayAccountStatus();
    } catch (error) {
      accountError = error instanceof Error ? error.message : String(error);
    }

    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [webhookRows, orderRows, attached] = await Promise.all([
      withAdmin((db) =>
        db
          .select({ at: max(processedWebhookEvents.processedAt) })
          .from(processedWebhookEvents)
          .where(and(eq(processedWebhookEvents.environment, "sepay"), eq(processedWebhookEvents.eventType, "sepay.transfer.in"))),
      ),
      withAdmin((db) =>
        db
          .select({
            id: bankTransferOrders.id,
            referenceCode: bankTransferOrders.referenceCode,
            status: bankTransferOrders.status,
            amountVnd: bankTransferOrders.amountVnd,
            planKey: bankTransferOrders.planKey,
            billingInterval: bankTransferOrders.billingInterval,
            createdAt: bankTransferOrders.createdAt,
            email: profiles.email,
          })
          .from(bankTransferOrders)
          .leftJoin(profiles, eq(profiles.id, bankTransferOrders.userId))
          .where(gte(bankTransferOrders.createdAt, since))
          .orderBy(desc(bankTransferOrders.createdAt))
          .limit(300),
      ),
      attachedTransactionIds(),
    ]);
    const lastWebhookAt = webhookRows[0]?.at ?? null;

    // SePay reports times as "YYYY-MM-DD HH:mm:ss" in Vietnam time.
    const sepayTime = (value: string) => Date.parse(`${value.replace(" ", "T")}+07:00`);
    const byCode = new Map(orderRows.map((o) => [o.referenceCode, o]));
    const describe = (o: (typeof orderRows)[number]) => ({
      order_id: o.id,
      reference_code: o.referenceCode,
      status: o.status,
      amount_vnd: o.amountVnd,
      plan: `${o.planKey} · ${o.billingInterval}`,
      email: o.email ?? "",
      created_at: o.createdAt,
    });

    const unmatched = transactions
      .filter((t) => t.amountIn > 0 && !attached.has(t.id) && sepayTime(t.date) > Date.now() - 30 * 86_400_000)
      .map((t) => {
        const code = extractReferenceCode({ content: t.content, code: t.code });
        const order = code ? byCode.get(code) : undefined;
        let reason: string;
        if (!code) reason = "no order code in the transfer note";
        else if (!order) reason = `code ${code} matches no recent order`;
        else if (order.status === "paid") reason = "second payment for an order that is already paid";
        else if (order.status === "cancelled") reason = "order was cancelled/revoked by an admin";
        else if (order.amountVnd !== t.amountIn) reason = `amount differs from the order (${order.amountVnd.toLocaleString("en-US")} expected)`;
        else reason = "not settled yet — the next check should activate it";
        // Orders this transfer could belong to: the coded one, else unpaid orders with the same amount.
        const candidates = order && order.status !== "paid"
          ? [describe(order)]
          : orderRows.filter((o) => o.status !== "paid" && o.amountVnd === t.amountIn).slice(0, 8).map(describe);
        return {
          transaction_id: t.id,
          date: t.date,
          amount: t.amountIn,
          content: t.content,
          detected_code: code,
          reason,
          candidates,
        };
      });

    const pending = orderRows.filter((o) => o.status === "pending");
    const oldestPending = pending.at(-1) ?? null;
    const reports = await reportedAtByOrder();
    const warnings: string[] = [];
    for (const o of orderRows) {
      const reportedAt = reports.get(o.id);
      if (!reportedAt || o.status === "paid") continue;
      const minutes = Math.max(0, Math.round((Date.now() - Date.parse(reportedAt)) / 60_000));
      warnings.push(
        `${o.email || "A learner"} says they paid ${o.referenceCode} (${o.amountVnd.toLocaleString("en-US")}đ) ${minutes} min ago, ` +
          "but no matching transfer has settled. Check the bank statement, then attach the transfer or confirm manually.",
      );
    }
    if (!apiKeyConfigured) warnings.push("SEPAY_API_KEY is not set — automatic reconciliation is off.");
    if (!webhookSecretConfigured) warnings.push("SEPAY_WEBHOOK_SECRET is not set — every SePay webhook is rejected.");
    if (accountError) warnings.push(`Could not read the bank account from SePay: ${accountError}`);
    if (account && !account.active) warnings.push("SePay reports the bank account as inactive.");
    if (reconcile?.error) warnings.push(`Last SePay check failed: ${reconcile.error}`);
    if (reconcile?.activated.length) {
      warnings.push(
        `The last check activated ${reconcile.activated.join(", ")} — the webhook did not deliver these first. Check the webhook in SePay.`,
      );
    }
    if (oldestPending && account) {
      const waitedMin = Math.round((Date.now() - Date.parse(oldestPending.createdAt)) / 60_000);
      const lastTx = account.lastTransactionAt ? sepayTime(account.lastTransactionAt) : 0;
      if (waitedMin >= 10 && lastTx < Date.parse(oldestPending.createdAt)) {
        warnings.push(
          `Order ${oldestPending.referenceCode} has waited ${waitedMin} min and SePay has recorded no transfer since it was created. ` +
            "If the learner says they paid, check the bank statement — SePay may not be receiving this account's transactions " +
            "(for VietinBank the note must contain SEVQR).",
        );
      }
    }

    return {
      configured: { api_key: apiKeyConfigured, webhook_secret: webhookSecretConfigured },
      account,
      last_webhook_at: lastWebhookAt,
      last_check: reconcile,
      late_payment_days: LATE_PAYMENT_DAYS,
      pending_count: pending.length,
      warnings,
      unmatched,
    };
  });

/**
 * Takes a bank-transfer plan away again — for an order that was marked paid without the money being
 * checked (the 2026-10-05 bulk "Mark as paid"). Access ends immediately: the subscription becomes
 * "canceled" with its period ending now (has_active_subscription() only keeps a canceled row alive until
 * current_period_end), and the order goes to "cancelled" so it is no longer counted as paid. The rows are
 * kept for history. Recorded in admin_audit_log with who did it. Admin only.
 */
export const adminRevokeBankTransferOrder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const nowIso = new Date().toISOString();
    const order = await withAdmin(async (db) => {
      const rows = await db.select().from(bankTransferOrders).where(eq(bankTransferOrders.id, data.orderId)).limit(1);
      const found = rows[0];
      if (!found) throw new Error("Order not found.");
      await db
        .update(subscriptions)
        .set({ status: "canceled", currentPeriodEnd: nowIso, cancelAtPeriodEnd: true, updatedAt: nowIso })
        .where(eq(subscriptions.providerSubscriptionId, `sepay_${found.id}`));
      if (found.status === "paid") {
        await db
          .update(bankTransferOrders)
          .set({ status: "cancelled", updatedAt: nowIso })
          .where(eq(bankTransferOrders.id, found.id));
      }
      return found;
    });
    await logAdminAction(context.userId, "bank_transfer_revoked", order.userId, {
      orderId: order.id,
      referenceCode: order.referenceCode,
      amountVnd: order.amountVnd,
      planKey: order.planKey,
      billingInterval: order.billingInterval,
      previousOrderStatus: order.status,
    });
    return { ok: true as const };
  });

export const adminListBankTransferOrders = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const rows = await withAdmin((db) =>
      db
        .select({
          id: bankTransferOrders.id,
          userId: bankTransferOrders.userId,
          email: profiles.email,
          planKey: bankTransferOrders.planKey,
          billingInterval: bankTransferOrders.billingInterval,
          amountVnd: bankTransferOrders.amountVnd,
          referenceCode: bankTransferOrders.referenceCode,
          status: bankTransferOrders.status,
          sepayTransactionId: bankTransferOrders.sepayTransactionId,
          createdAt: bankTransferOrders.createdAt,
          paidAt: bankTransferOrders.paidAt,
        })
        .from(bankTransferOrders)
        .leftJoin(profiles, eq(profiles.id, bankTransferOrders.userId))
        .orderBy(desc(bankTransferOrders.createdAt))
        .limit(100),
    );
    const lateSince = Date.now() - LATE_PAYMENT_DAYS * 86_400_000;
    const reports = await reportedAtByOrder();
    return rows.map((r) => ({
      id: r.id,
      user_id: r.userId,
      email: r.email ?? "",
      plan_key: r.planKey,
      billing_interval: r.billingInterval,
      amount_vnd: r.amountVnd,
      reference_code: r.referenceCode,
      status: r.status,
      // Pending, or expired recently enough that a late transfer is still honoured.
      open: r.status === "pending" || (r.status === "expired" && Date.parse(r.createdAt) > lateSince),
      sepay_transaction_id: r.sepayTransactionId,
      created_at: r.createdAt,
      paid_at: r.paidAt,
      /** The learner pressed "I've made the transfer" at this time (null if never). */
      reported_at: r.status === "paid" ? null : (reports.get(r.id) ?? null),
    }));
  });
