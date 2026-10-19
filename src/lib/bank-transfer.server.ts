/**
 * SePay bank-transfer settlement — server-only. The single place an incoming transfer is matched to an
 * order and the plan is activated, used by both paths that learn about a transfer:
 *   - the SePay webhook (routes/api/public/payments/sepay-webhook.ts), and
 *   - reconciliation: polling SePay's transaction list (reconcileSepay), so a plan still activates when the
 *     webhook is misconfigured, down, or never fires.
 * Both dedupe on processed_webhook_events ("sepay_<transaction id>", environment "sepay"), so the same
 * transfer can never activate twice whichever path sees it first.
 */
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import { withAdmin } from "@/db";
import {
  billingEvents,
  billingPlans,
  bankTransferOrders,
  processedWebhookEvents,
  subscriptions,
} from "@/db/schema/schema";
import { getActiveTrial, logBillingEvent, revokeTrial } from "./entitlements.server";
import { getPaymentsEnv, type PaymentsEnv } from "./payments-env";
import { extractReferenceCode, getSepayApiKey } from "./sepay.server";

/** A transfer for an order that already expired (the 30-minute window passed) is still honoured for this
 * long after the order was created — the money arrived, so the learner gets the plan. Older ones go to the
 * admin's "unmatched transfers" list instead. */
export const LATE_PAYMENT_DAYS = 7;
/** A plan that does not renew by itself (bank transfer, or a card plan set to end) can be bought again
 * during its last days; the new period then starts when the current one ends, so no paid day is lost. */
export const RENEWAL_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;
const TIER_RANK: Record<string, number> = { free: 0, premium: 1, ielts_pro: 2 };

/* ------------------------------------------------------- plan coverage */

export type PlanCoverage = {
  tier: string;
  endsAt: number | null;
  bankTransfer: boolean;
  /** A card subscription Stripe will charge again by itself. */
  autoRenews: boolean;
};

/** Every paid subscription that still gives this learner access, with its plan tier. Same rule as
 * has_active_subscription() in SQL (grace days aside). */
export async function activePaidCoverage(
  userId: string,
  env: PaymentsEnv = getPaymentsEnv(),
): Promise<PlanCoverage[]> {
  const [subs, plans] = await withAdmin((db) =>
    Promise.all([
      db
        .select({
          priceId: subscriptions.priceId,
          status: subscriptions.status,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
          providerSubscriptionId: subscriptions.providerSubscriptionId,
        })
        .from(subscriptions)
        .where(and(eq(subscriptions.userId, userId), eq(subscriptions.environment, env))),
      db
        .select({
          tier: billingPlans.tier,
          monthlyPriceId: billingPlans.monthlyPriceId,
          yearlyPriceId: billingPlans.yearlyPriceId,
        })
        .from(billingPlans),
    ]),
  );
  const now = Date.now();
  return subs
    .filter((s) => {
      const end = s.currentPeriodEnd ? Date.parse(s.currentPeriodEnd) : null;
      if (["active", "trialing", "past_due"].includes(s.status)) return end === null || end > now;
      if (s.status === "canceled") return end !== null && end > now;
      return false;
    })
    .map((s) => {
      const bankTransfer = s.providerSubscriptionId.startsWith("sepay_");
      return {
        tier:
          plans.find((p) => p.monthlyPriceId === s.priceId || p.yearlyPriceId === s.priceId)
            ?.tier ?? "premium",
        endsAt: s.currentPeriodEnd ? Date.parse(s.currentPeriodEnd) : null,
        bankTransfer,
        autoRenews: !bankTransfer && !s.cancelAtPeriodEnd && s.status !== "canceled",
      };
    });
}

/**
 * Server-side guard for both checkouts: a learner cannot buy a plan they already have (or one below it).
 * Allowed: upgrading to a higher tier, and renewing a plan that will not renew by itself during its last
 * RENEWAL_WINDOW_DAYS (by bank transfer; a card plan set to end should be resumed in Billing instead of
 * starting a second Stripe subscription). The pricing page hides these buttons already — this is the
 * safety net for stale tabs and direct calls.
 */
