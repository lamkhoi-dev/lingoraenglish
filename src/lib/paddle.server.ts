import { Environment, EventName, Paddle } from "@paddle/paddle-node-sdk";

import type { PaddleEnv } from "./payments-env";

export { EventName };
export type { PaddleEnv };

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev/paddle";

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
}

export function getConnectionApiKey(env: PaddleEnv): string {
  return env === "sandbox" ? getEnv("PADDLE_SANDBOX_API_KEY") : getEnv("PADDLE_LIVE_API_KEY");
}

export function getPaddleClient(env: PaddleEnv): Paddle {
  const connectionApiKey = getConnectionApiKey(env);
  const lovableApiKey = getEnv("LOVABLE_API_KEY");

  return new Paddle(connectionApiKey, {
    environment: GATEWAY_BASE_URL as unknown as Environment,
    customHeaders: {
      "X-Connection-Api-Key": connectionApiKey,
      "Lovable-API-Key": lovableApiKey,
    },
  });
}

/** For REST endpoints the SDK does not cover (external_id lookups, metrics…). */
export async function gatewayFetch(
  env: PaddleEnv,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const connectionApiKey = getConnectionApiKey(env);
  const lovableApiKey = getEnv("LOVABLE_API_KEY");
  return fetch(`${GATEWAY_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Connection-Api-Key": connectionApiKey,
      "Lovable-API-Key": lovableApiKey,
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
