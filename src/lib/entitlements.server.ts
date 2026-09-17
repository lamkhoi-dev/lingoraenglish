/**
 * Server-side subscription entitlements and usage quotas.
 *
 * Access is decided here — never in the browser. Metered AI capabilities
 * claim their allowance through `reserveUsage` before the call, so a
 * learner cannot unlock premium AI by editing frontend code or calling a
 * server function directly.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { withAdmin } from "@/db";
import {
  adminAuditLog,
  billingEvents,
  billingPlans,
  complimentaryAccess,
  listeningLessons,
  pronunciationLessons,
  shadowingSentences,
  speakingTests,
  usageCounters,
  userRoles,
  vocabularyWords,
} from "@/db/schema/schema";
import { LISTENING_CATEGORIES } from "@/lib/listening-content";
import { getPaddleEnvironment, type PaddleEnv } from "./payments-env";

export type Tier = "free" | "premium" | "ielts_pro";

/**
 * `speaking`/`conversation`/`pronunciation`/`ielts`/`realtime` are used only
 * as the `.capability` tag on UpgradeRequiredError (so the client's
 * usePaywall(capability) shows the right paywall copy) — Yêu cầu 9/10 moved
 * their actual gating to per-item `is_free` checks (assertUnlockedOrPremium),
 * so LIMIT_KEY below is unreachable for them: nothing calls reserveUsage with
 * these values. `plan` (AI Learning Plan generations/month) is the only one
 * still backed by a real monthly counter — see CAPABILITY_MAP in
 * lily.functions.ts and MONTHLY_QUOTA_KEYS below.
 */
export type Capability = "speaking" | "conversation" | "pronunciation" | "ielts" | "plan" | "realtime";

/** Which monthly allowance each capability draws from. */
const LIMIT_KEY: Record<Capability, string> = {
  speaking: "speaking_minutes",
  conversation: "conversations",
  pronunciation: "pronunciation",
  ielts: "ielts_analyses",
  plan: "conversations",
  realtime: "realtime_minutes",
};

/**
 * `billing_plans.limits` mixes two unrelated things in one jsonb blob: real
 * monthly AI-usage quotas (this file) and Yêu cầu 9's content-unlock counts
 * (shadowing_free_per_topic_level, coach_free_turns_lifetime, ...). /billing
 * and /pricing used to render `Object.entries(limits)` directly, which
 * showed every content-unlock key as a fake "0 / N" usage bar with its raw
 * snake_case name as the label (no translation exists for those keys), and
 * showed stt_requests/tts_requests as if they were real per-feature limits —
 * they were a hidden 7th/8th limit the customer's spec never asked for (spec
 * 3.1/3.2 asks for a DAILY abuse/cost cap instead, which DAILY_AI_LIMIT in
 * lily.functions.ts already provides). This is the explicit allowlist both
 * pages must filter to instead. Keep in sync with CAPABILITY_MAP.
 */
export const MONTHLY_QUOTA_KEYS: readonly string[] = ["conversations"];

export const TIER_RANK: Record<Tier, number> = { free: 0, premium: 1, ielts_pro: 2 };

/**
 * Yêu cầu 9: `billing_plans.limits` is the one place every feature's
 * free/premium threshold lives — content-unlock counts (shadowing, vocab,
 * pronunciation, listening, coach lifetime turns) as well as the older
 * monthly AI quotas below. Every feature reads its number through
 * `getLimits()` instead of keeping its own constant or settings table, so
 * changing a number here (via the admin "Plans" tab) takes effect
 * everywhere immediately — see `resyncContentFreeRanks` further down for
 * the features whose gate is a stored per-row flag that needs recomputing
 * when the count changes, rather than a live check on every read.
 */
export type LimitsMap = Record<string, number>;

const LIMITS_TTL_MS = 120_000;
const limitsCache = new Map<Tier, { data: LimitsMap; expiresAt: number }>();

