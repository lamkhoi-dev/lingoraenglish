/**
 * Stripe webhook — the single source of truth for subscription state.
 * Every request's signature is verified before anything is written.
 */
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { withAdmin } from "@/db";
import { processedWebhookEvents, subscriptions } from "@/db/schema/schema";
import { logBillingEvent } from "@/lib/entitlements.server";
import { getPaymentsEnv, type PaymentsEnv } from "@/lib/payments-env";
import { getStripeWebhookSecret, stripeFetch, toIso, verifyStripeSignature } from "@/lib/stripe.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Claims one provider event. Stripe redelivers whenever this endpoint times
 * out or answers non-2xx (which it does on any handler error), so a delivery
 * we have already applied must do nothing the second time — Yêu cầu 11:
 * "gửi lại cùng một thông báo thanh toán nhiều lần không làm sai dữ liệu".
 * Returns false when the event was processed before.
 */
async function claimEvent(eventId: string, eventType: string, env: PaymentsEnv): Promise<boolean> {
  const claimed = await withAdmin((db) =>
    db
      .insert(processedWebhookEvents)
      .values({ eventId, eventType, environment: env })
      .onConflictDoNothing()
      .returning({ eventId: processedWebhookEvents.eventId }),
  );
  return claimed.length > 0;
}

/** Hands the claim back when processing failed, so Stripe's retry still lands. */
async function releaseEvent(eventId: string, env: PaymentsEnv) {
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

/** Renewals and invoices may arrive without our metadata — fall back to the subscription's owner. */
async function userIdForSubscription(subscriptionId: string, env: PaymentsEnv): Promise<string | null> {
  const rows = await withAdmin((db) =>
    db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.providerSubscriptionId, subscriptionId),
          eq(subscriptions.environment, env),
        ),
      )
      .limit(1),
  );
  return rows[0]?.userId ?? null;
}

/**
 * Re-reads the subscription from Stripe and upserts it. Reading it back (instead of trusting the
 * event body) means an out-of-order or duplicated delivery can never overwrite newer state.
 * Throwing is the point: the caller's claim is released and Stripe retries.
 */
async function syncFromProvider(subscriptionId: string, env: PaymentsEnv, fallbackUserId?: string) {
  const { syncSubscriptionFromProvider } = await import("@/lib/billing-sync.server");
  await syncSubscriptionFromProvider(subscriptionId, env, fallbackUserId);
}

async function handleSubscription(type: string, sub: any, env: PaymentsEnv) {
  const userId = sub.metadata?.userId as string | undefined;
  await syncFromProvider(sub.id, env, userId);

  const metadata = { subscriptionId: sub.id, priceId: sub.metadata?.priceId ?? null, productId: sub.metadata?.productKey ?? null };
  if (type === "customer.subscription.created") {
    await logBillingEvent(sub.status === "trialing" ? "trial_started" : "subscription_created", {
      userId: userId ?? null,
      env,
      metadata,
    });
  } else if (type === "customer.subscription.deleted") {
    await logBillingEvent("subscription_cancelled", { userId: userId ?? null, env, metadata });
  } else {
    await logBillingEvent("subscription_updated", {
      userId: userId ?? null,
      env,
      metadata: { ...metadata, status: sub.status },
    });
  }
}

async function handleInvoice(event: string, invoice: any, env: PaymentsEnv) {
  const subscriptionId: string | null =
    typeof invoice.subscription === "string" ? invoice.subscription : (invoice.subscription?.id ?? null);
  const userId =
    (invoice.subscription_details?.metadata?.userId as string | undefined) ??
    (subscriptionId ? await userIdForSubscription(subscriptionId, env) : null);

  // Card brand / last four, kept so /billing's history stays readable while Stripe is down.
  // Only present on invoices that actually charged a card ($0 trial invoices have no charge).
  let paymentMethodType: string | null = null;
  let cardBrand: string | null = null;
  let cardLast4: string | null = null;
  if (typeof invoice.charge === "string") {
    try {
      const charge = await stripeFetch<any>("GET", `/v1/charges/${encodeURIComponent(invoice.charge)}`);
      paymentMethodType = charge.payment_method_details?.type ?? null;
      cardBrand = charge.payment_method_details?.card?.brand ?? null;
      cardLast4 = charge.payment_method_details?.card?.last4 ?? null;
    } catch (error) {
      console.error("Could not read the charge behind an invoice", error);
    }
  }

  await logBillingEvent(event, {
    userId,
    env,
    metadata: {
      transactionId: invoice.id,
      subscriptionId,
      status: invoice.status === "paid" ? "completed" : invoice.status,
      currency: String(invoice.currency ?? "usd").toUpperCase(),
      total: invoice.total != null ? String(invoice.total) : null,
      subtotal: invoice.subtotal != null ? String(invoice.subtotal) : null,
      tax: invoice.tax != null ? String(invoice.tax) : null,
      billedAt: toIso(invoice.status_transitions?.paid_at ?? invoice.created),
      invoiceNumber: invoice.number ?? null,
      description: String(invoice.lines?.data?.[0]?.description ?? "").replace(/^\d+\s*×\s*/, ""),
      paymentMethodType,
      cardBrand,
      cardLast4,
    },
  });

  // A paid renewal can carry fresh period dates before customer.subscription.updated arrives —
  // keep the row current so access never lapses for a paid learner.
  if (event === "payment_succeeded" && subscriptionId) {
    try {
      await syncFromProvider(subscriptionId, env, userId ?? undefined);
    } catch (error) {
      console.error("Subscription re-sync failed", error);
    }
  }
}

async function handleWebhook(req: Request) {
  const rawBody = await req.text();
  if (!verifyStripeSignature(rawBody, req.headers.get("stripe-signature"), getStripeWebhookSecret())) {
    throw new Error("Invalid webhook signature");
  }
  const event = JSON.parse(rawBody) as { id: string; type: string; livemode: boolean; data: { object: any } };
  const env: PaymentsEnv = event.livemode ? "live" : "sandbox";

  // A test-mode event reaching a live deployment (or the reverse) is a misconfiguration, not
  // something to write: acknowledge it so Stripe stops retrying, and leave the data alone.
  if (env !== getPaymentsEnv()) {
    console.warn("Ignoring a webhook from the other Stripe mode", { id: event.id, type: event.type, env });
    return;
  }

  if (!(await claimEvent(event.id, event.type, env))) {
    console.log("Duplicate payment event ignored:", event.id);
    return;
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscription(event.type, event.data.object, env);
        break;
      case "invoice.paid":
        await handleInvoice("payment_succeeded", event.data.object, env);
        break;
      case "invoice.payment_failed":
        await handleInvoice("payment_failed", event.data.object, env);
        break;
      default:
        console.log("Unhandled payment event:", event.type);
    }
  } catch (error) {
    await releaseEvent(event.id, env);
    throw error;
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await handleWebhook(request);
          return Response.json({ received: true });
        } catch (error) {
          console.error("Webhook error:", error);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
