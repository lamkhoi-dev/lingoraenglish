/**
 * Admin billing operations. Every handler re-checks the admin role through
 * requireAdmin (require-auth.ts) before touching privileged data.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

import { withAdmin } from "@/db";
import { billingEvents, billingPlans, complimentaryAccess, profiles, subscriptions } from "@/db/schema/schema";
import { requireAdmin } from "@/lib/require-auth";
import { logAdminAction } from "./entitlements.server";
import { getPaddleEnvironment } from "./payments-env";

export const adminBillingOverview = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const env = getPaddleEnvironment();

    const [subs, events, comps, learnerCount] = await withAdmin((db) =>
      Promise.all([
        db
          .select({
            userId: subscriptions.userId,
            priceId: subscriptions.priceId,
            productId: subscriptions.productId,
            status: subscriptions.status,
            amount: subscriptions.amount,
            currency: subscriptions.currency,
            billingInterval: subscriptions.billingInterval,
            currentPeriodEnd: subscriptions.currentPeriodEnd,
            cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
            createdAt: subscriptions.createdAt,
          })
          .from(subscriptions)
          .where(eq(subscriptions.environment, env))
          .orderBy(desc(subscriptions.createdAt))
          .limit(200),
        db
          .select({ event: billingEvents.event, planKey: billingEvents.planKey, intervalKey: billingEvents.intervalKey, metadata: billingEvents.metadata, createdAt: billingEvents.createdAt })
          .from(billingEvents)
          .where(eq(billingEvents.environment, env))
          .orderBy(desc(billingEvents.createdAt))
          .limit(500),
        db
          .select({ id: complimentaryAccess.id, userId: complimentaryAccess.userId, tier: complimentaryAccess.tier, expiresAt: complimentaryAccess.expiresAt, note: complimentaryAccess.note, revoked: complimentaryAccess.revoked, createdAt: complimentaryAccess.createdAt })
          .from(complimentaryAccess)
          .where(eq(complimentaryAccess.revoked, false))
          .orderBy(desc(complimentaryAccess.createdAt))
          .limit(100),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(profiles)
          .then((r) => r[0]!.n),
      ]),
    );

    const active = subs.filter((row) => ["active", "trialing"].includes(row.status));
    const mrr = active.reduce((sum, row) => {
      const monthly = (row.amount ?? 0) / (row.billingInterval === "year" ? 12 : 1) / 100;
      return sum + monthly;
    }, 0);

    const funnel: Record<string, number> = {};
    for (const event of events) funnel[event.event] = (funnel[event.event] ?? 0) + 1;

    // Revenue is reported from provider-confirmed payment events only.
    const paid = events.filter((event) => event.event === "payment_succeeded");
    const amountOf = (event: { metadata: unknown }) => {
      const meta = (event.metadata ?? {}) as { total?: string | number | null };
      const total = Number(meta.total ?? 0);
      return Number.isFinite(total) ? total / 100 : 0;
    };
    const totalRevenue = paid.reduce((sum, event) => sum + amountOf(event), 0);
    const recentPayments = paid.slice(0, 20).map((event) => {
      const meta = (event.metadata ?? {}) as { currency?: string | null };
      return {
        date: event.createdAt,
        amount: amountOf(event),
        currency: meta.currency ?? "USD",
      };
    });

    const totalSubscribers = new Set(active.map((row) => row.userId)).size;

    return {
      environment: env,
      totals: {
        learners: learnerCount,
        freeUsers: Math.max(learnerCount - totalSubscribers, 0),
        subscribers: totalSubscribers,
        subscriptions: subs.length,
        active: active.length,
        monthly: active.filter((row) => row.billingInterval !== "year").length,
        yearly: active.filter((row) => row.billingInterval === "year").length,
        trialing: subs.filter((row) => row.status === "trialing").length,
        pastDue: subs.filter((row) => row.status === "past_due").length,
        canceled: subs.filter((row) => row.status === "canceled").length,
        cancelling: subs.filter((row) => row.cancelAtPeriodEnd).length,
        failedPayments: funnel["payment_failed"] ?? 0,
        totalRevenue,
        mrr,
      },
      funnel,
      recentPayments,
      // snake_case to match the shape admin-billing.tsx already expects.
      subscriptions: subs.map((r) => ({
        user_id: r.userId,
        price_id: r.priceId,
        product_id: r.productId,
        status: r.status,
        amount: r.amount,
        currency: r.currency,
        billing_interval: r.billingInterval,
        current_period_end: r.currentPeriodEnd,
        cancel_at_period_end: r.cancelAtPeriodEnd,
        created_at: r.createdAt,
      })),
      complimentary: comps.map((r) => ({
        id: r.id,
        user_id: r.userId,
        tier: r.tier,
        expires_at: r.expiresAt,
        note: r.note,
        revoked: r.revoked,
        created_at: r.createdAt,
      })),
    };
  });

export const grantComplimentaryAccess = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: { email: string; tier: string; days?: number; note?: string }) =>
    z
      .object({
        email: z.string().email(),
        tier: z.enum(["premium", "ielts_pro"]),
        days: z.number().int().min(1).max(3650).optional(),
        note: z.string().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const profileRows = await withAdmin((db) =>
      db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, data.email)).limit(1),
    );
    const profile = profileRows[0];
    if (!profile) throw new Error("No learner with that email.");

    const expiresAt = data.days ? new Date(Date.now() + data.days * 86_400_000).toISOString() : null;

    await withAdmin((db) =>
      db.insert(complimentaryAccess).values({
        userId: profile.id,
        tier: data.tier,
        expiresAt,
        note: data.note ?? "",
        grantedBy: context.userId,
      }),
    );

    await logAdminAction(context.userId, "complimentary_granted", profile.id, {
      tier: data.tier,
      days: data.days ?? null,
    });
    return { ok: true };
  });

export const revokeComplimentaryAccess = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await withAdmin((db) =>
      db
        .update(complimentaryAccess)
        .set({ revoked: true, updatedAt: new Date().toISOString() })
        .where(eq(complimentaryAccess.id, data.id)),
    );
    await logAdminAction(context.userId, "complimentary_revoked", null, { id: data.id });
    return { ok: true };
  });

/**
 * Membership roster for the admin "Premium members" panel. Tier is derived from
 * provider-synced subscriptions and complimentary grants — never from the
 * browser.
 */
