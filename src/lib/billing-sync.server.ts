/**
 * Writes provider subscription state into the database.
 * Shared by the webhook handler and the success-page verification path so both
 * derive access from the provider, never from the browser.
 */
import { withAdmin } from "@/db";
import { subscriptions } from "@/db/schema/schema";
import type { PaddleEnv } from "./payments-env";

type PriceLike = {
  id?: string;
  product_id?: string;
  billing_cycle?: { interval?: string } | null;
  unit_price?: { amount?: string; currency_code?: string } | null;
  import_meta?: { external_id?: string | null } | null;
};

export async function syncSubscriptionFromProvider(
  subscriptionId: string,
  env: PaddleEnv,
  fallbackUserId?: string,
) {
  const { paddleFetch } = await import("./paddle.server");
  const response = await paddleFetch(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  if (!response.ok) throw new Error("Could not read the subscription from the payment provider.");

  const result = (await response.json()) as {
    data?: {
      id: string;
      customer_id: string;
      status: string;
      custom_data?: { userId?: string } | null;
      started_at?: string | null;
      first_billed_at?: string | null;
      current_billing_period?: { starts_at?: string; ends_at?: string } | null;
      scheduled_change?: { action?: string } | null;
      trial_dates?: { ends_at?: string } | null;
      items?: {
        price?: PriceLike;
        product?: { import_meta?: { external_id?: string | null } | null };
      }[];
    };
  };

  const sub = result.data;
  if (!sub) throw new Error("Subscription not found.");

  const userId = sub.custom_data?.userId ?? fallbackUserId;
  if (!userId) {
    console.warn("Subscription has no linked user", { subscriptionId });
    return;
  }

  const item = sub.items?.[0];
  const priceId = item?.price?.import_meta?.external_id;
  const productId = item?.product?.import_meta?.external_id;
  if (!priceId || !productId) {
    console.warn("Skipping subscription: missing importMeta.externalId", {
      rawPriceId: item?.price?.id,
    });
    return;
  }

  const row = {
    userId,
    paddleSubscriptionId: sub.id,
    paddleCustomerId: sub.customer_id,
    productId,
    priceId,
    status: sub.status,
    billingInterval: item?.price?.billing_cycle?.interval ?? "month",
    currency: item?.price?.unit_price?.currency_code ?? "USD",
    amount: Number(item?.price?.unit_price?.amount ?? 0),
    currentPeriodStart: sub.current_billing_period?.starts_at ?? null,
    currentPeriodEnd: sub.current_billing_period?.ends_at ?? null,
    // Original signup date for /account (Yêu cầu 12), not the current period.
    startedAt: sub.started_at ?? sub.first_billed_at ?? null,
    cancelAtPeriodEnd: sub.scheduled_change?.action === "cancel",
    scheduledChange: sub.scheduled_change?.action ?? "",
    trialEndsAt: sub.trial_dates?.ends_at ?? null,
    environment: env,
    updatedAt: new Date().toISOString(),
  };
  await withAdmin((db) =>
    db
      .insert(subscriptions)
      .values(row)
      .onConflictDoUpdate({ target: subscriptions.paddleSubscriptionId, set: row }),
  );
}
