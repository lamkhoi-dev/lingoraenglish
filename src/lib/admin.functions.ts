/**
 * Admin dashboard: student roster, usage counters, content access-tier
 * editing, and UI translation overrides. Every handler is gated by
 * requireAdmin (re-verifies the 'admin' role server-side on every call —
 * the client-side `isAdmin` flag in admin.tsx is a UI convenience only).
 */
import { createServerFn } from "@tanstack/react-start";
import { desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import { withAdmin } from "@/db";
import {
  aiUsageLog,
  grammarLessons,
  ieltsQuestions,
  listeningExercises,
  profiles,
  speakingQuestions,
  ttsCache,
  uiLanguages,
  uiTranslations,
  vocabularyWords,
} from "@/db/schema/schema";
import { bustLanguagesCache, bustLocaleCache } from "@/lib/i18n.functions";
import { requireAdmin } from "@/lib/require-auth";
import { logAdminAction } from "./entitlements.server";

/* -------------------------------- overview ----------------------------- */

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const [studentsCount, requestsCount, cacheCount, students, usageRows] = await withAdmin((db) =>
      Promise.all([
        db.select({ n: sql<number>`count(*)::int` }).from(profiles).then((r) => r[0]!.n),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(aiUsageLog)
          .where(gte(aiUsageLog.createdAt, since))
          .then((r) => r[0]!.n),
        db.select({ n: sql<number>`count(*)::int` }).from(ttsCache).then((r) => r[0]!.n),
        db
          .select({
            id: profiles.id,
            fullName: profiles.fullName,
            email: profiles.email,
            englishLevel: profiles.englishLevel,
            createdAt: profiles.createdAt,
          })
          .from(profiles)
          .orderBy(desc(profiles.createdAt))
          .limit(50),
        db
          .select({ capability: aiUsageLog.capability })
          .from(aiUsageLog)
          .where(gte(aiUsageLog.createdAt, since))
          .limit(1000),
      ]),
    );

    return {
      counts: { students: studentsCount, requests: requestsCount, cache: cacheCount },
      students: students.map((s) => ({
        id: s.id,
        full_name: s.fullName,
        email: s.email,
        english_level: s.englishLevel,
        created_at: s.createdAt,
      })),
      usage: usageRows.map((r) => r.capability),
    };
  });

/**
 * Mục 3.2: "Trang quản trị có báo cáo mức sử dụng theo từng tính năng và theo
 * thời gian" plus the budget/alert state. Aggregated in Postgres rather than
 * pulling rows out and counting them here — the log grows with every AI call,
 * so it must not be read into memory to be summarised.
 */
export const getAiCostReport = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { getCostStatus } = await import("./ai-cost.server");
    const [byFeature, byDay, status] = await Promise.all([
      withAdmin((db) =>
        db.execute(sql`
          select capability, count(*)::int as calls,
                 coalesce(sum(estimated_cost_micro_usd), 0)::bigint as cost_micro_usd
          from ai_usage_log
          where created_at >= now() - interval '30 days'
          group by capability
          order by cost_micro_usd desc
        `),
      ),
      withAdmin((db) =>
        db.execute(sql`
          select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
                 count(*)::int as calls,
                 coalesce(sum(estimated_cost_micro_usd), 0)::bigint as cost_micro_usd
          from ai_usage_log
          where created_at >= now() - interval '30 days'
          group by 1
          order by 1
        `),
      ),
      getCostStatus(),
    ]);

    const toUsd = (micro: string | number) => Number(micro) / 1_000_000;
    return {
      byFeature: (byFeature as unknown as { capability: string; calls: number; cost_micro_usd: string }[]).map(
        (r) => ({ capability: r.capability, calls: r.calls, costUsd: toUsd(r.cost_micro_usd) }),
      ),
      byDay: (byDay as unknown as { day: string; calls: number; cost_micro_usd: string }[]).map((r) => ({
        day: r.day,
        calls: r.calls,
        costUsd: toUsd(r.cost_micro_usd),
      })),
      today: {
        spentUsd: toUsd(status.spentMicroUsd),
        budgetUsd: status.budgetMicroUsd === null ? null : toUsd(status.budgetMicroUsd),
        alertThresholdPercent: status.alertThresholdPercent,
        alerting: status.alerting,
        overBudget: status.overBudget,
      },
    };
  });

