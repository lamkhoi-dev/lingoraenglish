/**
 * SePay bank-transfer checkout — a second payment method alongside Stripe. A learner picks a
 * plan, gets a fixed VND amount + a one-time reference code + a VietQR code to scan in their
 * banking app, and transfers. SePay's webhook (once its API key is configured — see
 * sepay.server.ts) or an admin's manual confirm then activates the plan exactly like a Stripe
 * webhook would, by writing an ordinary row into `subscriptions`.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { withAdmin, withUser } from "@/db";
import { bankTransferOrders, subscriptions } from "@/db/schema/schema";
import { findActivePlanByPriceId } from "./billing.functions";
import { logBillingEvent } from "./entitlements.server";
import { getPaymentsEnv, type PaymentsEnv } from "./payments-env";
import { requireAdmin, requireAuth } from "./require-auth";
import { generateReferenceCode, getActiveSepayBankAccount, sepayQrImageUrl, usdCentsToVnd, vietQrImageUrl } from "./sepay.server";

const ORDER_LIFETIME_MINUTES = 30;

export type BankTransferOrder = Awaited<ReturnType<typeof toOrderRow>>;

async function toOrderRow(row: typeof bankTransferOrders.$inferSelect) {
  const bank = await getActiveSepayBankAccount();
  const qrUrl = sepayQrImageUrl(row.amountVnd, row.referenceCode, bank) || vietQrImageUrl(row.amountVnd, row.referenceCode, bank);
  return {
    id: row.id,
    plan_key: row.planKey,
    price_id: row.priceId,
    billing_interval: row.billingInterval,
    amount_vnd: row.amountVnd,
    reference_code: row.referenceCode,
    status: row.status,
    expires_at: row.expiresAt,
    paid_at: row.paidAt,
    created_at: row.createdAt,
    bank_name: bank.bankName,
    account_number: bank.accountNumber,
    account_name: bank.accountName,
    qr_url: qrUrl,
  };
}

export const createBankTransferOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { priceId: string }) => z.object({ priceId: z.string().min(1).max(80) }).parse(data))
  .handler(async ({ data, context }) => {
    const found = await findActivePlanByPriceId(data.priceId);
    if (!found) throw new Error("That plan is not available.");
    const { plan, interval, amount: usdCents } = found;
    // Converted from the plan's own USD price (the one number that's actually kept up to date)
    // at the current rate — no separate VND price list to fall out of sync.
    const amountVnd = usdCentsToVnd(usdCents);

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
    // Lazily flip a stale pending order to expired — the customer never sees a pending order
    // that quietly stayed "pending" forever after the 30-minute window passed.
    if (row.status === "pending" && new Date(row.expiresAt).getTime() < Date.now()) {
      await withAdmin((db) =>
        db.update(bankTransferOrders).set({ status: "expired", updatedAt: new Date().toISOString() }).where(eq(bankTransferOrders.id, row.id)),
      );
      row.status = "expired";
    }
    return await toOrderRow(row);
  });

/**
 * Writes the paid order into `subscriptions` exactly the way the Stripe webhook writes a
 * Stripe subscription — same table, same access-control functions, no other code needs to know
 * a payment ever happened outside Stripe. Bank transfer has no card on file, so it never
 * auto-renews: cancel_at_period_end is always true, and access simply ends at current_period_end
 * unless the learner pays again (has_active_subscription already treats that period_end as the
 * hard stop for a "canceled"/non-renewing row — see migration 0013's fix for the same case).
 */
export async function activateBankTransferOrder(orderId: string, sepayTransactionId: string | null) {
  const rows = await withAdmin((db) => db.select().from(bankTransferOrders).where(eq(bankTransferOrders.id, orderId)).limit(1));
  const order = rows[0];
  if (!order) throw new Error(`Bank transfer order ${orderId} not found`);
  if (order.status === "paid") return order; // already processed (webhook retry / double-confirm)

  const now = new Date();
  const periodEnd = new Date(now);
  if (order.billingInterval === "year") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);
  const env: PaymentsEnv = getPaymentsEnv();

  await withAdmin(async (db) => {
    await db
      .update(bankTransferOrders)
      .set({ status: "paid", sepayTransactionId, paidAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(eq(bankTransferOrders.id, orderId));

    const subRow = {
      userId: order.userId,
      providerSubscriptionId: `sepay_${order.id}`,
      providerCustomerId: `sepay_user_${order.userId}`,
      productId: order.productId,
      priceId: order.priceId,
      status: "active",
      billingInterval: order.billingInterval,
      currency: "VND",
      amount: order.amountVnd,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      startedAt: now.toISOString(),
      cancelAtPeriodEnd: true,
      scheduledChange: "",
      trialEndsAt: null,
      environment: env,
      updatedAt: now.toISOString(),
    };
    await db.insert(subscriptions).values(subRow).onConflictDoUpdate({ target: subscriptions.providerSubscriptionId, set: subRow });
  });

  await logBillingEvent("bank_transfer_paid", {
    userId: order.userId,
    planKey: order.planKey,
    env,
    metadata: { orderId: order.id, amountVnd: order.amountVnd, sepayTransactionId },
  });
  return { ...order, status: "paid" as const };
}

/* --------------------------------------------------------------- admin */

/** Bridge until SePay's webhook is wired up (or as a permanent fallback if a transfer's
 * auto-match ever fails): an admin who has checked the real bank account confirms an order by
 * hand. Exactly the same activation path the webhook uses. */
export const adminConfirmBankTransferOrder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const order = await activateBankTransferOrder(data.orderId, null);
    return await toOrderRow(order as typeof bankTransferOrders.$inferSelect);
  });

export const adminListBankTransferOrders = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const rows = await withAdmin((db) =>
      db
        .select({
          id: bankTransferOrders.id,
          userId: bankTransferOrders.userId,
          planKey: bankTransferOrders.planKey,
          billingInterval: bankTransferOrders.billingInterval,
          amountVnd: bankTransferOrders.amountVnd,
          referenceCode: bankTransferOrders.referenceCode,
          status: bankTransferOrders.status,
          createdAt: bankTransferOrders.createdAt,
          paidAt: bankTransferOrders.paidAt,
        })
        .from(bankTransferOrders)
        .orderBy(desc(bankTransferOrders.createdAt))
        .limit(100),
    );
    return rows.map((r) => ({
      id: r.id,
      user_id: r.userId,
      plan_key: r.planKey,
      billing_interval: r.billingInterval,
      amount_vnd: r.amountVnd,
      reference_code: r.referenceCode,
      status: r.status,
      created_at: r.createdAt,
      paid_at: r.paidAt,
    }));
  });
