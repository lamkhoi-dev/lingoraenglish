/**
 * Learner-facing billing server functions.
 *
 * Nothing here trusts the browser: the payment environment is derived from the
 * build's client token, plan/price data comes from the database or the payment
 * provider, and every mutation is scoped to the authenticated user's own
 * subscription.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { withAdmin, withAnon, withUser } from "@/db";
import { billingEvents, billingPlans, subscriptions } from "@/db/schema/schema";
import { requireAuth } from "@/lib/require-auth";
import { getEntitlement, logBillingEvent, MONTHLY_QUOTA_KEYS } from "./entitlements.server";
import { getPaddleEnvironment, type PaddleEnv } from "./payments-env";

/* --------------------------------------------------------------------- plans */

/** Public plan catalogue — not tier-gated (RLS: "Anyone can read active
 * plans"), so a plain withAnon() read is correct even for a logged-in caller. */
export const getPublicPlans = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await withAnon((db) =>
    db
      .select()
      .from(billingPlans)
      .where(eq(billingPlans.isActive, true))
      .orderBy(asc(billingPlans.sortOrder)),
  );
  return rows.map((r) => {
    // Same MONTHLY_QUOTA_KEYS filter as getEntitlement() — /pricing's
    // allowance comparison table must not leak Yêu cầu 9's internal
    // content-unlock config keys (or the retired stt/tts monthly caps) as if
    // they were customer-facing plan allowances.
    const allLimits = r.limits as Record<string, number>;
    const limits: Record<string, number> = {};
    for (const key of MONTHLY_QUOTA_KEYS) if (key in allLimits) limits[key] = allLimits[key]!;
    return {
      plan_key: r.planKey,
      tier: r.tier as "free" | "premium" | "ielts_pro",
      name: r.name,
      tagline: r.tagline,
      badge: r.badge,
      currency: r.currency,
      monthly_amount: r.monthlyAmount,
      yearly_amount: r.yearlyAmount,
      monthly_price_id: r.monthlyPriceId,
      yearly_price_id: r.yearlyPriceId,
      features: r.features as string[],
      limits,
      trial_enabled: r.trialEnabled,
      trial_days: r.trialDays,
      sort_order: r.sortOrder,
    };
  });
});

/* ------------------------------------------------------------------ prices */

export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data: { priceId: string }) =>
    z.object({ priceId: z.string().min(1).max(80) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { paddleFetch } = await import("./paddle.server");
    const env = getPaddleEnvironment();
    const response = await paddleFetch(
      env,
      `/prices?external_id=${encodeURIComponent(data.priceId)}`,
    );
    const result = (await response.json()) as { data?: { id: string }[] };
    if (!result.data?.length) throw new Error("That plan price is not available yet.");
    return result.data[0]!.id;
  });

/** Which payment environment this build talks to — for the test-mode banner. */
export const getPaymentEnvironment = createServerFn({ method: "GET" }).handler(async () => ({
  environment: getPaddleEnvironment(),
}));

/* ------------------------------------------------------- my subscription */

// snake_case to match what billing.tsx/membership-panel.tsx already expect —
// was a direct Supabase `.select("*")` response.
function toSubscriptionRow(row: typeof subscriptions.$inferSelect) {
  return {
    id: row.id,
    user_id: row.userId,
    paddle_subscription_id: row.paddleSubscriptionId,
    paddle_customer_id: row.paddleCustomerId,
    product_id: row.productId,
    price_id: row.priceId,
    status: row.status,
    billing_interval: row.billingInterval,
    currency: row.currency,
    amount: row.amount,
    current_period_start: row.currentPeriodStart,
    current_period_end: row.currentPeriodEnd,
    started_at: row.startedAt,
    cancel_at_period_end: row.cancelAtPeriodEnd,
    scheduled_change: row.scheduledChange,
    trial_ends_at: row.trialEndsAt,
    environment: row.environment,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

async function myLatestSubscription(userId: string, env: PaddleEnv) {
  const rows = await withUser(userId, (db) =>
    db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.environment, env)))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1),
  );
  return rows[0] ? toSubscriptionRow(rows[0]) : null;
}

async function requireOwnSubscription(userId: string, env: PaddleEnv) {
  const row = await myLatestSubscription(userId, env);
  if (!row) throw new Error("No subscription found for your account.");
  return { row, env };
}

export const getMyBilling = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const env = getPaddleEnvironment();
    const [entitlement, subscription] = await Promise.all([
      getEntitlement(context.userId, env),
      myLatestSubscription(context.userId, env),
    ]);
    return { entitlement, subscription };
  });

