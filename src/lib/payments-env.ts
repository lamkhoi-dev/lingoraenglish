/**
 * Which Stripe environment this deployment talks to.
 *
 * Decided at RUNTIME from the secret key's prefix (`sk_test_…` → "sandbox",
 * `sk_live_…` → "live"), so switching between test and live is only a change to
 * STRIPE_SECRET_KEY in the server environment — no rebuild, and no environment
 * value is ever accepted from the browser. "sandbox" is kept as the name of the
 * test environment because `subscriptions.environment` and `billing_events.environment`
 * already store that value.
 *
 * Server-only (reads process.env). The browser asks the server via
 * getPaymentEnvironment() in billing.functions.ts.
 */
export type PaymentsEnv = "sandbox" | "live";

export function getPaymentsEnv(): PaymentsEnv {
  const key = process.env["STRIPE_SECRET_KEY"] ?? "";
  return key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "live" : "sandbox";
}
