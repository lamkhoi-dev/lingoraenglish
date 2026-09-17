/**
 * Admin configuration of plan limits and availability.
 *
 * Limits live in the database (`billing_plans.limits`) — never hard-coded in the
 * app — so an administrator can retune free and paid allowances without a
 * deploy. Payment records themselves are never edited here: the payment
 * provider stays the source of truth for subscription status.
 */
import { createServerFn } from "@tanstack/react-start";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { withAdmin } from "@/db";
import { billingPlans, profiles, subscriptions } from "@/db/schema/schema";
import { requireAdmin } from "@/lib/require-auth";
import { bustLimitsCache, logAdminAction, resyncContentFreeRanks } from "./entitlements.server";
import { getPaddleEnvironment } from "./payments-env";

const LIMIT_KEYS = [
  "speaking_minutes",
  "conversations",
  "pronunciation",
  "ielts_analyses",
  // stt_requests/tts_requests removed 2026-09-16 — a hidden, undocumented
  // monthly cap shared across every recording-based feature at once; see the
  // CAPABILITY_MAP comment in lily.functions.ts. DAILY_AI_LIMIT there is the
  // customer's actual "chống lạm dụng" ask (a flat daily cap).
  "vocabulary_lessons",
  "grammar_lessons",
  "listening_lessons",
  // Yêu cầu 9: mọi hạn mức free/premium của từng tính năng gộp về đây —
  // xem entitlements.server.ts (getLimits/resyncContentFreeRanks) cho nơi
  // các số này thực sự được đọc/áp dụng.
  "coach_free_turns_lifetime",
  "coach_monthly_turns",
  "shadowing_free_per_topic_level",
  "pronunciation_lessons_free_per_skill",
  "pronunciation_sounds_free_count",
  "vocabulary_free_per_category",
  "listening_free_categories",
  "speaking_tests_free_per_part",
  "speaking_tests_free_toefl_pte",
  // Yêu cầu 11 / Vấn đề 4: days of access kept after a renewal payment fails,
  // on top of the period already paid for. 0 = downgrade as soon as the paid
  // period ends. Read by effective_tier()/has_active_subscription() in SQL.
  "grace_period_days",
] as const;

export const adminListPlans = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const env = getPaddleEnvironment();

    const [plans, subs, learnerCount] = await withAdmin((db) =>
      Promise.all([
        db
          .select({
            id: billingPlans.id,
            planKey: billingPlans.planKey,
            tier: billingPlans.tier,
            name: billingPlans.name,
            limits: billingPlans.limits,
            trialEnabled: billingPlans.trialEnabled,
            trialDays: billingPlans.trialDays,
            isActive: billingPlans.isActive,
            monthlyAmount: billingPlans.monthlyAmount,
            yearlyAmount: billingPlans.yearlyAmount,
            currency: billingPlans.currency,
            monthlyPriceId: billingPlans.monthlyPriceId,
            yearlyPriceId: billingPlans.yearlyPriceId,
          })
          .from(billingPlans)
          .orderBy(asc(billingPlans.sortOrder)),
        db
          .select({
            userId: subscriptions.userId,
            status: subscriptions.status,
            priceId: subscriptions.priceId,
            cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
          })
          .from(subscriptions)
          .where(eq(subscriptions.environment, env)),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(profiles)
          .then((r) => r[0]!.n),
      ]),
    );

    const paidUsers = new Set(
      subs.filter((r) => ["active", "trialing", "past_due"].includes(r.status)).map((r) => r.userId),
    );
    const planByPrice = new Map<string, string>();
    for (const plan of plans) {
      planByPrice.set(plan.monthlyPriceId, plan.tier);
      planByPrice.set(plan.yearlyPriceId, plan.tier);
    }

    const tierCounts: Record<string, number> = { premium: 0, ielts_pro: 0 };
    for (const row of subs) {
      if (!paidUsers.has(row.userId)) continue;
      const tier = planByPrice.get(row.priceId);
      if (tier && tier in tierCounts) tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
    }

    const total = learnerCount;
    return {
      // snake_case to match what admin-plans.tsx already expects — was a
      // direct Supabase `.select("id, plan_key, ...")` response.
      plans: plans.map((p) => ({
        id: p.id,
        plan_key: p.planKey,
        tier: p.tier,
        name: p.name,
        limits: p.limits as Record<string, number>,
        trial_enabled: p.trialEnabled,
        trial_days: p.trialDays,
        is_active: p.isActive,
        monthly_amount: p.monthlyAmount,
        yearly_amount: p.yearlyAmount,
        currency: p.currency,
        monthly_price_id: p.monthlyPriceId,
        yearly_price_id: p.yearlyPriceId,
      })),
      limitKeys: LIMIT_KEYS as unknown as string[],
      stats: {
        learners: total,
        free: Math.max(0, total - paidUsers.size),
        premium: tierCounts["premium"] ?? 0,
        ieltsPro: tierCounts["ielts_pro"] ?? 0,
        canceled: subs.filter((r) => r.status === "canceled").length,
        failed: subs.filter((r) => ["past_due", "unpaid"].includes(r.status)).length,
        trialing: subs.filter((r) => r.status === "trialing").length,
        cancelling: subs.filter((r) => r.cancelAtPeriodEnd).length,
        conversion: total > 0 ? paidUsers.size / total : 0,
      },
    };
  });

export const adminUpdatePlan = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(
    (data: {
      planKey: string;
      limits: Record<string, number>;
      trialEnabled: boolean;
      trialDays: number;
      isActive: boolean;
    }) =>
      z
        .object({
          planKey: z.string().min(1).max(60),
          limits: z.record(z.string(), z.number().int().min(0).max(1_000_000)),
          trialEnabled: z.boolean(),
          trialDays: z.number().int().min(0).max(90),
          isActive: z.boolean(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    await withAdmin((db) =>
      db
        .update(billingPlans)
        .set({
          limits: data.limits,
          trialEnabled: data.trialEnabled,
          trialDays: data.trialDays,
          isActive: data.isActive,
        })
        .where(eq(billingPlans.planKey, data.planKey)),
    );

    await logAdminAction(context.userId, "plan_limits_updated", null, {
      planKey: data.planKey,
      limits: data.limits,
    });

    // Yêu cầu 9 acceptance criterion: a limit changed in one place takes
    // effect everywhere immediately. bustLimitsCache() drops the short TTL
    // cache so the next read sees the new numbers right away; resync
    // recomputes the stored is_free/access_tier flags that Shadowing,
    // Pronunciation lessons, Vocabulary and Listening actually gate on
    // (harmless no-op if this save didn't touch the "free" plan's content
    // keys — resync only ever reads the free plan's current limits).
    bustLimitsCache();
    await resyncContentFreeRanks();

    return { ok: true };
  });