export async function assertCanPurchase(
  userId: string,
  tier: string,
  method: "card" | "bank_transfer",
): Promise<void> {
  const rank = TIER_RANK[tier] ?? 1;
  const covering = (await activePaidCoverage(userId)).filter(
    (c) => (TIER_RANK[c.tier] ?? 1) >= rank,
  );
  const windowOpensBefore = Date.now() + RENEWAL_WINDOW_DAYS * DAY_MS;
  for (const c of covering) {
    if (c.autoRenews) {
      throw new Error("Your current plan renews automatically — manage it on the Billing page.");
    }
    if (c.endsAt === null || c.endsAt > windowOpensBefore) {
      const until = c.endsAt ? new Date(c.endsAt).toISOString().slice(0, 10) : "later";
      throw new Error(
        `You already have this plan until ${until}. You can renew it during its last ${RENEWAL_WINDOW_DAYS} days.`,
      );
    }
    if (method === "card" && !c.bankTransfer) {
      throw new Error(
        "Your card plan is set to end — turn renewal back on from the Billing page instead of buying it again.",
      );
    }
  }
}

/* ------------------------------------------------- learner "I've paid" */

/** When the learner last pressed "I've made the transfer" for each order (last `days` days). */
export async function reportedAtByOrder(days = 30): Promise<Map<string, string>> {
  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const rows = await withAdmin((db) =>
    db
      .select({
        orderId: sql<string>`${billingEvents.metadata}->>'orderId'`,
        at: sql<string>`max(${billingEvents.createdAt})`,
      })
      .from(billingEvents)
      .where(
        and(eq(billingEvents.event, "bank_transfer_reported"), gte(billingEvents.createdAt, since)),
      )
      .groupBy(sql`${billingEvents.metadata}->>'orderId'`),
  );
  return new Map(rows.filter((r) => r.orderId).map((r) => [r.orderId, r.at]));
}

/**
 * Writes the paid order into `subscriptions` exactly the way the Stripe webhook writes a
 * Stripe subscription — same table, same access-control functions, no other code needs to know
 * a payment ever happened outside Stripe. Bank transfer has no card on file, so it never
 * auto-renews: cancel_at_period_end is always true, and access simply ends at current_period_end
 * unless the learner pays again (has_active_subscription already treats that period_end as the
 * hard stop for a "canceled"/non-renewing row — see migration 0013's fix for the same case).
 */