/** Called from adminUpdatePlan right after a save so the new numbers apply
 * immediately instead of waiting out the TTL (same pattern as
 * bustLocaleCache in i18n.functions.ts). */
export function bustLimitsCache() {
  limitsCache.clear();
}

export async function getLimits(tier: Tier): Promise<LimitsMap> {
  const cached = limitsCache.get(tier);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const rows = await withAdmin((db) =>
    db.select({ limits: billingPlans.limits }).from(billingPlans).where(eq(billingPlans.tier, tier)).limit(1),
  );
  const data = (rows[0]?.limits as LimitsMap | undefined) ?? {};
  limitsCache.set(tier, { data, expiresAt: Date.now() + LIMITS_TTL_MS });
  return data;
}

export class UpgradeRequiredError extends Error {
  constructor(
    public capability: Capability,
    public tier: Tier,
    message: string,
  ) {
    // The prefix lets the client show an upgrade screen instead of an error toast.
    super(`UPGRADE_REQUIRED: ${message}`);
    this.name = "UpgradeRequiredError";
  }
}


/**
 * The shared content gate: passes when the item is free, otherwise requires
 * the caller's server-resolved plan to rank at least `required` (Premium by
 * default). Every feature that opens, scores or records progress on a
 * specific practice item calls this instead of its own tier comparison.
 */
export async function assertUnlockedOrPremium(
  userId: string,
  unlocked: boolean,
  capability: Capability,
  message: string,
  required: Tier = "premium",
) {
  if (unlocked) return;
  const tier = await resolveTier(userId);
  if (TIER_RANK[tier] < TIER_RANK[required]) {
    throw new UpgradeRequiredError(capability, tier, message);
  }
}

export type PlanRow = {
  plan_key: string;
  tier: Tier;
  name: string;
  limits: Record<string, number>;
  trial_enabled: boolean;
  trial_days: number;
};

export type Entitlement = {
  tier: Tier;
  planKey: string;
  planName: string;
  environment: PaddleEnv;
  limits: Record<string, number>;
  usage: Record<string, number>;
  periodStart: string;
  complimentary: boolean;
  complimentaryExpiresAt: string | null;
};

export function currentPeriodStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Calls the original effective_tier() Postgres function as-is (service_role
 * only — revoked from anon/authenticated in the original migration — so this
 * must always run through withAdmin(), never withUser()/withAnon()). Complex
 * rank-comparison logic between paid and complimentary tiers; not worth
 * reimplementing in Drizzle when the exact-behavior original already exists. */
export async function resolveTier(userId: string, env: PaddleEnv = getPaddleEnvironment()): Promise<Tier> {
  const rows = await withAdmin((db) => db.execute(sql`select effective_tier(${userId}, ${env}) as tier`));
  const tier = (rows as unknown as { tier: string | null }[])[0]?.tier;
  return (tier ?? "free") as Tier;
}

