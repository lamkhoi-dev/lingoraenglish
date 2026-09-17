/**
 * Payment provider webhook — the single source of truth for subscription state.
 * Every request's signature is verified before anything is written.
 */
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { withAdmin } from "@/db";
import { processedWebhookEvents, subscriptions } from "@/db/schema/schema";
import { logBillingEvent } from "@/lib/entitlements.server";
import { EventName, verifyWebhook, type PaddleEnv } from "@/lib/paddle.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Claims one provider event. Paddle redelivers whenever this endpoint times
 * out or answers non-2xx (which it does on any handler error), so a delivery
 * we have already applied must do nothing the second time — Yêu cầu 11:
 * "gửi lại cùng một thông báo thanh toán nhiều lần không làm sai dữ liệu".
 * Returns false when the event was processed before.
 */
async function claimEvent(eventId: string, eventType: string, env: PaddleEnv): Promise<boolean> {
  const claimed = await withAdmin((db) =>
    db
      .insert(processedWebhookEvents)
      .values({ eventId, eventType, environment: env })
      .onConflictDoNothing()
      .returning({ eventId: processedWebhookEvents.eventId }),
  );
  return claimed.length > 0;
}

/** Hands the claim back when processing failed, so Paddle's retry still lands. */
async function releaseEvent(eventId: string, env: PaddleEnv) {
  await withAdmin((db) =>
    db
      .delete(processedWebhookEvents)
      .where(
        and(
          eq(processedWebhookEvents.eventId, eventId),
          eq(processedWebhookEvents.environment, env),
        ),
      ),
  );
}

/**
 * Re-reads the subscription from the provider and upserts it. Throwing is the
 * point: the caller's claim is released and Paddle retries, rather than the
 * event being lost because we could not reach the provider right now.
 */
async function backfillFromProvider(
  subscriptionId: string,
  env: PaddleEnv,
  fallbackUserId?: string,
) {
  const { syncSubscriptionFromProvider } = await import("@/lib/billing-sync.server");
  await syncSubscriptionFromProvider(subscriptionId, env, fallbackUserId);
}

/** Renewals may arrive without customData — fall back to the subscription's owner. */
async function userIdForSubscription(
  subscriptionId: string,
  env: PaddleEnv,
): Promise<string | null> {
  const rows = await withAdmin((db) =>
    db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.paddleSubscriptionId, subscriptionId),
          eq(subscriptions.environment, env),
        ),
      )
      .limit(1),
  );
  return rows[0]?.userId ?? null;
}

async function handleSubscriptionCreated(data: any, env: PaddleEnv) {
  const userId = data.customData?.userId as string | undefined;
  if (!userId) {
    console.error("No userId in customData for subscription", data.id);
    return;
  }

  const item = data.items?.[0];
  const priceId = item?.price?.importMeta?.externalId;
  const productId = item?.product?.importMeta?.externalId;
  if (!priceId || !productId) {
    console.warn("Skipping subscription: missing importMeta.externalId", {
      rawPriceId: item?.price?.id,
      rawProductId: item?.product?.id,
    });
    return;
  }

  const row = {
    userId,
    paddleSubscriptionId: data.id as string,
    paddleCustomerId: data.customerId as string,
    productId: productId as string,
    priceId: priceId as string,
    status: data.status as string,
    billingInterval: item?.price?.billingCycle?.interval ?? "month",
    currency: item?.price?.unitPrice?.currencyCode ?? "USD",
    amount: Number(item?.price?.unitPrice?.amount ?? 0),
    currentPeriodStart: data.currentBillingPeriod?.startsAt ?? null,
    currentPeriodEnd: data.currentBillingPeriod?.endsAt ?? null,
    // The signup date /account must show (Yêu cầu 12) — not the current period.
    startedAt: data.startedAt ?? data.firstBilledAt ?? null,
    cancelAtPeriodEnd: data.scheduledChange?.action === "cancel",
    scheduledChange: data.scheduledChange?.action ?? "",
    trialEndsAt: data.trialDates?.endsAt ?? null,
    environment: env,
    updatedAt: new Date().toISOString(),
  };
  await withAdmin((db) =>
    db.insert(subscriptions).values(row).onConflictDoUpdate({ target: subscriptions.paddleSubscriptionId, set: row }),
  );

  await logBillingEvent(data.status === "trialing" ? "trial_started" : "subscription_created", {
    userId,
    env,
    metadata: { priceId, productId, subscriptionId: data.id },
  });
}

