/**
 * Learner-facing billing server functions.
 *
 * Nothing here trusts the browser: the payment environment comes from the server's own Stripe
 * key, plan and price data comes from the database, and every mutation is scoped to the
 * authenticated user's own subscription.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { withAdmin, withAnon, withUser } from "@/db";
import { billingEvents, billingPlans, profiles, subscriptions } from "@/db/schema/schema";
import { requireAuth } from "@/lib/require-auth";
import { getEntitlement, logBillingEvent, MONTHLY_QUOTA_KEYS } from "./entitlements.server";
import { getPaymentsEnv, type PaymentsEnv } from "./payments-env";

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

/** The active paid plan a website price id ("lily_premium_monthly"…) belongs to, plus which billing
 * interval that id stands for. billing_plans is the only source of amounts — Stripe holds no
 * catalogue of prices, so what the page shows and what is charged cannot differ. */
async function findActivePlanByPriceId(priceId: string) {
  const rows = await withAnon((db) => db.select().from(billingPlans).where(eq(billingPlans.isActive, true)));
  const plan = rows.find((p) => p.monthlyPriceId === priceId || p.yearlyPriceId === priceId);
  if (!plan || plan.tier === "free") return null;
  const interval = plan.yearlyPriceId === priceId ? ("year" as const) : ("month" as const);
  const amount = interval === "year" ? plan.yearlyAmount : plan.monthlyAmount;
  if (!amount || amount <= 0) return null;
  return { plan, interval, amount };
}

/** Which payment environment the server is wired to — for the test-mode banner. */
export const getPaymentEnvironment = createServerFn({ method: "GET" }).handler(async () => ({
  environment: getPaymentsEnv(),
}));

/* ------------------------------------------------------- my subscription */