export async function getEntitlement(
  userId: string,
  env: PaddleEnv = getPaddleEnvironment(),
): Promise<Entitlement> {
  const tier = await resolveTier(userId, env);
  const period = currentPeriodStart();

  const [planRows, usageRows, compRows] = await withAdmin((db) =>
    Promise.all([
      db
        .select({ planKey: billingPlans.planKey, tier: billingPlans.tier, name: billingPlans.name, limits: billingPlans.limits })
        .from(billingPlans)
        .where(eq(billingPlans.tier, tier))
        .limit(1),
      db
        .select({ capability: usageCounters.capability, units: usageCounters.units })
        .from(usageCounters)
        .where(and(eq(usageCounters.userId, userId), eq(usageCounters.periodStart, period))),
      db
        .select({ tier: complimentaryAccess.tier, expiresAt: complimentaryAccess.expiresAt })
        .from(complimentaryAccess)
        .where(and(eq(complimentaryAccess.userId, userId), eq(complimentaryAccess.revoked, false)))
        .orderBy(desc(complimentaryAccess.createdAt))
        .limit(1),
    ]),
  );

  const plan = planRows[0];
  // Same reasoning as `limits` below: usage_counters still holds rows logged
  // under retired capabilities (stt_requests/tts_requests, and the
  // never-wired speaking_minutes/pronunciation/ielts_analyses/realtime_minutes)
  // from before Yêu cầu 10 — harmless since billing.tsx only ever looks up
  // `usage[key]` for keys it got from `limits`, but there is no reason to
  // ship stale numbers to the client that nothing asked for.
  const usage: Record<string, number> = {};
  for (const row of usageRows) {
    if (!MONTHLY_QUOTA_KEYS.includes(row.capability)) continue;
    usage[row.capability] = (usage[row.capability] ?? 0) + row.units;
  }

  const comp = compRows[0];
  const compActive = Boolean(comp) && (!comp?.expiresAt || new Date(comp.expiresAt) > new Date());

  // Yêu cầu 10: only the still-real monthly quotas leave the server. The rest
  // of billing_plans.limits (Yêu cầu 9 content-unlock counts, and
  // capabilities no longer wired to a counter) is internal config, not
  // something to render as a usage bar on /billing — see MONTHLY_QUOTA_KEYS.
  const allLimits = (plan?.limits as Record<string, number> | undefined) ?? {};
  const limits: Record<string, number> = {};
  for (const key of MONTHLY_QUOTA_KEYS) if (key in allLimits) limits[key] = allLimits[key]!;

  return {
    tier,
    planKey: plan?.planKey ?? "free",
    planName: plan?.name ?? "Free",
    environment: env,
    limits,
    usage,
    periodStart: period,
    complimentary: compActive,
    complimentaryExpiresAt: compActive ? (comp?.expiresAt ?? null) : null,
  };
}

/**
 * Claims `units` of the learner's monthly `capability` allowance BEFORE the
 * AI call and returns a function that hands them back — call it if the AI
 * call fails (Yêu cầu 10: "Lượt sử dụng không bị trừ khi lệnh gọi dịch vụ AI
 * thất bại").
 *
 * The claim is one atomic `insert ... on conflict do update ... where` on
 * the (user, capability, period) row: Postgres row-locks the conflicting row,
 * so N concurrent requests serialise on it and exactly as many succeed as
 * the limit allows. This replaces requireCapacity + recordUsage, which read
 * the counter, called the AI, then wrote `old + 1` back — concurrent
 * requests all passed the same stale check (overshooting the limit) and then
 * overwrote each other's increments (undercounting what was really used).
 */
export async function reserveUsage(userId: string, capability: Capability, units = 1): Promise<() => Promise<void>> {
  const tier = await resolveTier(userId);
  const limitKey = LIMIT_KEY[capability];
  const limit = (await getLimits(tier))[limitKey] ?? 0;

  if (limit <= 0) {
    throw new UpgradeRequiredError(
      capability,
      tier,
      capability === "ielts"
        ? "The AI IELTS examiner is part of Lingora English IELTS Pro. Upgrade to rehearse Parts 1–3 with a band estimate."
        : "This practice is not included in your current plan. Upgrade to keep going with Lingora English.",
    );
  }

  const period = currentPeriodStart();
  const claimed =
    units <= limit
      ? await withAdmin((db) =>
          db.execute(sql`
            insert into ${usageCounters} (user_id, capability, period_start, units)
            values (${userId}, ${limitKey}, ${period}, ${units})
            on conflict (user_id, capability, period_start)
            do update set units = ${usageCounters}.units + excluded.units, updated_at = now()
            where ${usageCounters}.units + excluded.units <= ${limit}
            returning units
          `),
        )
      : [];

  if ((claimed as unknown as unknown[]).length === 0) {
    throw new UpgradeRequiredError(
      capability,
      tier,
      `You have used your monthly allowance for this practice (${limit}/${limit}). Upgrade your plan or come back next month.`,
    );
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    // Never let a failed refund replace the AI error the learner needs to see.
    await withAdmin((db) =>
      db
        .update(usageCounters)
        .set({ units: sql`greatest(${usageCounters.units} - ${units}, 0)`, updatedAt: sql`now()` })
        .where(and(eq(usageCounters.userId, userId), eq(usageCounters.capability, limitKey), eq(usageCounters.periodStart, period))),
    ).catch((error: unknown) => console.error(`usage refund failed (${userId}, ${limitKey}, ${period})`, error));
  };
}

