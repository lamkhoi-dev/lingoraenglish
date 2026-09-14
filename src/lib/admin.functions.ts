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
  uiTranslations,
  vocabularyWords,
} from "@/db/schema/schema";
import { requireAdmin } from "@/lib/require-auth";

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
    return { ok: true };
  });