export const adminListMembers = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: { search?: string } | undefined) =>
    z.object({ search: z.string().max(120).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const env = getPaddleEnvironment();
    const search = (data.search ?? "").trim();

    const [profileRows, subs, comps, plans] = await withAdmin((db) =>
      Promise.all([
        db
          .select({ id: profiles.id, fullName: profiles.fullName, email: profiles.email, englishLevel: profiles.englishLevel, createdAt: profiles.createdAt })
          .from(profiles)
          .where(search ? or(ilike(profiles.email, `%${search}%`), ilike(profiles.fullName, `%${search}%`)) : undefined)
          .orderBy(desc(profiles.createdAt))
          .limit(300),
        db
          .select({
            userId: subscriptions.userId,
            priceId: subscriptions.priceId,
            status: subscriptions.status,
            billingInterval: subscriptions.billingInterval,
            amount: subscriptions.amount,
            currency: subscriptions.currency,
            currentPeriodStart: subscriptions.currentPeriodStart,
            currentPeriodEnd: subscriptions.currentPeriodEnd,
            cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
            createdAt: subscriptions.createdAt,
          })
          .from(subscriptions)
          .where(eq(subscriptions.environment, env))
          .orderBy(desc(subscriptions.createdAt)),
        db
          .select({ id: complimentaryAccess.id, userId: complimentaryAccess.userId, tier: complimentaryAccess.tier, expiresAt: complimentaryAccess.expiresAt, note: complimentaryAccess.note, createdAt: complimentaryAccess.createdAt })
          .from(complimentaryAccess)
          .where(eq(complimentaryAccess.revoked, false)),
        db.select({ planKey: billingPlans.planKey, tier: billingPlans.tier, name: billingPlans.name, monthlyPriceId: billingPlans.monthlyPriceId, yearlyPriceId: billingPlans.yearlyPriceId, limits: billingPlans.limits }).from(billingPlans),
      ]),
    );

    const rank = (tier: string) => (tier === "ielts_pro" ? 2 : tier === "premium" ? 1 : 0);
    const planFor = (priceId: string) => plans.find((p) => p.monthlyPriceId === priceId || p.yearlyPriceId === priceId) ?? null;

    const now = Date.now();
    // Mirrors has_active_subscription()/effective_tier() in SQL, grace window
    // included — this roster must not call someone Premium that the content
    // gates treat as free, or the other way round.
    const graceMs = (plan: { limits?: unknown } | null) => {
      const raw = (plan?.limits as Record<string, unknown> | undefined)?.["grace_period_days"];
      return (typeof raw === "number" && raw > 0 ? Math.min(raw, 365) : 0) * 86_400_000;
    };

    const members = profileRows.map((profile) => {
      const sub = subs.find((row) => row.userId === profile.id) ?? null;
      const subPlan = sub ? planFor(sub.priceId) : null;
      const endsAt = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : null;
      const subLive =
        sub !== null &&
        ((["active", "trialing", "past_due"].includes(sub.status) &&
          (endsAt === null || endsAt + graceMs(subPlan) > now)) ||
          (sub.status === "canceled" && endsAt !== null && endsAt > now));

      const comp =
        comps
          .filter((row) => row.userId === profile.id && (!row.expiresAt || new Date(row.expiresAt).getTime() > now))
          .sort((a, b) => rank(b.tier) - rank(a.tier))[0] ?? null;

      const paidTier = subLive ? (subPlan?.tier ?? "premium") : "free";
      const compTier = comp?.tier ?? "free";
      const useComp = rank(compTier) > rank(paidTier);
      const tier = useComp ? compTier : paidTier;

      return {
        userId: profile.id,
        name: profile.fullName ?? "",
        email: profile.email ?? "",
        level: profile.englishLevel ?? "",
        joinedAt: profile.createdAt,
        tier,
        planName: useComp ? compTier : (subPlan?.name ?? (paidTier === "free" ? "Free" : paidTier)),
        source: useComp ? ("complimentary" as const) : subLive ? ("paid" as const) : ("free" as const),
        status: useComp ? "complimentary" : (sub?.status ?? "none"),
        interval: sub?.billingInterval ?? "",
        amount: sub?.amount ?? null,
        currency: sub?.currency ?? "USD",
        startedAt: useComp ? (comp?.createdAt ?? null) : (sub?.currentPeriodStart ?? null),
        expiresAt: useComp ? (comp?.expiresAt ?? null) : (sub?.currentPeriodEnd ?? null),
        cancelAtPeriodEnd: Boolean(sub?.cancelAtPeriodEnd),
        complimentaryId: comp?.id ?? null,
      };
    });

    return { environment: env, members };
  });

/**
 * Removes every complimentary grant for one learner. Paid subscriptions are not
 * touched here — those are cancelled through the provider so the money side and
 * the access side stay in sync.
 */
export const revokeMemberComplimentary = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await withAdmin((db) =>
      db
        .update(complimentaryAccess)
        .set({ revoked: true, updatedAt: new Date().toISOString() })
        .where(and(eq(complimentaryAccess.userId, data.userId), eq(complimentaryAccess.revoked, false))),
    );
    await logAdminAction(context.userId, "complimentary_revoked_all", data.userId, {});
    return { ok: true };
  });
