/**
 * Writes Stripe subscription state into the database.
 * Shared by the webhook handler, the checkout-success verification and the
 * cancel / keep / change-plan actions, so all of them derive access from Stripe,
 * never from the browser.
 */
import { withAdmin } from "@/db";
import { subscriptions } from "@/db/schema/schema";
import type { PaymentsEnv } from "./payments-env";

export async function syncSubscriptionFromProvider(
  subscriptionId: string,
  env: PaymentsEnv,
  fallbackUserId?: string,
) {
  const { stripeFetch, toIso } = await import("./stripe.server");
  const sub = await stripeFetch<import("./stripe.server").StripeSubscription>(
    "GET",
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );

  // Both are stamped on the subscription by our own checkout / plan change (see
  // createCheckoutSession, changeMyPlan) — Stripe carries them back to us verbatim.
  const userId = sub.metadata?.["userId"] ?? fallbackUserId;
  if (!userId) {
    console.warn("Subscription has no linked user", { subscriptionId });
    return;
  }
  const priceId = sub.metadata?.["priceId"];
  const productKey = sub.metadata?.["productKey"];
  if (!priceId || !productKey) {
    // A paid subscription we cannot map to a plan — loud on purpose: the learner paid and
    // would otherwise stay on Free with nothing in the logs.
    console.error("Skipping subscription: no priceId/productKey in its metadata", { subscriptionId });
    return;
  }

  const item = sub.items?.data?.[0];
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  // The billing period sits on the subscription in the API version we pin, and on the
  // item in newer ones — accept either so a version bump cannot silently blank the dates.
  const periodStart = sub.current_period_start ?? item?.current_period_start;
  const periodEnd = sub.current_period_end ?? item?.current_period_end;
  // A Stripe "canceled" subscription has really ended (cancelled from the Dashboard or after
  // the last paid period), so access must stop then — not at the period end it had been paid to.
  // The has_active_subscription() rule keeps access until current_period_end for "canceled".
  const endedAt = sub.status === "canceled" ? (sub.ended_at ?? sub.canceled_at ?? null) : null;
  const accessEnd = endedAt !== null ? Math.min(periodEnd ?? endedAt, endedAt) : periodEnd;

  const row = {
    userId,
    providerSubscriptionId: sub.id,
    providerCustomerId: customerId,
    productId: productKey,
    priceId,
    status: sub.status,
    billingInterval: item?.price?.recurring?.interval ?? "month",
    currency: (sub.currency ?? item?.price?.currency ?? "usd").toUpperCase(),
    amount: item?.price?.unit_amount ?? null,
    currentPeriodStart: toIso(periodStart),
    currentPeriodEnd: toIso(accessEnd),
    // Original signup date for /account (Yêu cầu 12), not the current period.
    startedAt: toIso(sub.start_date ?? sub.created),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    scheduledChange: sub.cancel_at_period_end ? "cancel" : "",
    trialEndsAt: toIso(sub.trial_end),
    environment: env,
    updatedAt: new Date().toISOString(),
  };
  await withAdmin((db) =>
    db
      .insert(subscriptions)
      .values(row)
      .onConflictDoUpdate({ target: subscriptions.providerSubscriptionId, set: row }),
  );
}