/**
 * Recomputes the stored `is_free`/`access_tier` flag that Shadowing,
 * Pronunciation lessons, Vocabulary, Listening and Speaking Tests actually
 * gate on, from the free plan's current limits — so an admin changing one number on the
 * "Plans" tab reaches every feature immediately, the same way it always
 * could for stt/tts quotas. This replaces adminSetShadowFreeCount /
 * adminSetPronunciationFreeCount / adminSetVocabularyFreeCount (three
 * near-identical hand-triggered copies of this same logic) with one shared,
 * always-in-sync function. Called from adminUpdatePlan after every save;
 * cheap enough to always run in full (content tables here are low
 * thousands of rows at most) rather than trying to diff which keys changed.
 *
 * Ranking uses `row_number() OVER (PARTITION BY <group> ORDER BY sort_order)`
 * rather than trusting `sort_order` as a clean 1..N sequence per group —
 * Shadowing's sort_order is a single running index across a whole topic
 * (all levels concatenated), not reset per level, so a flat
 * `sort_order <= N` comparison would silently re-collapse "first N per
 * level" back down to "first N of the topic" (all one level) — exactly the
 * distribution bug the 2026-09-14 audit fixed by hand. Ranking within the
 * real group (topic+level, skill, category, or exam part) is correct
 * regardless of what the raw sort_order numbering happens to look like.
 * Only published rows are ranked — a hidden draft must never use up one of
 * the N free slots learners can actually see.
 */
