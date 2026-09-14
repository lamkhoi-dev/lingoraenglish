/**
 * Payment provider webhook — the single source of truth for subscription state.
 * Every request's signature is verified before anything is written.
 */
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { withAdmin } from "@/db";
import { subscriptions } from "@/db/schema/schema";
import { logBillingEvent } from "@/lib/entitlements.server";
import { EventName, verifyWebhook, type PaddleEnv } from "@/lib/paddle.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

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

  await withAdmin((db) =>
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
        cancelAtPeriodEnd: data.scheduledChange?.action === "cancel",
        scheduledChange: data.scheduledChange?.action ?? "",
        trialEndsAt: data.trialDates?.endsAt ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(subscriptions.paddleSubscriptionId, data.id), eq(subscriptions.environment, env))),
  );

  await logBillingEvent("subscription_updated", {
    userId: data.customData?.userId ?? null,
    env,
    metadata: { status: data.status, subscriptionId: data.id },
  });
}

async function handleSubscriptionCanceled(data: any, env: PaddleEnv) {
  await withAdmin((db) =>
    db
      .update(subscriptions)
      .set({ status: "canceled", updatedAt: new Date().toISOString() })
      .where(and(eq(subscriptions.paddleSubscriptionId, data.id), eq(subscriptions.environment, env))),
  );

  await logBillingEvent("subscription_cancelled", { userId: data.customData?.userId ?? null, env, metadata: { subscriptionId: data.id } });
}

async function handleTransaction(event: string, data: any, env: PaddleEnv) {
  await logBillingEvent(event, {
    userId: data.customData?.userId ?? null,
    env,
    metadata: {
      transactionId: data.id,
      subscriptionId: data.subscriptionId ?? null,
      status: data.status,
      currency: data.currencyCode,
      total: data.details?.totals?.total ?? null,
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