export async function activateBankTransferOrder(
  orderId: string,
  sepayTransactionId: string | null,
) {
  const rows = await withAdmin((db) =>
    db.select().from(bankTransferOrders).where(eq(bankTransferOrders.id, orderId)).limit(1),
  );
  const order = rows[0];
  if (!order) throw new Error(`Bank transfer order ${orderId} not found`);
  if (order.status === "paid") return order; // already processed (webhook retry / double-confirm)

  const now = new Date();
  const env: PaymentsEnv = getPaymentsEnv();
  // A renewal paid before the current plan of the same tier ends starts when that plan ends, so the
  // learner never loses the days they already paid for.
  const sameTierEnds = (await activePaidCoverage(order.userId, env))
    .filter((c) => c.tier === order.productId && c.endsAt !== null && c.endsAt > now.getTime())
    .map((c) => c.endsAt as number);
  // The signup free trial is Premium: buying Premium while it runs starts the paid period when the trial
  // ends (trial days + paid days). Buying a higher tier starts at once and drops the leftover trial,
  // because a Premium trial cannot be carried over to a different plan.
  const trial = await getActiveTrial(order.userId);
  const trialCarriesOver = trial !== null && order.productId === "premium";
  const dropTrial = trial !== null && (TIER_RANK[order.productId] ?? 1) > TIER_RANK["premium"]!;
  const startsAt = [...sameTierEnds, ...(trial && trialCarriesOver ? [trial.endsAt] : [])];
  const periodStart = startsAt.length ? new Date(Math.max(...startsAt)) : now;
  const periodEnd = new Date(periodStart);
  if (order.billingInterval === "year") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  await withAdmin(async (db) => {
    await db
      .update(bankTransferOrders)
      .set({
        status: "paid",
        sepayTransactionId,
        paidAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
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
      currentPeriodStart: periodStart.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      startedAt: now.toISOString(),
      cancelAtPeriodEnd: true,
      scheduledChange: "",
      trialEndsAt: null,
      environment: env,
      updatedAt: now.toISOString(),
    };
    await db
      .insert(subscriptions)
      .values(subRow)
      .onConflictDoUpdate({ target: subscriptions.providerSubscriptionId, set: subRow });
  });

  if (dropTrial) await revokeTrial(order.userId);

  await logBillingEvent("bank_transfer_paid", {
    userId: order.userId,
    planKey: order.planKey,
    env,
    metadata: { orderId: order.id, amountVnd: order.amountVnd, sepayTransactionId },
  });
  return { ...order, status: "paid" as const };
}

/* ------------------------------------------------------------------ dedupe */

export type TransferSource = "webhook" | "reconcile" | "admin";

/** event_type tells the health panel which path saw a transfer first ("sepay.transfer.in" = webhook). */
const EVENT_TYPE: Record<TransferSource, string> = {
  webhook: "sepay.transfer.in",
  reconcile: "sepay.reconciled",
  admin: "sepay.admin_attached",
};

/** Composite (eventId, environment) primary key shared with the Stripe webhook — the "sepay_" prefix keeps
 * SePay's integer transaction ids from colliding with a Stripe "evt_…" id. */
export async function claimTransfer(
  transactionId: string,
  source: TransferSource,
): Promise<boolean> {
  const claimed = await withAdmin((db) =>
    db
      .insert(processedWebhookEvents)
      .values({
        eventId: `sepay_${transactionId}`,
        eventType: EVENT_TYPE[source],
        environment: "sepay",
      })
      .onConflictDoNothing()
      .returning({ eventId: processedWebhookEvents.eventId }),
  );
  return claimed.length > 0;
}

async function releaseTransfer(transactionId: string) {
  await withAdmin((db) =>
    db
      .delete(processedWebhookEvents)
      .where(
        and(
          eq(processedWebhookEvents.eventId, `sepay_${transactionId}`),
          eq(processedWebhookEvents.environment, "sepay"),
        ),
      ),
  );
}

/* -------------------------------------------------------------- settlement */

export type IncomingTransfer = {
  /** SePay's transaction id — the integer the webhook sends as `id`, same as the v1 transaction list. */
  id: string;
  amount: number;
  content: string;
  description?: string;
  code?: string | null;
};

export type TransferOutcome =
  | "activated"
  | "activated_late"
  | "duplicate"
  | "no_code"
  | "no_order"
  | "already_paid"
  | "order_cancelled"
  | "amount_mismatch"
  | "too_late";

/** Matches one incoming transfer to its order and activates the plan when everything checks out. Anything
 * that does not (no code, wrong amount, revoked order, very late) is left alone and logged — it then shows
 * up in the admin's unmatched-transfer list, so the learner's money is never silently ignored. */
export async function settleSepayTransfer(
  transfer: IncomingTransfer,
  source: TransferSource,
): Promise<{ outcome: TransferOutcome; referenceCode?: string; orderId?: string }> {
  if (!(await claimTransfer(transfer.id, source))) return { outcome: "duplicate" };

  try {
    const referenceCode = extractReferenceCode(transfer);
    const note = {
      transactionId: transfer.id,
      amount: transfer.amount,
      content: transfer.content.slice(0, 120),
      source,
    };
    if (!referenceCode) {
      console.warn("[sepay] incoming transfer has no order code", note);
      return { outcome: "no_code" };
    }

    const rows = await withAdmin((db) =>
      db
        .select()
        .from(bankTransferOrders)
        .where(eq(bankTransferOrders.referenceCode, referenceCode))
        .limit(1),
    );
    const order = rows[0];
    if (!order) {
      console.warn("[sepay] order code matched no order", { ...note, referenceCode });
      return { outcome: "no_order", referenceCode };
    }
    const base = { referenceCode, orderId: order.id };
    if (order.status === "paid") {
      if (order.sepayTransactionId !== transfer.id) {
        console.warn("[sepay] second payment for an order that is already paid", {
          ...note,
          referenceCode,
        });
      }
      return { outcome: "already_paid", ...base };
    }
    if (order.status === "cancelled") {
      console.warn("[sepay] payment for an order an admin cancelled — left for review", {
        ...note,
        referenceCode,
      });
      return { outcome: "order_cancelled", ...base };
    }
    if (transfer.amount !== order.amountVnd) {
      console.warn("[sepay] amount does not match the order — left for review", {
        ...note,
        referenceCode,
        expected: order.amountVnd,
      });
      return { outcome: "amount_mismatch", ...base };
    }

    const late = order.status === "expired" || new Date(order.expiresAt).getTime() < Date.now();
    if (late && Date.now() - new Date(order.createdAt).getTime() > LATE_PAYMENT_DAYS * DAY_MS) {
      console.warn("[sepay] payment arrived too long after the order — left for review", {
        ...note,
        referenceCode,
      });
      return { outcome: "too_late", ...base };
    }

    await activateBankTransferOrder(order.id, transfer.id);
    console.log(
      `[sepay] ${late ? "late " : ""}payment activated order ${referenceCode} via ${source}`,
    );
    return { outcome: late ? "activated_late" : "activated", ...base };
  } catch (error) {
    await releaseTransfer(transfer.id);
    throw error;
  }
}

/* ---------------------------------------------------------- SePay read API */

export type SepayTransaction = {
  id: string;
  date: string;
  amountIn: number;
  content: string;
  code: string | null;
  referenceNumber: string | null;
};

/** Newest transactions SePay has recorded for the linked bank account(s). Uses the v1 list because its ids
 * are the same integers the webhook sends, which keeps dedupe consistent (the v2 list uses UUIDs). */
export async function fetchRecentSepayTransactions(limit = 100): Promise<SepayTransaction[]> {
  const key = getSepayApiKey();
  if (!key) throw new Error("SEPAY_API_KEY is not set.");
  const res = await fetch(`https://my.sepay.vn/userapi/transactions/list?limit=${limit}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`SePay transaction list returned HTTP ${res.status}.`);
  const json = (await res.json()) as { transactions?: Record<string, unknown>[] };
  return (json.transactions ?? []).map((t) => ({
    id: String(t["id"] ?? ""),
    date: String(t["transaction_date"] ?? ""),
    amountIn: Number(t["amount_in"] ?? 0),
    content: String(t["transaction_content"] ?? ""),
    code: t["code"] ? String(t["code"]) : null,
    referenceNumber: t["reference_number"] ? String(t["reference_number"]) : null,
  }));
}

export type SepayAccountStatus = {
  bankName: string;
  accountNumberMasked: string;
  accountHolder: string;
  lastTransactionAt: string | null;
  active: boolean;
};

export async function fetchSepayAccountStatus(): Promise<SepayAccountStatus | null> {
  const key = getSepayApiKey();
  if (!key) return null;
  const res = await fetch("https://userapi.sepay.vn/v2/bank-accounts", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`SePay bank-account list returned HTTP ${res.status}.`);
  const json = (await res.json()) as {
    data?: Record<string, unknown>[] | { items?: Record<string, unknown>[] };
  };
  const list = Array.isArray(json.data) ? json.data : (json.data?.items ?? []);
  const account = list[0];
  if (!account) return null;
  const number = String(account["account_number"] ?? "");
  return {
    bankName: String(account["bank_short_name"] ?? account["bank_full_name"] ?? ""),
    accountNumberMasked: number ? `••••${number.slice(-4)}` : "",
    accountHolder: String(account["account_holder_name"] ?? ""),
    lastTransactionAt: account["last_transaction"] ? String(account["last_transaction"]) : null,
    active: String(account["active"] ?? "") === "1" || account["active"] === true,
  };
}

/* ---------------------------------------------------------- reconciliation */

export type ReconcileStatus = {
  at: string;
  checked: number;
  activated: string[];
  skipped: string | null;
  error: string | null;
};

let lastReconcile: ReconcileStatus | null = null;
let lastTransactions: SepayTransaction[] = [];
let running: Promise<ReconcileStatus> | null = null;
/** Learner checkout pages poll every few seconds; never call SePay more often than this. */
const MIN_GAP_MS = 15_000;

export function getLastReconcile(): {
  status: ReconcileStatus | null;
  transactions: SepayTransaction[];
} {
  return { status: lastReconcile, transactions: lastTransactions };
}

/** Orders that could still be paid: pending, or expired within the late-payment window. */
async function countOpenOrders(): Promise<number> {
  const since = new Date(Date.now() - LATE_PAYMENT_DAYS * DAY_MS).toISOString();
  const rows = await withAdmin((db) =>
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(bankTransferOrders)
      .where(
        and(
          inArray(bankTransferOrders.status, ["pending", "expired"]),
          gte(bankTransferOrders.createdAt, since),
        ),
      ),
  );
  return rows[0]?.n ?? 0;
}

/**
 * Reads SePay's newest transactions and settles any it has not seen yet. Safe to call often: concurrent
 * calls share one run, calls within MIN_GAP_MS reuse the last result (unless `force`), and transfers
 * already processed (by the webhook or an earlier run) are skipped.
 */
export async function reconcileSepay(
  opts: { force?: boolean; onlyIfOpenOrders?: boolean } = {},
): Promise<ReconcileStatus> {
  if (running) return running;
  if (!opts.force && lastReconcile && Date.now() - Date.parse(lastReconcile.at) < MIN_GAP_MS)
    return lastReconcile;

  running = (async (): Promise<ReconcileStatus> => {
    const at = new Date().toISOString();
    if (!getSepayApiKey()) {
      return { at, checked: 0, activated: [], skipped: "SEPAY_API_KEY is not set", error: null };
    }
    if (opts.onlyIfOpenOrders && (await countOpenOrders()) === 0) {
      return { at, checked: 0, activated: [], skipped: "no open orders", error: null };
    }
    try {
      const transactions = await fetchRecentSepayTransactions(100);
      lastTransactions = transactions;
      const incoming = transactions.filter((t) => t.amountIn > 0 && t.id);
      const seen = incoming.length
        ? await withAdmin((db) =>
            db
              .select({ eventId: processedWebhookEvents.eventId })
              .from(processedWebhookEvents)
              .where(
                and(
                  eq(processedWebhookEvents.environment, "sepay"),
                  inArray(
                    processedWebhookEvents.eventId,
                    incoming.map((t) => `sepay_${t.id}`),
                  ),
                ),
              ),
          )
        : [];
      const seenIds = new Set(seen.map((r) => r.eventId));
      const activated: string[] = [];
      let firstError: string | null = null;
      for (const t of incoming) {
        if (seenIds.has(`sepay_${t.id}`)) continue;
        try {
          const result = await settleSepayTransfer(
            { id: t.id, amount: t.amountIn, content: t.content, code: t.code },
            "reconcile",
          );
          if (
            (result.outcome === "activated" || result.outcome === "activated_late") &&
            result.referenceCode
          ) {
            activated.push(result.referenceCode);
          }
        } catch (error) {
          firstError ??= error instanceof Error ? error.message : String(error);
        }
      }
      if (activated.length) {
        console.warn(
          `[sepay] reconciliation activated ${activated.join(", ")} — the webhook did not deliver these first`,
        );
      }
      return { at, checked: incoming.length, activated, skipped: null, error: firstError };
    } catch (error) {
      return {
        at,
        checked: 0,
        activated: [],
        skipped: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })()
    .then((status) => {
      lastReconcile = status;
      return status;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

/* ------------------------------------------------------------- background */

const LOOP_MS = 2 * 60_000;
let loopStarted = false;

/** Starts the every-2-minutes reconciliation once per server process. It only calls SePay while some
 * order could still be paid, so an idle site makes no API calls. */
export function ensureSepayReconciler(): void {
  if (loopStarted || !getSepayApiKey()) return;
  loopStarted = true;
  const timer = setInterval(() => {
    reconcileSepay({ onlyIfOpenOrders: true }).catch((error) =>
      console.warn("[sepay] reconciliation failed:", error),
    );
  }, LOOP_MS);
  (timer as { unref?: () => void }).unref?.();
}

/** Ids of SePay transactions already attached to a paid order (anything else incoming is "unmatched"). */
export async function attachedTransactionIds(): Promise<Set<string>> {
  const rows = await withAdmin((db) =>
    db
      .select({ id: bankTransferOrders.sepayTransactionId })
      .from(bankTransferOrders)
      .where(isNotNull(bankTransferOrders.sepayTransactionId))
      .orderBy(desc(bankTransferOrders.paidAt))
      .limit(1000),
  );
  return new Set(rows.map((r) => r.id ?? "").filter(Boolean));
}
