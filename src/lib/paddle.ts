import { resolvePaddlePrice } from "./billing.functions";
import { getPaddleEnvironment, PAYMENTS_CLIENT_TOKEN } from "./payments-env";

export { getPaddleEnvironment, isTestPayments } from "./payments-env";
export type { PaddleEnv } from "./payments-env";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Paddle: any;
  }
}

let paddleInitialized = false;

export async function initializePaddle() {
  if (paddleInitialized) return;
  if (!PAYMENTS_CLIENT_TOKEN) throw new Error("Payments are not configured for this build.");

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.onload = () => {
      const environment = getPaddleEnvironment() === "sandbox" ? "sandbox" : "production";
      window.Paddle.Environment.set(environment);
      window.Paddle.Initialize({ token: PAYMENTS_CLIENT_TOKEN });
      paddleInitialized = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/** Human-readable price id → provider internal price id. */
export async function getPaddlePriceId(priceId: string): Promise<string> {
  return resolvePaddlePrice({ data: { priceId } });
}