async function handleSubscriptionUpdated(data: any, env: PaddleEnv) {
  const item = data.items?.[0];
  const priceId = item?.price?.importMeta?.externalId;

  const updated = await withAdmin((db) =>
    db
      .update(subscriptions)
      .set({
        status: data.status,
        ...(priceId ? { priceId } : {}),
        ...(item?.price?.billingCycle?.interval ? { billingInterval: item.price.billingCycle.interval } : {}),
        ...(item?.price?.unitPrice
          ? { currency: item.price.unitPrice.currencyCode ?? "USD", amount: Number(item.price.unitPrice.amount ?? 0) }
          : {}),
        currentPeriodStart: data.currentBillingPeriod?.startsAt ?? null,
        currentPeriodEnd: data.currentBillingPeriod?.endsAt ?? null,
        // Conditional on purpose: a payload without it must never blank out the
        // signup date, and Paddle never changes it once set (Yêu cầu 12).
        ...(data.startedAt || data.firstBilledAt
          ? { startedAt: data.startedAt ?? data.firstBilledAt }
          : {}),
        cancelAtPeriodEnd: data.scheduledChange?.action === "cancel",
        scheduledChange: data.scheduledChange?.action ?? "",
        trialEndsAt: data.trialDates?.endsAt ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(subscriptions.paddleSubscriptionId, data.id), eq(subscriptions.environment, env)))
      .returning({ id: subscriptions.id }),
  );

  // Paddle does not promise delivery order, so an update can land before the
  // subscription.created that would have inserted the row. Updating nothing
  // would drop the event for good and leave a paying learner on free.
  if (updated.length === 0) {
    await backfillFromProvider(data.id, env, data.customData?.userId);
  }

  await logBillingEvent("subscription_updated", {
    userId: data.customData?.userId ?? null,
    env,
    metadata: { status: data.status, subscriptionId: data.id },
  });
}

async function handleSubscriptionCanceled(data: any, env: PaddleEnv) {
  const updated = await withAdmin((db) =>
    db
      .update(subscriptions)
      .set({ status: "canceled", updatedAt: new Date().toISOString() })
      .where(and(eq(subscriptions.paddleSubscriptionId, data.id), eq(subscriptions.environment, env)))
      .returning({ id: subscriptions.id }),
  );

  if (updated.length === 0) {
    await backfillFromProvider(data.id, env, data.customData?.userId);
  }

  await logBillingEvent("subscription_cancelled", { userId: data.customData?.userId ?? null, env, metadata: { subscriptionId: data.id } });
}

async function handleTransaction(event: string, data: any, env: PaddleEnv) {
  const subscriptionId = (data.subscriptionId as string | null) ?? null;
  const userId =
    (data.customData?.userId as string | undefined) ??
    (subscriptionId ? await userIdForSubscription(subscriptionId, env) : null);

  const totals = data.details?.totals;
  const price = data.items?.[0]?.price;
  const method = data.payments?.[0]?.methodDetails;

  await logBillingEvent(event, {
    userId,
    env,
    metadata: {
      transactionId: data.id,
      subscriptionId,
      status: data.status,
      currency: data.currencyCode,
      total: totals?.total ?? null,
      // Everything /billing's history table renders, kept here so the learner
      // can still read their history while the provider is unreachable
      // (Yêu cầu 11) — listMyPayments falls back to these rows.
      subtotal: totals?.subtotal ?? null,
      tax: totals?.tax ?? null,
      billedAt: data.billedAt ?? null,
      invoiceNumber: data.invoiceNumber ?? null,
      description: price?.description ?? price?.name ?? "",
      paymentMethodType: method?.type ?? null,
      cardBrand: method?.card?.type ?? null,
      cardLast4: method?.card?.last4 ?? null,
    },
  });

  // A completed renewal can carry fresh period dates before subscription.updated
  // arrives — keep the row current so access never lapses for a paid learner.
  if (event === "payment_succeeded" && data.subscriptionId) {
    try {
      const { syncSubscriptionFromProvider } = await import("@/lib/billing-sync.server");
      await syncSubscriptionFromProvider(data.subscriptionId, env);
    } catch (error) {
      console.error("Subscription re-sync failed", error);
    }
  }
}

async function handleWebhook(req: Request, env: PaddleEnv) {
  const event = await verifyWebhook(req, env);

  if (!(await claimEvent(event.eventId, event.eventType, env))) {
    console.log("Duplicate payment event ignored:", event.eventId);
    return;
  }

  try {
    switch (event.eventType) {
      case EventName.SubscriptionCreated:
        await handleSubscriptionCreated(event.data, env);
        break;
      case EventName.SubscriptionUpdated:
        await handleSubscriptionUpdated(event.data, env);
        break;
      case EventName.SubscriptionCanceled:
        await handleSubscriptionCanceled(event.data, env);
        break;
      case EventName.TransactionCompleted:
        await handleTransaction("payment_succeeded", event.data, env);
        break;
      case EventName.TransactionPaymentFailed:
        await handleTransaction("payment_failed", event.data, env);
        break;
      default:
        console.log("Unhandled payment event:", event.eventType);
    }
  } catch (error) {
    await releaseEvent(event.eventId, env);
    throw error;
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const env = (url.searchParams.get("env") || "sandbox") as PaddleEnv;
        try {
          await handleWebhook(request, env);
          return Response.json({ received: true });
        } catch (error) {
          console.error("Webhook error:", error);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