// snake_case to match what billing.tsx/membership-panel.tsx already expect —
// was a direct Supabase `.select("*")` response.
function toSubscriptionRow(row: typeof subscriptions.$inferSelect) {
  return {
    id: row.id,
    user_id: row.userId,
    provider_subscription_id: row.providerSubscriptionId,
    provider_customer_id: row.providerCustomerId,
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

async function myLatestSubscription(userId: string, env: PaymentsEnv) {
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

async function requireOwnSubscription(userId: string, env: PaymentsEnv) {
  const row = await myLatestSubscription(userId, env);
  if (!row) throw new Error("No subscription found for your account.");
  return { row, env };
}

export const getMyBilling = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const env = getPaymentsEnv();
    const [entitlement, latest] = await Promise.all([
      getEntitlement(context.userId, env),
      myLatestSubscription(context.userId, env),
    ]);
    // A subscription that has ended is history, not something to manage: the pages then offer
    // the plans again. The trial rule still looks at the full history.
    const ended =
      latest?.status === "canceled" &&
      (!latest.current_period_end || new Date(latest.current_period_end).getTime() <= Date.now());
    // One free trial per account: eligible only if it has never had a subscription here.
    return { entitlement, subscription: ended ? null : latest, trialEligible: latest === null };
  });

/* --------------------------------------------------------------- checkout */

type PromotionCode = {
  id: string;
  code: string;
  active: boolean;
  expires_at?: number | null;
  max_redemptions?: number | null;
  times_redeemed?: number;
  coupon: {
    valid: boolean;
    name?: string | null;
    percent_off?: number | null;
    amount_off?: number | null;
    currency?: string | null;
    duration?: string;
    applies_to?: { products?: string[] } | null;
  };
};

type PromotionLookup =
  | { ok: true; promo: PromotionCode }
  | { ok: false; reason: "unknown" | "expired" | "not_applicable" };

/** Finds a customer-facing promotion code and checks it can be used on this plan's product. */
async function lookupPromotionCode(code: string, productId: string): Promise<PromotionLookup> {
  const { stripeFetch } = await import("./stripe.server");
  const list = await stripeFetch<{ data: PromotionCode[] }>("GET", "/v1/promotion_codes", {
    code,
    active: true,
    limit: 1,
    expand: ["data.coupon"],
  });
  const promo = list.data[0];
  if (!promo || !promo.active) return { ok: false, reason: "unknown" };
  if (!promo.coupon.valid) return { ok: false, reason: "expired" };
  if (promo.expires_at && promo.expires_at * 1000 < Date.now()) return { ok: false, reason: "expired" };
  if (promo.max_redemptions && (promo.times_redeemed ?? 0) >= promo.max_redemptions) {
    return { ok: false, reason: "unknown" };
  }
  const restrictedTo = promo.coupon.applies_to?.products;
  if (restrictedTo?.length && !restrictedTo.includes(productId)) return { ok: false, reason: "not_applicable" };
  return { ok: true, promo };
}

/**
 * Starts checkout on Stripe's hosted page and returns its URL. Everything that matters is decided
 * here, on the server, from our own records — never from anything the browser sends:
 *  - the amount comes from billing_plans;
 *  - one free trial per account: only an account that has never had a subscription in this
 *    environment gets the trial (a canceled or expired one counts as having had it);
 *  - the flat tax rate is attached to the line item.
 * The subscription is stamped with our user/plan ids so the webhook can map it back.
 */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { priceId: string; coupon?: string | null }) =>
    z
      .object({
        priceId: z.string().min(1).max(80),
        coupon: z
          .string()
          .max(32)
          .regex(/^[A-Za-z0-9]+$/, "Coupon codes are letters and numbers only.")
          .nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const env = getPaymentsEnv();
    const found = await findActivePlanByPriceId(data.priceId);
    if (!found) throw new Error("That plan is not available.");
    const { plan, interval, amount } = found;

    const existing = await myLatestSubscription(context.userId, env);
    const trialDays = existing === null && plan.trialEnabled ? plan.trialDays : 0;

    const { stripeFetch, ensureProductId, ensureTaxRateId, appUrl } = await import("./stripe.server");
    const [productId, taxRateId, profileRows] = await Promise.all([
      ensureProductId(plan.tier, plan.name),
      ensureTaxRateId(),
      withUser(context.userId, (db) =>
        db.select({ email: profiles.email }).from(profiles).where(eq(profiles.id, context.userId)).limit(1),
      ),
    ]);
    const email = profileRows[0]?.email ?? "";

    let promotionCodeId: string | undefined;
    if (data.coupon) {
      const lookup = await lookupPromotionCode(data.coupon, productId);
      if (!lookup.ok) throw new Error("That coupon can't be used for this plan.");
      promotionCodeId = lookup.promo.id;
    }

    const stamp = { userId: context.userId, planKey: plan.planKey, priceId: data.priceId, productKey: plan.tier };
    const session = await stripeFetch<{ url: string | null }>("POST", "/v1/checkout/sessions", {
      mode: "subscription",
      client_reference_id: context.userId,
      // Reuse the Stripe customer when this learner already has one (keeps invoices and the
      // billing portal in one place); otherwise let Checkout create it from their email.
      ...(existing ? { customer: existing.provider_customer_id } : email ? { customer_email: email } : {}),
      line_items: [
        {
          quantity: 1,
          tax_rates: [taxRateId],
          price_data: {
            currency: plan.currency.toLowerCase(),
            product: productId,
            unit_amount: amount,
            recurring: { interval },
          },
        },
      ],
      subscription_data: { metadata: stamp, ...(trialDays > 0 ? { trial_period_days: trialDays } : {}) },
      metadata: stamp,
      // Card up front even for the trial, so it converts without a second step.
      payment_method_collection: "always",
      ...(promotionCodeId ? { discounts: [{ promotion_code: promotionCodeId }] } : {}),
      // This account has Stripe "Managed Payments" (Stripe as merchant of record) on by default.
      // We sell as ourselves and add our own flat tax rate, so switch it off for these sessions.
      managed_payments: { enabled: false },
      success_url: `${appUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/billing/cancelled`,
    });
    if (!session.url) throw new Error("Could not start checkout — please try again.");
    return { url: session.url };
  });

/* --------------------------------------------------------------- history */

/**
 * Payment history. Stripe is asked first — it is the authority, and it knows about refunds and
 * credits we never store. When it cannot be reached we fall back to what the (signature-verified)
 * webhook already wrote, because Yêu cầu 11 requires the history to stay readable while the payment
 * gateway is temporarily down. `stale` says which of the two the learner is looking at.
 * Card data is never stored — only the brand and last four the provider sent.
 */
export const listMyPayments = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const env = getPaymentsEnv();
    const sub = await myLatestSubscription(context.userId, env);
    const customerId = sub?.provider_customer_id;

    if (customerId) {
      try {
        const { stripeFetch, toMajorUnit, toIso } = await import("./stripe.server");
        const list = await stripeFetch<{ data: RawInvoice[] }>("GET", "/v1/invoices", {
          customer: customerId,
          limit: 50,
          expand: ["data.charge"],
        });
        // Drafts and voided invoices were never a payment.
        const payments: PaymentRow[] = list.data
          .filter((inv) => !UNPAID_STATUSES.has(inv.status))
          .map((inv) => {
            const currency = inv.currency.toUpperCase();
            const charge = typeof inv.charge === "object" && inv.charge ? inv.charge : null;
            const card = charge?.payment_method_details?.card;
            return {
              id: inv.id,
              date: toIso(inv.status_transitions?.paid_at ?? inv.created) ?? new Date().toISOString(),
              status: displayStatus(inv.status),
              currency,
              subtotal: toMajorUnit(inv.subtotal, currency),
              tax: toMajorUnit(inv.tax ?? 0, currency),
              total: toMajorUnit(inv.total, currency),
              description: cleanDescription(inv.lines?.data?.[0]?.description),
              invoiceNumber: inv.number ?? null,
              paymentMethod: formatPaymentMethod(charge?.payment_method_details?.type, card?.brand, card?.last4),
            };
          });
        return { payments, stale: false };
      } catch (error) {
        console.error("Payment history: provider unreachable", error);
      }
    }

    return { payments: await storedPayments(context.userId, env), stale: Boolean(customerId) };
  });