/**
 * Payment history. The provider is asked first — it is the authority, and it
 * knows about refunds/adjustments we never store. When it cannot be reached we
 * fall back to what the (signature-verified) webhook already wrote, because
 * Yêu cầu 11 requires the history to stay readable while the payment gateway
 * is temporarily down. `stale` says which of the two the learner is looking at.
 * Card data is never stored — only the brand and last four the provider sent.
 */
export const listMyPayments = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const env = getPaddleEnvironment();
    const sub = await myLatestSubscription(context.userId, env);
    const customerId = sub?.paddle_customer_id;

    if (customerId) {
      try {
        const { paddleFetch, toMajorUnit } = await import("./paddle.server");
        const response = await paddleFetch(
          env,
          `/transactions?customer_id=${encodeURIComponent(customerId)}&per_page=50&order_by=created_at[DESC]`,
        );
        if (response.ok) {
          const result = (await response.json()) as { data?: RawTransaction[] };
          const payments: PaymentRow[] = (result.data ?? []).map((tx) => ({
            id: tx.id,
            date: tx.billed_at ?? tx.created_at,
            status: tx.status,
            currency: tx.currency_code,
            subtotal: toMajorUnit(tx.details?.totals?.subtotal, tx.currency_code),
            tax: toMajorUnit(tx.details?.totals?.tax, tx.currency_code),
            total: toMajorUnit(tx.details?.totals?.total, tx.currency_code),
            description: tx.items?.[0]?.price?.description ?? tx.items?.[0]?.price?.name ?? "",
            invoiceNumber: tx.invoice_number ?? null,
            paymentMethod: describePaymentMethod(tx),
          }));
          return { payments, stale: false };
        }
        console.error("Payment history: provider answered", response.status);
      } catch (error) {
        console.error("Payment history: provider unreachable", error);
      }
    }

    return { payments: await storedPayments(context.userId, env), stale: Boolean(customerId) };
  });

/** What the webhook recorded for one payment, for the offline fallback above. */
type StoredPaymentMeta = {
  transactionId?: string;
  billedAt?: string | null;
  status?: string;
  currency?: string;
  subtotal?: string | null;
  tax?: string | null;
  total?: string | null;
  description?: string;
  invoiceNumber?: string | null;
  paymentMethodType?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
};

/** withAdmin because billing_events' only read policy is the admin one — the
 * rows are filtered to the caller's own id, which requireAuth just proved. */
async function storedPayments(userId: string, env: PaddleEnv): Promise<PaymentRow[]> {
  const rows = await withAdmin((db) =>
    db
      .select({ metadata: billingEvents.metadata, createdAt: billingEvents.createdAt })
      .from(billingEvents)
      .where(
        and(
          eq(billingEvents.userId, userId),
          eq(billingEvents.environment, env),
          eq(billingEvents.event, "payment_succeeded"),
        ),
      )
      .orderBy(desc(billingEvents.createdAt))
      .limit(50),
  );

  const { toMajorUnit } = await import("./paddle.server");
  return rows
    .map((row) => ({ meta: (row.metadata ?? {}) as StoredPaymentMeta, createdAt: row.createdAt }))
    .filter(({ meta }) => Boolean(meta.transactionId))
    .map(({ meta, createdAt }) => {
      const currency = meta.currency ?? "USD";
      return {
        id: meta.transactionId!,
        date: meta.billedAt ?? createdAt,
        status: meta.status ?? "completed",
        currency,
        subtotal: toMajorUnit(meta.subtotal, currency),
        tax: toMajorUnit(meta.tax, currency),
        total: toMajorUnit(meta.total, currency),
        description: meta.description ?? "",
        invoiceNumber: meta.invoiceNumber ?? null,
        paymentMethod: formatPaymentMethod(meta.paymentMethodType, meta.cardBrand, meta.cardLast4),
      };
    });
}

type RawTransaction = {
  id: string;
  status: string;
  currency_code: string;
  created_at: string;
  billed_at?: string | null;
  invoice_number?: string | null;
  items?: { price?: { name?: string; description?: string } }[];
  details?: { totals?: { subtotal?: string; tax?: string; total?: string } };
  payments?: {
    method_details?: { type?: string; card?: { type?: string; last4?: string } };
  }[];
};

export type PaymentRow = {
  id: string;
  date: string;
  status: string;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  description: string;
  invoiceNumber: string | null;
  paymentMethod: string | null;
};

function formatPaymentMethod(
  type: string | null | undefined,
  cardBrand: string | null | undefined,
  cardLast4: string | null | undefined,
): string | null {
  if (cardLast4) {
    const brand = (cardBrand ?? "card").replace(/_/g, " ");
    return `${brand.charAt(0).toUpperCase()}${brand.slice(1)} •••• ${cardLast4}`;
  }
  return type ? type.replace(/_/g, " ") : null;
}