export async function resyncContentFreeRanks(): Promise<void> {
  const limits = await getLimits("free");

  await withAdmin(async (db) => {
    // Postgres's UPDATE ... SET requires a bare column name (no table
    // qualifier — that's why "is_free"/"access_tier" below are literals,
    // not ${table.column} interpolations), but the table identifiers
    // everywhere else are the real Drizzle objects so a rename anywhere
    // still typechecks.
    const shadowingFree = limits["shadowing_free_per_topic_level"];
    if (shadowingFree != null) {
      await db.execute(sql`
        update ${shadowingSentences}
        set is_free = (ranked.rn <= ${shadowingFree})
        from (
          select id, row_number() over (partition by topic_id, level order by sort_order, created_at) as rn
          from ${shadowingSentences}
          where status = 'published'
        ) ranked
        where ${shadowingSentences}.id = ranked.id
          and ${shadowingSentences}.is_free is distinct from (ranked.rn <= ${shadowingFree})
      `);
    }

    const pronunciationFree = limits["pronunciation_lessons_free_per_skill"];
    if (pronunciationFree != null) {
      await db.execute(sql`
        update ${pronunciationLessons}
        set is_free = (ranked.rn <= ${pronunciationFree})
        from (
          select id, row_number() over (partition by skill order by sort_order, created_at) as rn
          from ${pronunciationLessons}
          where status = 'published'
        ) ranked
        where ${pronunciationLessons}.id = ranked.id
          and ${pronunciationLessons}.is_free is distinct from (ranked.rn <= ${pronunciationFree})
      `);
    }

    const vocabularyFree = limits["vocabulary_free_per_category"];
    if (vocabularyFree != null) {
      await db.execute(sql`
        update ${vocabularyWords}
        set access_tier = case when ranked.rn <= ${vocabularyFree} then 'free' else 'premium' end
        from (
          select id, row_number() over (partition by category order by sort_order, created_at) as rn
          from ${vocabularyWords}
          where status = 'published'
        ) ranked
        where ${vocabularyWords}.id = ranked.id and ${vocabularyWords}.access_tier <> 'ielts_pro'
          and ${vocabularyWords}.access_tier is distinct from (case when ranked.rn <= ${vocabularyFree} then 'free' else 'premium' end)
      `);
    }

    // Yêu cầu 4 + 10: Speaking Tests has 3 free tests in total, one per IELTS
    // part ("trải đều các phần thi"), and TOEFL/PTE (part 0) are fully
    // Premium — both counts live in billing_plans.limits like everything else.
    const ieltsFreePerPart = limits["speaking_tests_free_per_part"];
    if (ieltsFreePerPart != null) {
      await db.execute(sql`
        update ${speakingTests}
        set is_free = (ranked.rn <= ${ieltsFreePerPart})
        from (
          select id, row_number() over (partition by part order by sort_order, created_at) as rn
          from ${speakingTests}
          where status = 'published' and exam = 'ielts'
        ) ranked
        where ${speakingTests}.id = ranked.id
          and ${speakingTests}.is_free is distinct from (ranked.rn <= ${ieltsFreePerPart})
      `);
    }

    const otherExamFree = limits["speaking_tests_free_toefl_pte"];
    if (otherExamFree != null) {
      await db.execute(sql`
        update ${speakingTests}
        set is_free = (ranked.rn <= ${otherExamFree})
        from (
          select id, row_number() over (partition by exam order by sort_order, created_at) as rn
          from ${speakingTests}
          where status = 'published' and exam <> 'ielts'
        ) ranked
        where ${speakingTests}.id = ranked.id
          and ${speakingTests}.is_free is distinct from (ranked.rn <= ${otherExamFree})
      `);
    }

    const listeningFree = limits["listening_free_categories"];
    if (listeningFree != null) {
      for (let i = 0; i < LISTENING_CATEGORIES.length; i += 1) {
        const isFree = i + 1 <= listeningFree;
        await db
          .update(listeningLessons)
          .set({ isFree })
          .where(and(eq(listeningLessons.category, LISTENING_CATEGORIES[i]!), sql`${listeningLessons.isFree} is distinct from ${isFree}`));
      }
    }
  });
}

export async function logBillingEvent(
  event: string,
  opts: {
    userId?: string | null;
    planKey?: string;
    intervalKey?: string;
    metadata?: Record<string, unknown>;
    env?: PaddleEnv;
  } = {},
) {
  // onConflictDoNothing covers idx_billing_events_activation_once, which keeps
  // /checkout/success from logging a second subscription_activated every time
  // the learner reloads it. Nothing else on this table can conflict.
  await withAdmin((db) =>
    db
      .insert(billingEvents)
      .values({
        userId: opts.userId ?? null,
        event,
        planKey: opts.planKey ?? "",
        intervalKey: opts.intervalKey ?? "",
        environment: opts.env ?? getPaddleEnvironment(),
        metadata: opts.metadata ?? {},
      })
      .onConflictDoNothing(),
  );
}

export async function logAdminAction(
  actorId: string,
  action: string,
  targetUserId: string | null,
  details: Record<string, unknown> = {},
) {
  await withAdmin((db) => db.insert(adminAuditLog).values({ actorId, targetUserId, action, details }));
}

/** Signature dropped the Supabase-shaped `supabase` first argument that every
 * call site used to pass through from `requireSupabaseAuth`'s context — call
 * sites updated to `assertAdmin(userId)`. Same has_role() check as the
 * requireAdmin middleware in require-auth.ts (kept separate on purpose: this
 * one is called manually inside handlers still on requireSupabaseAuth, not
 * yet switched to that middleware — Giai đoạn 4 in progress). */
export async function assertAdmin(userId: string) {
  const isAdmin = await withAdmin((db) =>
    db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.role, "admin")))
      .limit(1),
  ).then((rows) => rows.length > 0);
  if (!isAdmin) throw new Error("Forbidden");
}
