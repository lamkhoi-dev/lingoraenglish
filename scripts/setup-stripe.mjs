/**
 * One-time Stripe setup: registers the webhook endpoint that keeps subscriptions in sync
 * (src/routes/api/public/payments/webhook.ts) and stores its signing secret in your env file.
 *
 *   node scripts/setup-stripe.mjs --url https://lingoraenglishai.com/api/public/payments/webhook
 *   node scripts/setup-stripe.mjs --url <url> --recreate          # get a fresh signing secret
 *   node scripts/setup-stripe.mjs --url <url> --env-file .env.docker
 *
 * Test vs live follows STRIPE_SECRET_KEY in the env file (sk_test_… / sk_live_…), so run it once
 * per mode. Stripe only shows a signing secret when the endpoint is CREATED, so the secret is
 * written straight into STRIPE_WEBHOOK_SECRET in the env file and never printed. If the endpoint
 * already exists the script leaves it alone; pass --recreate to replace it (and get a new secret).
 *
 * Everything else Stripe needs (products, the tax rate, the billing-portal configuration) is
 * created on demand by the app itself the first time it is used.
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const url = opt("--url");
const envFile = opt("--env-file", ".env.docker");
const recreate = args.includes("--recreate");
if (!url || !/^https:\/\//.test(url)) throw new Error("--url must be the public https URL of the webhook route");

const API_VERSION = "2024-06-20"; // keep in step with STRIPE_API_VERSION in src/lib/stripe.server.ts
const EVENTS = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
const readVar = (name) => {
  const line = lines.find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, "") : "";
};
const key = readVar("STRIPE_SECRET_KEY");
if (!key) throw new Error(`STRIPE_SECRET_KEY is not set in ${envFile}`);
console.log(`Stripe ${key.startsWith("sk_live_") ? "LIVE" : "TEST"} mode  |  endpoint ${url}`);

const call = async (method, path, params) => {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const res = await fetch("https://api.stripe.com" + path, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": API_VERSION,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.error?.message}`);
  return json;
};

const existing = (await call("GET", "/v1/webhook_endpoints?limit=100")).data.filter((e) => e.url === url);
if (existing.length && !recreate) {
  console.log(`Endpoint already exists (${existing[0].id}, ${existing[0].status}). Nothing changed.`);
  console.log("Its signing secret cannot be read back — use --recreate if STRIPE_WEBHOOK_SECRET is missing or wrong.");
  process.exit(0);
}
for (const e of existing) {
  await call("DELETE", `/v1/webhook_endpoints/${e.id}`);
  console.log(`Removed old endpoint ${e.id}`);
}

const params = new URLSearchParams({ url, api_version: API_VERSION, description: "Lingora English subscriptions" });
EVENTS.forEach((event, i) => params.append(`enabled_events[${i}]`, event));
const res = await fetch("https://api.stripe.com/v1/webhook_endpoints", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
  body: params.toString(),
});
const created = await res.json();
if (!res.ok) throw new Error(`create endpoint -> ${res.status} ${created?.error?.message}`);

// Replace or append STRIPE_WEBHOOK_SECRET, keeping the file's own line endings.
const raw = fs.readFileSync(envFile, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const out = raw.split(/\r?\n/);
const i = out.findIndex((l) => l.startsWith("STRIPE_WEBHOOK_SECRET="));
if (i >= 0) out[i] = `STRIPE_WEBHOOK_SECRET=${created.secret}`;
else out.splice(out.length && out[out.length - 1] === "" ? out.length - 1 : out.length, 0, `STRIPE_WEBHOOK_SECRET=${created.secret}`);
fs.writeFileSync(envFile, out.join(eol));

console.log(`Created endpoint ${created.id} listening for: ${EVENTS.join(", ")}`);
console.log(`STRIPE_WEBHOOK_SECRET written to ${envFile} (not shown here).`);
