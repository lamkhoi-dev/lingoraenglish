import { Environment, EventName, Paddle } from "@paddle/paddle-node-sdk";

import type { PaddleEnv } from "./payments-env";

export { EventName };
export type { PaddleEnv };

/** Paddle's own REST API — no gateway, no proxy, no third-party dependency. */
const REST_BASE_URL: Record<PaddleEnv, string> = {
  sandbox: "https://sandbox-api.paddle.com",
  live: "https://api.paddle.com",
};

const SDK_ENVIRONMENT: Record<PaddleEnv, Environment> = {
  sandbox: Environment.sandbox,
  live: Environment.production,
};

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
}

export function getPaddleApiKey(env: PaddleEnv): string {
  return env === "sandbox" ? getEnv("PADDLE_SANDBOX_API_KEY") : getEnv("PADDLE_LIVE_API_KEY");
}

export function getPaddleClient(env: PaddleEnv): Paddle {
  return new Paddle(getPaddleApiKey(env), { environment: SDK_ENVIRONMENT[env] });
}

/** For REST endpoints the SDK does not cover (external_id lookups, metrics…). */
export async function paddleFetch(
  env: PaddleEnv,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${REST_BASE_URL[env]}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getPaddleApiKey(env)}`,
      ...init?.headers,
    },
  });
}

/**
 * How a Paddle product/price maps back to our own ids ("lily_premium_monthly"…,
 * billing_plans.monthly_price_id / yearly_price_id).
 *
 * The key lives in the entity's `custom_data` — the one place Paddle lets us
 * write ourselves, from the API and the dashboard alike. `import_meta.external_id`
 * is the older mechanism (set by Paddle's importer, never by us), kept only as
 * a fallback so entities that already carry it keep working.
 * scripts/create-paddle-catalog.mjs stamps the key when it creates the catalog.
 */
export const CATALOG_KEY_FIELD = "lingora_key";

type CatalogEntity =
  | {
      // REST responses are snake_case, SDK webhook payloads camelCase — accept both.
      custom_data?: Record<string, unknown> | null;
      customData?: Record<string, unknown> | null;
      import_meta?: { external_id?: string | null } | null;
      importMeta?: { externalId?: string | null } | null;
    }
  | null
  | undefined;

export function catalogKeyOf(entity: CatalogEntity): string | null {
  const custom = (entity?.custom_data ?? entity?.customData)?.[CATALOG_KEY_FIELD];
  if (typeof custom === "string" && custom) return custom;
  return entity?.import_meta?.external_id ?? entity?.importMeta?.externalId ?? null;
}

/**
 * One free trial per account. The trial lives on the Paddle PRICE, so each plan price has a
 * twin without a trial whose key is the plan's price id + this suffix
 * ("lily_premium_monthly" → "lily_premium_monthly_notrial"). Checkout gives the trial price to
 * accounts that have never subscribed and the twin to everyone else; plan changes always use
 * the twin. Both twins are the same plan, so anything read back FROM Paddle must go through
 * planPriceKeyOf() before it is compared with billing_plans.
 */
export const NO_TRIAL_SUFFIX = "_notrial";

/** The billing_plans price id an entity stands for — the trial and no-trial twins both map to it. */
export function planPriceKeyOf(entity: CatalogEntity): string | null {
  const key = catalogKeyOf(entity);
  return key && key.endsWith(NO_TRIAL_SUFFIX) ? key.slice(0, -NO_TRIAL_SUFFIX.length) : key;
}

export type PaddlePrice = { id: string; product_id: string } & Exclude<CatalogEntity, null | undefined>;

/** The active Paddle price for one of our price ids, or null. An exact match on
 * the key — never "first price in the list", which would silently bill the
 * wrong plan if the lookup ever matched nothing. */
export async function findPriceByKey(env: PaddleEnv, key: string): Promise<PaddlePrice | null> {
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ status: "active", per_page: "200" });
    if (after) query.set("after", after);
    const response = await paddleFetch(env, `/prices?${query.toString()}`);
    if (!response.ok) throw new Error("Could not read prices from the payment provider.");
    const body = (await response.json()) as {
      data?: PaddlePrice[];
      meta?: { pagination?: { has_more?: boolean } };
    };
    const prices = body.data ?? [];
    const hit = prices.find((p) => catalogKeyOf(p) === key);
    if (hit) return hit;
    if (!body.meta?.pagination?.has_more || prices.length === 0) return null;
    after = prices[prices.length - 1]!.id;
  }
  return null;
}

export function getWebhookSecret(env: PaddleEnv): string {
  return env === "sandbox"
    ? getEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
    : getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET");
}

export async function verifyWebhook(req: Request, env: PaddleEnv) {
  const signature = req.headers.get("paddle-signature");
  const body = await req.text();
  const secret = getWebhookSecret(env);

  if (!signature || !body) throw new Error("Missing signature or body");

  const paddle = getPaddleClient(env);
  return await paddle.webhooks.unmarshal(body, secret, signature);
}

/** Zero-decimal currencies: the minor unit *is* the major unit. */
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "VND"]);

export function toMajorUnit(amount: string | number | null | undefined, currency: string): number {
  const value = Number(amount ?? 0);
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? value : value / 100;
}
