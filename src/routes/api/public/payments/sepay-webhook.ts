/**
 * SePay webhook — fires when a transfer lands in the watched bank account. Verified with
 * HMAC-SHA256 (see sepay.server.ts); fails closed (rejects every request) until
 * SEPAY_WEBHOOK_SECRET is set, so no unverified request can ever activate a subscription.
 */
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { withAdmin } from "@/db";
import { bankTransferOrders, processedWebhookEvents } from "@/db/schema/schema";
import { activateBankTransferOrder } from "@/lib/bank-transfer.functions";
import { extractReferenceCode, getSepayWebhookSecret, type SepayWebhookPayload, verifySepayRequest } from "@/lib/sepay.server";

/** Composite (eventId, environment) primary key shared with the Stripe webhook — the "sepay_"
 * prefix keeps SePay's small integer transaction ids from ever colliding with a Stripe "evt_…"
 * id, and "sepay" as the environment keeps this dedup table separate from Stripe's sandbox/live. */
async function claimEvent(sepayTransactionId: number): Promise<boolean> {
  const eventId = `sepay_${sepayTransactionId}`;
  const claimed = await withAdmin((db) =>
    db
      .insert(processedWebhookEvents)
      .values({ eventId, eventType: "sepay.transfer.in", environment: "sepay" })
      .onConflictDoNothing()
      .returning({ eventId: processedWebhookEvents.eventId }),
  );
  return claimed.length > 0;
}

async function releaseEvent(sepayTransactionId: number) {
  await withAdmin((db) =>
    db
      .delete(processedWebhookEvents)
      .where(and(eq(processedWebhookEvents.eventId, `sepay_${sepayTransactionId}`), eq(processedWebhookEvents.environment, "sepay"))),
  );
}

async function handleWebhook(req: Request): Promise<{ status: number; body: unknown }> {
  const rawBody = await req.text();
  const secret = getSepayWebhookSecret();
  if (!secret) {
    // No secret configured yet (waiting on the customer's SePay API key) — reject everything
    // rather than trust an unverified request. Confirm payments by hand in /admin meanwhile.
    console.warn("SePay webhook received but SEPAY_WEBHOOK_SECRET is not set — rejecting.");
    return { status: 400, body: { success: false, error: "webhook not configured" } };
  }
  const ok = verifySepayRequest(rawBody, req.headers, secret);
  if (!ok) return { status: 400, body: { success: false, error: "invalid signature or api key" } };

  const payload = JSON.parse(rawBody) as SepayWebhookPayload;
  if (payload.transferType !== "in") return { status: 200, body: { success: true } };

  if (!(await claimEvent(payload.id))) {
    console.log("Duplicate SePay transfer ignored:", payload.id);
    return { status: 200, body: { success: true } };
  }

  try {
    const referenceCode = extractReferenceCode(payload);
    if (!referenceCode) {
      console.warn("SePay transfer had no matching reference code", { id: payload.id, content: payload.content });
      return { status: 200, body: { success: true } };
    }

    const rows = await withAdmin((db) =>
      db.select().from(bankTransferOrders).where(eq(bankTransferOrders.referenceCode, referenceCode)).limit(1),
    );
    const order = rows[0];
    if (!order) {
      console.warn("SePay transfer's reference code matched no order", { id: payload.id, referenceCode });
      return { status: 200, body: { success: true } };
    }
    if (order.status !== "pending") {
      // Already paid (retry) or expired/cancelled — nothing to do, but still a 200 so SePay stops retrying.
      return { status: 200, body: { success: true } };
    }
    if (payload.transferAmount !== order.amountVnd) {
      console.warn("SePay transfer amount does not match the order — leaving it pending for manual review", {
        id: payload.id,
        referenceCode,
        expected: order.amountVnd,
        got: payload.transferAmount,
      });
      return { status: 200, body: { success: true } };
    }

    await activateBankTransferOrder(order.id, String(payload.id));
    return { status: 200, body: { success: true } };
  } catch (error) {
    await releaseEvent(payload.id);
    throw error;
  }
}

export const Route = createFileRoute("/api/public/payments/sepay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { status, body } = await handleWebhook(request);
          return Response.json(body, { status });
        } catch (error) {
          console.error("SePay webhook error:", error);
          return Response.json({ success: false }, { status: 400 });
        }
      },
    },
  },
});