const UNPAID_STATUSES = new Set(["draft", "void"]);

/** The history table shows one vocabulary; Stripe's invoice statuses are mapped onto it. */
function displayStatus(status: string): string {
  if (status === "paid") return "completed";
  if (status === "uncollectible") return "failed";
  return status;
}

/** Stripe describes a line as "1 × LiLy AI Premium (at $9.99 / month)". */
function cleanDescription(description: string | null | undefined): string {
  return (description ?? "").replace(/^\d+\s*×\s*/, "");
}

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
async function storedPayments(userId: string, env: PaymentsEnv): Promise<PaymentRow[]> {
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

  const { toMajorUnit } = await import("./stripe.server");
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

type RawInvoice = {
  id: string;
  status: string;
  currency: string;
  created: number;
  number?: string | null;
  subtotal: number;
  tax?: number | null;
  total: number;
  status_transitions?: { paid_at?: number | null };
  lines?: { data?: { description?: string | null }[] };
  charge?: { payment_method_details?: { type?: string; card?: { brand?: string; last4?: string } } } | string | null;
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

/** A receipt/invoice URL hosted by Stripe (never built by us). */
export const getInvoiceUrl = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { paymentId: string }) =>
    z.object({ paymentId: z.string().min(3).max(80) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const env = getPaymentsEnv();
    const sub = await myLatestSubscription(context.userId, env);
    const customerId = sub?.provider_customer_id;
    if (!customerId) throw new Error("No billing account found.");

    const { stripeFetch } = await import("./stripe.server");
    const invoice = await stripeFetch<{ customer?: string; hosted_invoice_url?: string | null; invoice_pdf?: string | null }>(
      "GET",
      `/v1/invoices/${encodeURIComponent(data.paymentId)}`,
    ).catch(() => null);
    // Confirm the invoice really belongs to this learner before revealing it.
    if (!invoice || invoice.customer !== customerId) throw new Error("Not found.");

    const url = invoice.hosted_invoice_url ?? invoice.invoice_pdf;
    if (!url) throw new Error("No invoice is available for this payment yet.");
    return { url };
  });

/* ------------------------------------------------- checkout confirmation */

/**
 * Called by the success page. Access is granted only when Stripe confirms the
 * subscription — never because the page was visited.
 */
export const verifyCheckout = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { sessionId?: string }) =>
    z.object({ sessionId: z.string().max(200).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const env = getPaymentsEnv();

    let row = await myLatestSubscription(context.userId, env);
    let confirmed = await hasLiveSubscription(context.userId, env);

    if (!confirmed && data.sessionId) {
      // Webhook may still be in flight: ask Stripe directly.
      const { stripeFetch } = await import("./stripe.server");
      const session = await stripeFetch<{
        status?: string;
        client_reference_id?: string | null;
        subscription?: string | null;
      }>("GET", `/v1/checkout/sessions/${encodeURIComponent(data.sessionId)}`).catch(() => null);
      const belongsToUser = session?.client_reference_id === context.userId;
      if (session?.status === "complete" && belongsToUser && session.subscription) {
        const { syncSubscriptionFromProvider } = await import("./billing-sync.server");
        await syncSubscriptionFromProvider(session.subscription, env, context.userId);
        row = await myLatestSubscription(context.userId, env);
        confirmed = await hasLiveSubscription(context.userId, env);
      }
    }

    const entitlement = await getEntitlement(context.userId, env);
    if (confirmed) {
      // subscriptionId is what idx_billing_events_activation_once dedupes on —
      // reloading /billing/success must not log a second activation.
      await logBillingEvent("subscription_activated", {
        userId: context.userId,
        planKey: entitlement.planKey,
        env,
        metadata: { subscriptionId: row?.provider_subscription_id ?? null },
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
async function hasLiveSubscription(userId: string, env: PaymentsEnv): Promise<boolean> {
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
    const found = await findActivePlanByPriceId(data.priceId);
    if (!found) return { valid: false as const, reason: "unknown" as const };

    const { ensureProductId, toMajorUnit } = await import("./stripe.server");
    const productId = await ensureProductId(found.plan.tier, found.plan.name);
    const lookup = await lookupPromotionCode(data.code, productId);
    if (!lookup.ok) return { valid: false as const, reason: lookup.reason };

    const { promo } = lookup;
    const isPercent = promo.coupon.percent_off != null;
    return {
      valid: true as const,
      code: promo.code,
      type: isPercent ? "percentage" : "flat",
      amount: isPercent
        ? String(promo.coupon.percent_off)
        : String(toMajorUnit(promo.coupon.amount_off ?? 0, promo.coupon.currency ?? "usd")),
      currency: promo.coupon.currency ? promo.coupon.currency.toUpperCase() : null,
      recurring: promo.coupon.duration !== "once",
      description: promo.coupon.name ?? "",
    };
  });

/* -------------------------------------------------- subscription actions */

/** Opens Stripe's hosted billing portal (payment method, invoices…). */
export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { row } = await requireOwnSubscription(context.userId, getPaymentsEnv());
    const { stripeFetch, appUrl, ensurePortalConfigurationId } = await import("./stripe.server");
    const session = await stripeFetch<{ url: string }>("POST", "/v1/billing_portal/sessions", {
      customer: row.provider_customer_id,
      configuration: await ensurePortalConfigurationId(),
      return_url: `${appUrl()}/billing`,
    });
    return { overviewUrl: session.url };
  });

/**
 * Pull Stripe's new subscription state into our row straight after a
 * cancel / keep / plan change. Without it /billing refetches before the webhook
 * (about a second later) has written anything and keeps showing the old buttons.
 * The webhook still arrives and is idempotent; a failure here must never fail
 * the action the learner just took.
 */
async function syncAfterAction(subscriptionId: string, env: PaymentsEnv, userId: string) {
  try {
    const { syncSubscriptionFromProvider } = await import("./billing-sync.server");
    await syncSubscriptionFromProvider(subscriptionId, env, userId);
  } catch (error) {
    console.error("Post-action subscription sync failed", error);
  }
}

export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { row, env } = await requireOwnSubscription(context.userId, getPaymentsEnv());
    const { stripeFetch } = await import("./stripe.server");
    // End of billing period — the learner keeps access to what they paid for (and, during a
    // trial, is never charged).
    await stripeFetch("POST", `/v1/subscriptions/${encodeURIComponent(row.provider_subscription_id)}`, {
      cancel_at_period_end: true,
    });
    await syncAfterAction(row.provider_subscription_id, env, context.userId);
    await logBillingEvent("subscription_cancel_requested", { userId: context.userId, env });
    return { ok: true };
  });

