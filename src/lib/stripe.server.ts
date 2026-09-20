/**
 * Stripe over plain HTTPS — no SDK, so there is nothing to add to bun.lock and
 * nothing between us and Stripe's own REST API. Server-only (`.server.ts`).
 *
 * Everything the billing code needs lives here: an authenticated request helper,
 * webhook signature verification, and the two Stripe objects we create on demand
 * and reuse (one Product per plan tier, one Tax Rate).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { getPaymentsEnv } from "./payments-env";

const API_BASE = "https://api.stripe.com";

/** Pinned so response shapes (for example current_period_* living on the subscription) can
 * never change underneath us when Stripe ships a new default API version. Webhook endpoints
 * are created with the same version (scripts/setup-stripe.mjs). */
export const STRIPE_API_VERSION = "2024-06-20";

/** Flat tax added on top of every price, as the customer decided (percent). */
export const DEFAULT_TAX_PERCENT = Number(process.env["PAYMENT_TAX_PERCENT"] ?? 10);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export const getStripeSecretKey = () => requireEnv("STRIPE_SECRET_KEY");
export const getStripeWebhookSecret = () => requireEnv("STRIPE_WEBHOOK_SECRET");

/** Public base URL of this deployment, used to build the checkout return links. */
export function appUrl(): string {
  return requireEnv("APP_URL").replace(/\/+$/, "");
}

/* ------------------------------------------------------------------ requests */

type ParamValue = string | number | boolean | null | undefined | ParamValue[] | { [key: string]: ParamValue };
export type StripeParams = { [key: string]: ParamValue };

/** Stripe wants application/x-www-form-urlencoded with bracket notation for nesting:
 * `line_items[0][price_data][currency]=usd`. Undefined/null values are skipped. */
export function encodeParams(params: StripeParams): string {
  const pairs: string[] = [];
  const walk = (prefix: string, value: ParamValue) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(`${prefix}[${i}]`, item));
    } else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(`${prefix}[${k}]`, v);
    } else {
      pairs.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
    }
  };
  for (const [key, value] of Object.entries(params)) walk(key, value);
  return pairs.join("&");
}

export class StripeError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function stripeFetch<T = unknown>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: StripeParams,
  options?: { idempotencyKey?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getStripeSecretKey()}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };
  const encoded = params ? encodeParams(params) : "";
  let url = API_BASE + path;
  let body: string | undefined;
  if (method === "GET") {
    if (encoded) url += (path.includes("?") ? "&" : "?") + encoded;
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = encoded;
  }
  if (options?.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const response = await fetch(url, { method, headers, ...(body !== undefined ? { body } : {}) });
  const json = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
  if (!response.ok) {
    throw new StripeError(json?.error?.message ?? `Stripe answered ${response.status}`, response.status, json?.error?.code);
  }
  return json as T;
}

/* ------------------------------------------------------------------ webhooks */

/**
 * Verifies the `Stripe-Signature` header (`t=<unix>,v1=<hmac>[,v1=…]`): an HMAC-SHA256 of
 * `<t>.<raw body>` with the endpoint's signing secret, compared in constant time, and the
 * timestamp must be recent so a captured request cannot be replayed later.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  if (!header) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1") signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return signatures.some(
    (candidate) => candidate.length === expected.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(expected)),
  );
}

/* ----------------------------------------------------- reusable Stripe objects */

const idCache = new Map<string, string>();

type Listed<T> = { data: T[] };

/**
 * The Stripe Product a plan tier's subscriptions hang off. Found by our own metadata tag, or
 * created once. Prices themselves are NOT stored in Stripe: each checkout sends the amount
 * straight from billing_plans, so the website and the charge cannot drift apart.
 */
export async function ensureProductId(tier: string, name: string): Promise<string> {
  const env = getPaymentsEnv();
  const cacheKey = `${env}:product:${tier}`;
  const cached = idCache.get(cacheKey);
  if (cached) return cached;

  const find = async () => {
    const list = await stripeFetch<Listed<{ id: string; metadata?: Record<string, string> }>>("GET", "/v1/products", {
      active: true,
      limit: 100,
    });
    return list.data.find((p) => p.metadata?.["lingora_tier"] === tier)?.id ?? null;
  };

  let id = await find();
  if (!id) {
    try {
      const created = await stripeFetch<{ id: string }>(
        "POST",
        "/v1/products",
        { name, metadata: { lingora_tier: tier } },
        { idempotencyKey: `lingora-product-${env}-${tier}` },
      );
      id = created.id;
    } catch {
      // Two requests raced to create it (or the idempotency key was reused): read it back.
      id = await find();
      if (!id) throw new Error("Could not create the Stripe product for this plan.");
    }
  }
  idCache.set(cacheKey, id);
  return id;
}

