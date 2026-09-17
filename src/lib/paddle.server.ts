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