function describePaymentMethod(tx: RawTransaction): string | null {
  const details = tx.payments?.[0]?.method_details;
  if (!details) return null;
  return formatPaymentMethod(details.type, details.card?.type, details.card?.last4);
}

/** A receipt/invoice URL generated by the provider (never built by us). */
export const getInvoiceUrl = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { transactionId: string }) =>
    z.object({ transactionId: z.string().min(3).max(80) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const env = getPaddleEnvironment();
    const sub = await myLatestSubscription(context.userId, env);
    const customerId = sub?.paddle_customer_id;
    if (!customerId) throw new Error("No billing account found.");

    const { paddleFetch } = await import("./paddle.server");
    // Confirm the transaction really belongs to this learner before revealing it.
    const check = await paddleFetch(env, `/transactions/${encodeURIComponent(data.transactionId)}`);
    const tx = (await check.json()) as { data?: { customer_id?: string } };
    if (tx.data?.customer_id !== customerId) throw new Error("Not found.");

    const response = await paddleFetch(
      env,
      `/transactions/${encodeURIComponent(data.transactionId)}/invoice`,
    );
    const result = (await response.json()) as { data?: { url?: string } };
    if (!result.data?.url) throw new Error("No invoice is available for this payment yet.");
    return { url: result.data.url };
  });

/* ------------------------------------------------------------- checkout */

/**
 * Called by the success page. Access is granted only when the provider
 * confirms the subscription/transaction — never because the page was visited.
 */
export const verifyCheckout = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { transactionId?: string }) =>
    z.object({ transactionId: z.string().max(80).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const env = getPaddleEnvironment();

    let row = await myLatestSubscription(context.userId, env);
    let confirmed = await hasLiveSubscription(context.userId, env);

    if (!confirmed && data.transactionId) {
      // Webhook may still be in flight: ask the provider directly.
      const { paddleFetch } = await import("./paddle.server");
      const response = await paddleFetch(
        env,
        `/transactions/${encodeURIComponent(data.transactionId)}?include=subscription`,
      );
      const result = (await response.json()) as {
        data?: {
          status?: string;
          custom_data?: { userId?: string };
          subscription_id?: string | null;
        };
      };
      const tx = result.data;
      const belongsToUser = tx?.custom_data?.userId === context.userId;
      if (tx?.status === "completed" && belongsToUser && tx.subscription_id) {
        const { syncSubscriptionFromProvider } = await import("./billing-sync.server");
        await syncSubscriptionFromProvider(tx.subscription_id, env, context.userId);
        row = await myLatestSubscription(context.userId, env);
        confirmed = await hasLiveSubscription(context.userId, env);
      }
    }

    const entitlement = await getEntitlement(context.userId, env);
    if (confirmed) {
      // subscriptionId is what idx_billing_events_activation_once dedupes on —
      // reloading /checkout/success must not log a second activation.
      await logBillingEvent("subscription_activated", {
        userId: context.userId,
        planKey: entitlement.planKey,
        env,
        metadata: { subscriptionId: row?.paddle_subscription_id ?? null },
      });
    }

    return { confirmed, subscription: row, entitlement };
  });

/**
 * "Does this learner have a live paid subscription" — asked of the same SQL
 * function effective_tier() gates content with, so the success screen can never
 * disagree with what the app actually unlocks (it used to be a fourth
 * hand-written copy of the rule, which the Yêu cầu 11 grace window would have
 * made diverge). Grace period comes with it, from billing_plans.limits.
 */
async function hasLiveSubscription(userId: string, env: PaddleEnv): Promise<boolean> {
  const rows = await withAdmin((db) =>
    db.execute(sql`select has_active_subscription(${userId}, ${env}) as live`),
  );
  return Boolean((rows as unknown as { live: boolean }[])[0]?.live);
}

/* --------------------------------------------------------------- coupons */

export const validateCoupon = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { code: string; priceId: string }) =>
    z
      .object({
        code: z
          .string()
          .min(1)
          .max(32)
          .regex(/^[A-Za-z0-9]+$/, "Coupon codes are letters and numbers only."),
        priceId: z.string().min(1).max(80),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const env = getPaddleEnvironment();
    const { paddleFetch } = await import("./paddle.server");

    const response = await paddleFetch(
      env,
      `/discounts?code=${encodeURIComponent(data.code.toUpperCase())}&status=active`,
    );
    const result = (await response.json()) as {
      data?: {
        id: string;
        code: string;
        status: string;
        type: string;
        amount: string;
        currency_code?: string | null;
        description?: string;
        expires_at?: string | null;
        restrict_to?: string[] | null;
        recur?: boolean;
      }[];
    };

    const discount = result.data?.[0];
    if (!discount || discount.status !== "active") {
      return { valid: false as const, reason: "unknown" };
    }
    if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
      return { valid: false as const, reason: "expired" };
    }

    if (discount.restrict_to?.length) {
      const priceResponse = await paddleFetch(
        env,
        `/prices?external_id=${encodeURIComponent(data.priceId)}`,
      );
      const priceResult = (await priceResponse.json()) as {
        data?: { id: string; product_id: string }[];
      };
      const price = priceResult.data?.[0];
      const allowed =
        price &&
        (discount.restrict_to.includes(price.id) ||
          discount.restrict_to.includes(price.product_id));
      if (!allowed) return { valid: false as const, reason: "not_applicable" };
    }

    return {
      valid: true as const,
      code: discount.code,
      type: discount.type,
      amount: discount.amount,
      currency: discount.currency_code ?? null,
      recurring: Boolean(discount.recur),
      description: discount.description ?? "",
    };
  });