export const keepMySubscription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { row, env } = await requireOwnSubscription(context.userId, getPaymentsEnv());
    const { stripeFetch } = await import("./stripe.server");
    try {
      await stripeFetch("POST", `/v1/subscriptions/${encodeURIComponent(row.provider_subscription_id)}`, {
        cancel_at_period_end: false,
      });
    } catch {
      throw new Error("We could not restore your subscription — please try again.");
    }
    await syncAfterAction(row.provider_subscription_id, env, context.userId);
    await logBillingEvent("subscription_cancel_reverted", { userId: context.userId, env });
    return { ok: true };
  });

/** Upgrade or downgrade between paid plans through Stripe (works during a trial too). */
export const changeMyPlan = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { priceId: string }) =>
    z.object({ priceId: z.string().min(1).max(80) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { row, env } = await requireOwnSubscription(context.userId, getPaymentsEnv());

    const found = await findActivePlanByPriceId(data.priceId);
    if (!found) throw new Error("That plan is not available.");
    const { plan, interval, amount } = found;

    const { stripeFetch, ensureProductId, ensureTaxRateId } = await import("./stripe.server");
    const current = await stripeFetch<import("./stripe.server").StripeSubscription>(
      "GET",
      `/v1/subscriptions/${encodeURIComponent(row.provider_subscription_id)}`,
    );
    const itemId = current.items?.data?.[0]?.id;
    if (!itemId) throw new Error("Could not read your current plan.");

    const [productId, taxRateId] = await Promise.all([ensureProductId(plan.tier, plan.name), ensureTaxRateId()]);
    await stripeFetch("POST", `/v1/subscriptions/${encodeURIComponent(row.provider_subscription_id)}`, {
      items: [
        {
          id: itemId,
          tax_rates: [taxRateId],
          price_data: {
            currency: plan.currency.toLowerCase(),
            product: productId,
            unit_amount: amount,
            recurring: { interval },
          },
        },
      ],
      // The webhook maps the subscription back to a plan through this metadata.
      metadata: { priceId: data.priceId, planKey: plan.planKey, productKey: plan.tier },
      // Charge (or credit) the difference now rather than waiting for the next renewal, and
      // surface a declined card as an error instead of leaving a half-changed subscription.
      proration_behavior: "always_invoice",
      payment_behavior: "error_if_incomplete",
    });
    await syncAfterAction(row.provider_subscription_id, env, context.userId);

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
