/**
 * Server-side subscription entitlements and usage quotas.
 *
 * Access is decided here — never in the browser. Every AI capability passes
 * through `requireCapacity`, so a learner cannot unlock premium AI by editing
 * frontend code or calling a server function directly.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { withAdmin } from "@/db";
import { adminAuditLog, billingEvents, billingPlans, complimentaryAccess, usageCounters, userRoles } from "@/db/schema/schema";
import { getPaddleEnvironment, type PaddleEnv } from "./payments-env";

export type Tier = "free" | "premium" | "ielts_pro";

export type Capability =
  | "speaking"
  | "conversation"
  | "pronunciation"
  | "ielts"
  | "stt"
  | "tts"
  | "plan"
  | "realtime";

/** Which monthly allowance each capability draws from. */
const LIMIT_KEY: Record<Capability, string> = {
  speaking: "speaking_minutes",
  conversation: "conversations",
  pronunciation: "pronunciation",
  ielts: "ielts_analyses",
  stt: "stt_requests",
  tts: "tts_requests",
  plan: "conversations",
  realtime: "realtime_minutes",
};

export const TIER_RANK: Record<Tier, number> = { free: 0, premium: 1, ielts_pro: 2 };

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
  const usage: Record<string, number> = {};
  for (const row of usageRows) usage[row.capability] = (usage[row.capability] ?? 0) + row.units;

  const comp = compRows[0];
  const compActive = Boolean(comp) && (!comp?.expiresAt || new Date(comp.expiresAt) > new Date());

  return {
    tier,
    planKey: plan?.planKey ?? "free",
    planName: plan?.name ?? "Free",
    environment: env,
    limits: (plan?.limits as Record<string, number> | undefined) ?? {},
    usage,
    periodStart: period,
    complimentary: compActive,
    complimentaryExpiresAt: compActive ? (comp?.expiresAt ?? null) : null,
  };
}

/**
 * Throws when the learner's plan does not allow another unit of `capability`.
 * Called before every paid AI operation.
 */
export async function requireCapacity(
  userId: string,
  capability: Capability,
  units = 1,
  env: PaddleEnv = getPaddleEnvironment(),
): Promise<Entitlement> {
  const entitlement = await getEntitlement(userId, env);
  const limitKey = LIMIT_KEY[capability];
  const limit = entitlement.limits[limitKey] ?? 0;
  const used = entitlement.usage[limitKey] ?? 0;

  if (limit <= 0) {
    throw new UpgradeRequiredError(
      capability,
      entitlement.tier,
      capability === "ielts"
        ? "The AI IELTS examiner is part of Lingora English IELTS Pro. Upgrade to rehearse Parts 1–3 with a band estimate."
        : "This practice is not included in your current plan. Upgrade to keep going with Lingora English.",
    );
  }

  if (used + units > limit) {
    throw new UpgradeRequiredError(
      capability,
      entitlement.tier,
      `You have used your monthly allowance for this practice (${used}/${limit}). Upgrade your plan or come back next month.`,
    );
  }

  return entitlement;
}

/** Increments the learner's monthly counter after a successful AI call. */
export async function recordUsage(userId: string, capability: Capability, units = 1) {
  const limitKey = LIMIT_KEY[capability];
  const period = currentPeriodStart();

  await withAdmin(async (db) => {
    const existingRows = await db
      .select({ id: usageCounters.id, units: usageCounters.units })
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, userId), eq(usageCounters.capability, limitKey), eq(usageCounters.periodStart, period)))
      .limit(1);
    const existing = existingRows[0];
    if (existing) {
      await db.update(usageCounters).set({ units: existing.units + units }).where(eq(usageCounters.id, existing.id));
      return;
    }
    await db.insert(usageCounters).values({ userId, capability: limitKey, periodStart: period, units });
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
  await withAdmin((db) =>
    db.insert(billingEvents).values({
      userId: opts.userId ?? null,
      event,
      planKey: opts.planKey ?? "",
      intervalKey: opts.intervalKey ?? "",
      environment: opts.env ?? getPaddleEnvironment(),
      metadata: opts.metadata ?? {},
    }),
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