/* -------------------------------------------------- subscription actions */

/** Opens the provider's hosted billing portal (payment method, invoices…). */
export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { row, env } = await requireOwnSubscription(context.userId, getPaddleEnvironment());
    const { getPaddleClient } = await import("./paddle.server");
    const paddle = getPaddleClient(env);
    const session = await paddle.customerPortalSessions.create(row.paddle_customer_id, [
      row.paddle_subscription_id,
    ]);
    return {
      overviewUrl: session.urls.general.overview,
      subscriptionUrls: session.urls.subscriptions ?? [],
    };
  });

export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { row, env } = await requireOwnSubscription(context.userId, getPaddleEnvironment());
    const { getPaddleClient } = await import("./paddle.server");
    const paddle = getPaddleClient(env);
    // End of billing period — the learner keeps access to what they paid for.
    await paddle.subscriptions.cancel(row.paddle_subscription_id, {
      effectiveFrom: "next_billing_period",
    });
    await logBillingEvent("subscription_cancel_requested", { userId: context.userId, env });
    return { ok: true };
  });

export const keepMySubscription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { row, env } = await requireOwnSubscription(context.userId, getPaddleEnvironment());
    const { paddleFetch } = await import("./paddle.server");
    const response = await paddleFetch(
      env,
      `/subscriptions/${encodeURIComponent(row.paddle_subscription_id)}`,
      { method: "PATCH", body: JSON.stringify({ scheduled_change: null }) },
    );
    if (!response.ok) throw new Error("We could not restore your subscription — please try again.");
    await logBillingEvent("subscription_cancel_reverted", { userId: context.userId, env });
    return { ok: true };
  });

/** Upgrade or downgrade between paid plans through the provider. */
export const changeMyPlan = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { priceId: string }) =>
    z.object({ priceId: z.string().min(1).max(80) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { row, env } = await requireOwnSubscription(context.userId, getPaddleEnvironment());

    const plans = await withAnon((db) =>
      db
        .select({
          planKey: billingPlans.planKey,
          tier: billingPlans.tier,
          monthlyPriceId: billingPlans.monthlyPriceId,
          yearlyPriceId: billingPlans.yearlyPriceId,
          isActive: billingPlans.isActive,
        })
        .from(billingPlans),
    );
    const plan = plans.find(
      (p) => p.isActive && (p.monthlyPriceId === data.priceId || p.yearlyPriceId === data.priceId),
    );
    if (!plan) throw new Error("That plan is not available.");

    const { paddleFetch, getPaddleClient } = await import("./paddle.server");
    const priceLookup = await paddleFetch(
      env,
      `/prices?external_id=${encodeURIComponent(data.priceId)}`,
    );
    const priceResult = (await priceLookup.json()) as { data?: { id: string }[] };
    const providerPriceId = priceResult.data?.[0]?.id;
    if (!providerPriceId) throw new Error("That plan price is not available yet.");

    const paddle = getPaddleClient(env);
    await paddle.subscriptions.update(row.paddle_subscription_id, {
      items: [{ priceId: providerPriceId, quantity: 1 }],
      prorationBillingMode: "prorated_immediately",
    });

    await logBillingEvent("plan_changed", {
      userId: context.userId,
      planKey: plan.planKey,
      env,
      metadata: { priceId: data.priceId },
    });
    return { ok: true };
  });

/* --------------------------------------------------------------- events */

export const recordBillingEvent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { event: string; planKey?: string; intervalKey?: string }) =>
    z
      .object({
        event: z.enum([
          "pricing_viewed",
          "plan_selected",
          "checkout_started",
          "checkout_cancelled",
          "checkout_failed",
        ]),
        planKey: z.string().max(40).optional(),
        intervalKey: z.string().max(10).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await logBillingEvent(data.event, {
      userId: context.userId,
      planKey: data.planKey ?? "",
      intervalKey: data.intervalKey ?? "",
    });
    return { ok: true };
  });
