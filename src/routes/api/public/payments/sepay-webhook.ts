/**
 * SePay webhook — fires when a transfer lands in the watched bank account. Verified with
 * HMAC-SHA256 or the API key (see sepay.server.ts); fails closed (rejects every request) until
 * SEPAY_WEBHOOK_SECRET is set, so no unverified request can ever activate a subscription.
 *
 * Matching and activation live in bank-transfer.server.ts (settleSepayTransfer), shared with the
 * reconciliation job that polls SePay — whichever sees a transfer first settles it, the other skips it.
 */
import { createFileRoute } from "@tanstack/react-router";

import { settleSepayTransfer } from "@/lib/bank-transfer.server";
import {
  getSepayWebhookSecret,
  type SepayWebhookPayload,
  verifySepayRequest,
} from "@/lib/sepay.server";

async function handleWebhook(req: Request): Promise<{ status: number; body: unknown }> {
  const rawBody = await req.text();
  const secret = getSepayWebhookSecret();
  if (!secret) {
    // No secret configured — reject everything rather than trust an unverified request.
    console.warn("SePay webhook received but SEPAY_WEBHOOK_SECRET is not set — rejecting.");
    return { status: 400, body: { success: false, error: "webhook not configured" } };
  }
  const ok = verifySepayRequest(rawBody, req.headers, secret);
  if (!ok) {
    console.warn("[sepay] webhook rejected: invalid signature or api key");
    return { status: 400, body: { success: false, error: "invalid signature or api key" } };
  }

  const payload = JSON.parse(rawBody) as SepayWebhookPayload;
  if (payload.transferType !== "in") return { status: 200, body: { success: true } };

  // Every outcome — activated, duplicate, or left for the admin (wrong amount, no code…) — is a 200 with
  // success:true, which is what SePay needs to stop retrying. The admin panel lists anything unsettled.
  await settleSepayTransfer(
    {
      id: String(payload.id),
      amount: payload.transferAmount,
      content: payload.content ?? "",
      ...(payload.description ? { description: payload.description } : {}),
      code: payload.code ?? null,
    },
    "webhook",
  );
  return { status: 200, body: { success: true } };
}

export const Route = createFileRoute("/api/public/payments/sepay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { status, body } = await handleWebhook(request);
          return Response.json(body, { status });
        } catch (error) {
          // Not a 200, so SePay retries (up to 7 times over ~5 hours); the claim was released on failure.
          console.error("SePay webhook error:", error);
          return Response.json({ success: false }, { status: 400 });
        }
      },
    },
  },
});
