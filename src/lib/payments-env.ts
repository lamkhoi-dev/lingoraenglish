/**
 * Which payment environment the build talks to.
 *
 * The client token lives in .env.development (test) and .env.production (live),
 * so the prefix is the single source of truth on both client and server — no
 * environment value is ever accepted from the browser.
 */
export type PaddleEnv = "sandbox" | "live";

export const PAYMENTS_CLIENT_TOKEN: string | undefined = import.meta.env
  ["VITE_PAYMENTS_CLIENT_TOKEN"] as string | undefined;

export function getPaddleEnvironment(): PaddleEnv {
  return PAYMENTS_CLIENT_TOKEN?.startsWith("test_") ? "sandbox" : "live";
}

export function isTestPayments(): boolean {
  return getPaddleEnvironment() === "sandbox";
}