/** The flat sales-tax/VAT rate (exclusive: added on top of the price), created once. */
export async function ensureTaxRateId(): Promise<string> {
  const env = getPaymentsEnv();
  const percent = DEFAULT_TAX_PERCENT;
  const cacheKey = `${env}:tax:${percent}`;
  const cached = idCache.get(cacheKey);
  if (cached) return cached;

  const find = async () => {
    const list = await stripeFetch<Listed<{ id: string; percentage: number; inclusive: boolean; metadata?: Record<string, string> }>>(
      "GET",
      "/v1/tax_rates",
      { active: true, limit: 100 },
    );
    return (
      list.data.find((r) => r.metadata?.["lingora_default_tax"] === "1" && r.percentage === percent && !r.inclusive)?.id ?? null
    );
  };

  let id = await find();
  if (!id) {
    try {
      const created = await stripeFetch<{ id: string }>(
        "POST",
        "/v1/tax_rates",
        { display_name: "Tax", percentage: percent, inclusive: false, metadata: { lingora_default_tax: "1" } },
        { idempotencyKey: `lingora-tax-${env}-${percent}` },
      );
      id = created.id;
    } catch {
      id = await find();
      if (!id) throw new Error("Could not create the tax rate.");
    }
  }
  idCache.set(cacheKey, id);
  return id;
}

/**
 * The Billing Portal configuration to open sessions with. A brand-new Stripe account has none, and
 * a portal session cannot be opened without one — so use the account's active one, or create it
 * once: learners can update their card, edit contact details and read invoices there. Cancelling
 * is deliberately left to our own /billing page (end of period, with a one-click undo), so it is
 * switched off in the portal to keep a single, consistent path.
 */
export async function ensurePortalConfigurationId(): Promise<string> {
  const env = getPaymentsEnv();
  const cacheKey = `${env}:portal`;
  const cached = idCache.get(cacheKey);
  if (cached) return cached;

  const find = async () => {
    const list = await stripeFetch<Listed<{ id: string; is_default?: boolean }>>("GET", "/v1/billing_portal/configurations", {
      active: true,
      limit: 10,
    });
    return (list.data.find((c) => c.is_default) ?? list.data[0])?.id ?? null;
  };

  let id = await find();
  if (!id) {
    try {
      const created = await stripeFetch<{ id: string }>(
        "POST",
        "/v1/billing_portal/configurations",
        {
          business_profile: { headline: "Manage your Lingora English subscription" },
          features: {
            payment_method_update: { enabled: true },
            invoice_history: { enabled: true },
            customer_update: { enabled: true, allowed_updates: ["email", "address"] },
            subscription_cancel: { enabled: false },
          },
        },
        { idempotencyKey: `lingora-portal-${env}` },
      );
      id = created.id;
    } catch {
      id = await find();
      if (!id) throw new Error("Could not set up the billing portal.");
    }
  }
  idCache.set(cacheKey, id);
  return id;
}

/* ------------------------------------------------------------------- helpers */

/** Zero-decimal currencies: the minor unit *is* the major unit. */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

export function toMajorUnit(amount: string | number | null | undefined, currency: string): number {
  const value = Number(amount ?? 0);
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? value : value / 100;
}

/** Stripe timestamps are unix seconds. */
export function toIso(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

/* ------------------------------------------------- minimal shapes we read back */

export type StripeSubscription = {
  id: string;
  status: string;
  customer: string | { id: string };
  currency?: string;
  metadata?: Record<string, string>;
  cancel_at_period_end: boolean;
  start_date?: number;
  created?: number;
  trial_end?: number | null;
  ended_at?: number | null;
  canceled_at?: number | null;
  current_period_start?: number;
  current_period_end?: number;
  items?: {
    data: {
      id: string;
      current_period_start?: number;
      current_period_end?: number;
      price?: { unit_amount?: number | null; currency?: string; recurring?: { interval?: string } | null };
    }[];
  };
};