const costSettingsSchema = z.object({
  dailyBudgetUsd: z.number().min(0).max(100000).nullable(),
  alertThresholdPercent: z.number().int().min(1).max(100),
});

/** Lets the customer set the budget themselves — no redeploy to change a number. */
export const updateAiCostSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => costSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const budgetMicro = data.dailyBudgetUsd === null ? null : Math.round(data.dailyBudgetUsd * 1_000_000);
    await withAdmin((db) =>
      db.execute(sql`
        update ai_cost_settings
        set daily_budget_micro_usd = ${budgetMicro},
            alert_threshold_percent = ${data.alertThresholdPercent},
            updated_at = now()
        where id
      `),
    );
    await logAdminAction(context.userId, "ai_cost_settings_updated", null, {
      dailyBudgetUsd: data.dailyBudgetUsd,
      alertThresholdPercent: data.alertThresholdPercent,
    });
    return { ok: true };
  });

/* --------------------------------- content ------------------------------- */

export const getAdminContent = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const [vocab, grammar, speakingQ, ieltsQ, listening] = await withAdmin((db) =>
      Promise.all([
        db
          .select({
            id: vocabularyWords.id,
            word: vocabularyWords.word,
            status: vocabularyWords.status,
            accessTier: vocabularyWords.accessTier,
            updatedAt: vocabularyWords.updatedAt,
          })
          .from(vocabularyWords)
          .orderBy(desc(vocabularyWords.updatedAt))
          .limit(50),
        db
          .select({
            id: grammarLessons.id,
            title: grammarLessons.title,
            status: grammarLessons.status,
            accessTier: grammarLessons.accessTier,
            updatedAt: grammarLessons.updatedAt,
          })
          .from(grammarLessons)
          .orderBy(desc(grammarLessons.updatedAt))
          .limit(50),
        db
          .select({
            id: speakingQuestions.id,
            prompt: speakingQuestions.prompt,
            status: speakingQuestions.status,
            updatedAt: speakingQuestions.updatedAt,
          })
          .from(speakingQuestions)
          .orderBy(desc(speakingQuestions.updatedAt))
          .limit(50),
        db
          .select({
            id: ieltsQuestions.id,
            prompt: ieltsQuestions.prompt,
            status: ieltsQuestions.status,
            accessTier: ieltsQuestions.accessTier,
            updatedAt: ieltsQuestions.updatedAt,
          })
          .from(ieltsQuestions)
          .orderBy(desc(ieltsQuestions.updatedAt))
          .limit(50),
        db
          .select({
            id: listeningExercises.id,
            title: listeningExercises.title,
            status: listeningExercises.status,
            accessTier: listeningExercises.accessTier,
            updatedAt: listeningExercises.updatedAt,
          })
          .from(listeningExercises)
          .orderBy(desc(listeningExercises.updatedAt))
          .limit(50),
      ]),
    );

    return {
      vocab: vocab.map((r) => ({ id: r.id, word: r.word, status: r.status, access_tier: r.accessTier, updated_at: r.updatedAt })),
      grammar: grammar.map((r) => ({ id: r.id, title: r.title, status: r.status, access_tier: r.accessTier, updated_at: r.updatedAt })),
      speakingQ: speakingQ.map((r) => ({ id: r.id, prompt: r.prompt, status: r.status, updated_at: r.updatedAt })),
      ieltsQ: ieltsQ.map((r) => ({ id: r.id, prompt: r.prompt, status: r.status, access_tier: r.accessTier, updated_at: r.updatedAt })),
      listening: listening.map((r) => ({ id: r.id, title: r.title, status: r.status, access_tier: r.accessTier, updated_at: r.updatedAt })),
    };
  });

const CONTENT_TABLES = ["vocabulary_words", "grammar_lessons", "listening_exercises", "ielts_questions"] as const;

const setAccessTierSchema = z.object({
  table: z.enum(CONTENT_TABLES),
  rowId: z.string().uuid(),
  tier: z.enum(["free", "premium", "ielts_pro"]),
});

