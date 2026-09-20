/**
 * Creates the Paddle products + prices the app sells, stamped with the
 * `lingora_key` custom_data the app looks them up by (see src/lib/paddle.server.ts,
 * catalogKeyOf / findPriceByKey).
 *
 * The catalogue below mirrors billing_plans on production (plan names, the
 * monthly/yearly price ids, amounts in USD cents, 7-day trial). If admins change
 * a price in /admin → Plans, change it here too — Paddle owns the real charge.
 *
 * One free trial per account: every plan price exists TWICE — with the 7-day trial (given to
 * accounts that have never subscribed) and a "<key>_notrial" twin without it (everyone else, and
 * every plan change). See NO_TRIAL_SUFFIX in src/lib/paddle.server.ts.
 *
 * Safe to re-run: anything already carrying the same lingora_key is left alone.
 * Dry-run unless --apply is passed.
 *
 *   node scripts/create-paddle-catalog.mjs                     # sandbox, dry-run
 *   node scripts/create-paddle-catalog.mjs --apply             # sandbox, create
 *   node scripts/create-paddle-catalog.mjs --env live --apply  # LIVE (real account!)
 *
 * Reads PADDLE_SANDBOX_API_KEY / PADDLE_LIVE_API_KEY from --env-file
 * (default .env.docker). The key is never printed.
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const envName = opt("--env", "sandbox");
if (!["sandbox", "live"].includes(envName)) throw new Error("--env must be sandbox or live");
const apply = flag("--apply");
const envFile = opt("--env-file", ".env.docker");

const KEY_FIELD = "lingora_key";
const BASE = envName === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";

const env = Object.fromEntries(
  fs
    .readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const apiKey = env[envName === "sandbox" ? "PADDLE_SANDBOX_API_KEY" : "PADDLE_LIVE_API_KEY"];
if (!apiKey) throw new Error(`No API key for ${envName} in ${envFile}`);

const PRODUCTS = [
  { key: "lily_premium", name: "LiLy AI Premium", description: "Premium plan for the Lingora English AI speaking coach." },
  // The live account (created by Lovable) keys this product "lily_ielts_pro"; sandbox uses "lily_ielts".
  { key: "lily_ielts", aliases: ["lily_ielts_pro"], name: "LiLy AI IELTS Pro", description: "IELTS Pro plan for the Lingora English AI speaking coach." },
];
const TRIAL = { interval: "day", frequency: 7 };
const BASE_PRICES = [
  { key: "lily_premium_monthly", product: "lily_premium", amount: "999", interval: "month", label: "Premium — monthly" },
  { key: "lily_premium_yearly", product: "lily_premium", amount: "7999", interval: "year", label: "Premium — yearly" },
  { key: "lily_ielts_monthly", product: "lily_ielts", amount: "1999", interval: "month", label: "IELTS Pro — monthly" },
  { key: "lily_ielts_yearly", product: "lily_ielts", amount: "15999", interval: "year", label: "IELTS Pro — yearly" },
];
const PRICES = BASE_PRICES.flatMap((p) => [
  { ...p, trial: true },
  { ...p, key: `${p.key}_notrial`, label: `${p.label} (no trial)`, trial: false },
]);

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json?.error ?? json)}`);
  return json;
}

async function listAll(path) {
  const out = [];
  let after;
  for (let page = 0; page < 10; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const json = await call("GET", `${path}${sep}per_page=200${after ? `&after=${after}` : ""}`);
    out.push(...(json.data ?? []));
    if (!json.meta?.pagination?.has_more || !json.data?.length) break;
    after = json.data[json.data.length - 1].id;
  }
  return out;
}

const keyOf = (e) => e?.custom_data?.[KEY_FIELD] ?? e?.import_meta?.external_id ?? null;

console.log(`Paddle ${envName.toUpperCase()}  |  ${apply ? "APPLY (will create)" : "dry-run (no changes)"}\n`);
if (envName === "live" && apply) console.log("!! LIVE account — these are real products customers will be charged for.\n");

const products = await listAll("/products?status=active");
const prices = await listAll("/prices?status=active");
const productIdByKey = new Map(products.filter((p) => keyOf(p)).map((p) => [keyOf(p), p.id]));
const priceByKey = new Map(prices.filter((p) => keyOf(p)).map((p) => [keyOf(p), p]));

let created = 0;
for (const p of PRODUCTS) {
  const found = [p.key, ...(p.aliases ?? [])].find((k) => productIdByKey.has(k));
  if (found) {
    productIdByKey.set(p.key, productIdByKey.get(found));
    console.log(`  product ${p.key.padEnd(24)} exists  (${productIdByKey.get(p.key)}${found !== p.key ? `, keyed "${found}"` : ""})`);
    continue;
  }
  if (!apply) {
    console.log(`  product ${p.key.padEnd(24)} WOULD CREATE "${p.name}"`);
    productIdByKey.set(p.key, `<new:${p.key}>`);
    continue;
  }
  const res = await call("POST", "/products", {
    name: p.name,
    description: p.description,
    tax_category: "standard",
    custom_data: { [KEY_FIELD]: p.key },
  });
  productIdByKey.set(p.key, res.data.id);
  created++;
  console.log(`  product ${p.key.padEnd(24)} CREATED (${res.data.id})`);
}

for (const p of PRICES) {
  const existing = priceByKey.get(p.key);
  if (existing) {
    console.log(`  price   ${p.key.padEnd(30)} exists  (${existing.id}, ${existing.unit_price?.amount} ${existing.unit_price?.currency_code}, ${existing.trial_period ? "trial" : "no trial"})`);
    continue;
  }
  if (!apply) {
    console.log(`  price   ${p.key.padEnd(30)} WOULD CREATE ${p.label}: ${(Number(p.amount) / 100).toFixed(2)} USD / ${p.interval}, ${p.trial ? "7-day trial" : "NO trial"}`);
    continue;
  }
  const res = await call("POST", "/prices", {
    product_id: productIdByKey.get(p.product),
    description: p.label,
    name: p.label,
    unit_price: { amount: p.amount, currency_code: "USD" },
    billing_cycle: { interval: p.interval, frequency: 1 },
    ...(p.trial ? { trial_period: TRIAL } : {}),
    custom_data: { [KEY_FIELD]: p.key },
  });
  created++;
  console.log(`  price   ${p.key.padEnd(30)} CREATED (${res.data.id})`);
}

console.log(apply ? `\nDone. Created ${created} item(s).` : "\nDry-run only — re-run with --apply to create the items marked WOULD CREATE.");
