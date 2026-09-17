/**
 * Mục 3.2 "Theo dõi và kiểm soát chi phí": prices one AI call, and enforces the
 * system-wide daily budget.
 *
 * This is deliberately separate from DAILY_AI_LIMIT in lily.functions.ts. That
 * one caps how many calls a single learner may make (anti-abuse, per account);
 * this one caps what the whole product may spend in a day, which is what the
 * requirement asks for — one abusive account is a different problem from a
 * price change or a traffic spike quietly running up the bill.
 */
import { sql } from "drizzle-orm";
import { createServerOnlyFn } from "@tanstack/react-start";

import { withAdmin } from "@/db";

/**
 * USD per million tokens, and per call for the audio models. Published list
 * prices as of 2026-09; they are estimates by definition — the provider's own
 * invoice remains the source of truth, this exists to spot trends and stop
 * runaway spend, not to reconcile billing.
 *
 * Keep in sync with the model ids in ai-providers.server.ts. An unknown model
 * prices at 0 rather than guessing: a wrong number that looks precise is worse
 * than a visible zero, which shows up as "unpriced" in the admin report.
 */
const PRICES: Record<string, { inPerMTok?: number; outPerMTok?: number; perCall?: number }> = {
  "deepseek-chat": { inPerMTok: 0.27, outPerMTok: 1.1 },
  "gemini-flash-latest": { inPerMTok: 0.3, outPerMTok: 2.5 },
  "gemini-2.5-flash-preview-tts": { perCall: 0.0006 },
};

const MICRO = 1_000_000;

/** Micro-USD for one call. Integer, so totals stay exact when summed. */
export function priceCall(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model];
  if (!price) return 0;
  if (price.perCall !== undefined) return Math.round(price.perCall * MICRO);
  const input = ((price.inPerMTok ?? 0) * inputTokens) / 1_000_000;
  const output = ((price.outPerMTok ?? 0) * outputTokens) / 1_000_000;
  return Math.round((input + output) * MICRO);
}

export type CostStatus = {
  spentMicroUsd: number;
  budgetMicroUsd: number | null;
  alertThresholdPercent: number;
  /** True once today's spend is at or past the budget — new calls are refused. */
  overBudget: boolean;
  /** True once spend passes the alert threshold, so the admin page can warn. */
  alerting: boolean;
};

/** Today's spend against the configured budget. */
export const getCostStatus = createServerOnlyFn(async (): Promise<CostStatus> => {
  const rows = await withAdmin((db) =>
    db.execute(sql`
      select
        coalesce((
          select sum(estimated_cost_micro_usd)::bigint
          from ai_usage_log
          where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
        ), 0) as spent,
        (select daily_budget_micro_usd from ai_cost_settings where id) as budget,
        coalesce((select alert_threshold_percent from ai_cost_settings where id), 80) as threshold
    `),
  );
  const row = (
    rows as unknown as { spent: string | number; budget: number | null; threshold: number }[]
  )[0];
  const spent = Number(row?.spent ?? 0);
  const budget = row?.budget ?? null;
  const threshold = row?.threshold ?? 80;
  return {
    spentMicroUsd: spent,
    budgetMicroUsd: budget,
    alertThresholdPercent: threshold,
    overBudget: budget !== null && budget > 0 && spent >= budget,
    alerting: budget !== null && budget > 0 && spent >= (budget * threshold) / 100,
  };
});

/**
 * Called before an AI request. Throws when today's spend has reached the
 * budget. No budget configured means no cap, so this is inert until an admin
 * sets one — deploying it changes nothing on its own.
 */
export const assertWithinDailyBudget = createServerOnlyFn(async (): Promise<void> => {
  const status = await getCostStatus();
  if (status.overBudget) {
    console.error("AI daily budget reached", {
      spentMicroUsd: status.spentMicroUsd,
      budgetMicroUsd: status.budgetMicroUsd,
    });
    throw new Error(
      "Lingora English has reached today's AI processing limit. Please try again tomorrow.",
    );
  }
});