export const setContentAccessTier = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => setAccessTierSchema.parse(d))
  .handler(async ({ data }) => {
    await withAdmin(async (db) => {
      if (data.table === "vocabulary_words") {
        await db.update(vocabularyWords).set({ accessTier: data.tier }).where(eq(vocabularyWords.id, data.rowId));
      } else if (data.table === "grammar_lessons") {
        await db.update(grammarLessons).set({ accessTier: data.tier }).where(eq(grammarLessons.id, data.rowId));
      } else if (data.table === "listening_exercises") {
        await db.update(listeningExercises).set({ accessTier: data.tier }).where(eq(listeningExercises.id, data.rowId));
      } else {
        await db.update(ieltsQuestions).set({ accessTier: data.tier }).where(eq(ieltsQuestions.id, data.rowId));
      }
    });
    return { ok: true };
  });

/* ------------------------------ translations ----------------------------- */

const localeSchema = z.object({ locale: z.string().max(8) });

export const getTranslationOverrides = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => localeSchema.parse(d))
  .handler(async ({ data }) => {
    const rows = await withAdmin((db) =>
      db
        .select({ translationKey: uiTranslations.translationKey, value: uiTranslations.value })
        .from(uiTranslations)
        .where(eq(uiTranslations.locale, data.locale))
        .limit(2000),
    );
    return rows.map((r) => ({ translation_key: r.translationKey, value: r.value }));
  });

const saveTranslationSchema = z.object({
  locale: z.string().max(8),
  key: z.string().max(200),
  value: z.string().max(5000),
});

export const saveTranslationOverride = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => saveTranslationSchema.parse(d))
  .handler(async ({ data }) => {
    await withAdmin((db) =>
      db
        .insert(uiTranslations)
        .values({ locale: data.locale, translationKey: data.key, value: data.value })
        .onConflictDoUpdate({
          target: [uiTranslations.locale, uiTranslations.translationKey],
          set: { value: data.value },
        }),
    );
    bustLocaleCache(data.locale);
    return { ok: true };
  });

const bulkImportSchema = z.object({
  locale: z.string().max(8),
  entries: z.record(z.string().max(200), z.string().max(5000)).refine((e) => Object.keys(e).length > 0 && Object.keys(e).length <= 2000),
});

/** Bulk touch-up path for an admin pasting/editing many keys of one locale
 * at once — the primary bulk path for a brand new language is still
 * scripts/load-languages.py (matches every other content type in this
 * codebase: seed JSON + a loader script, not a big admin upload widget). */
export const adminBulkImportTranslations = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => bulkImportSchema.parse(d))
  .handler(async ({ data }) => {
    const rows = Object.entries(data.entries).map(([key, value]) => ({
      locale: data.locale,
      translationKey: key,
      value,
    }));
    await withAdmin((db) =>
      db
        .insert(uiTranslations)
        .values(rows)
        .onConflictDoUpdate({
          target: [uiTranslations.locale, uiTranslations.translationKey],
          set: { value: sql`excluded.value` },
        }),
    );
    bustLocaleCache(data.locale);
    return { ok: true, count: rows.length };
  });

/* -------------------------------------------------------------- languages */

const createLanguageSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(8)
    .regex(/^[a-zA-Z-]+$/, "Use a BCP-47-style code, e.g. th or zh-CN"),
  nativeName: z.string().min(1).max(100),
  englishName: z.string().min(1).max(100),
  flag: z.string().max(8).default(""),
  direction: z.enum(["ltr", "rtl"]).default("ltr"),
  intlTag: z.string().min(2).max(20),
});

/** Registers one new interface language as a pure data row — this, plus the
 * ui_translations rows for its dictionary (loaded via scripts/load-languages.py
 * or filled in by hand afterwards from the translations tab), is the entire
 * mechanism Yêu cầu 8 requires for "add a language without touching source
 * code or redeploying". */
export const adminCreateLanguage = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => createLanguageSchema.parse(d))
  .handler(async ({ data }) => {
    await withAdmin((db) =>
      db
        .insert(uiLanguages)
        .values({
          code: data.code,
          nativeName: data.nativeName,
          englishName: data.englishName,
          flag: data.flag,
          direction: data.direction,
          intlTag: data.intlTag,
        })
        .onConflictDoUpdate({
          target: [uiLanguages.code],
          set: {
            nativeName: data.nativeName,
            englishName: data.englishName,
            flag: data.flag,
            direction: data.direction,
            intlTag: data.intlTag,
          },
        }),
    );
    bustLanguagesCache();
    return { ok: true };
  });
