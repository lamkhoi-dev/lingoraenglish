import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { withAnon, withUser } from "@/db";
import { vocabularyProgress, vocabularyTranslations, vocabularyWords } from "@/db/schema/schema";
import { getOptionalUserId, requireAuth } from "@/lib/require-auth";

const listSchema = z.object({ category: z.string().max(60).optional() });

/** Public word list — anon visitors see free-tier words only; a logged-in
 * caller's real entitlement (free/premium/ielts_pro) applies via the
 * `can_access_tier(access_tier)` RLS policy once auth.uid() resolves, so
 * this must run through withUser() when a session exists, not always withAnon().
 * `access_tier` is set per word to match "first 10 words of each category are
 * free" (Yêu cầu 7), computed by the loader from `sort_order` — ordered here
 * by `sort_order` (easy → hard) so both "first 10 free" and the on-screen
 * ordering come from the same source of truth instead of insert order. */
export const getVocabularyWords = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getOptionalUserId();
    const query = (db: Parameters<Parameters<typeof withAnon>[0]>[0]) =>
      db
        .select({
          id: vocabularyWords.id,
          word: vocabularyWords.word,
          ipa: vocabularyWords.ipa,
          meaningEn: vocabularyWords.meaningEn,
          meaningVi: vocabularyWords.meaningVi,
          category: vocabularyWords.category,
          level: vocabularyWords.level,
          exampleSentence: vocabularyWords.exampleSentence,
          exampleVi: vocabularyWords.exampleVi,
          usageContext: vocabularyWords.usageContext,
          synonyms: vocabularyWords.synonyms,
          antonyms: vocabularyWords.antonyms,
          sortOrder: vocabularyWords.sortOrder,
        })
        .from(vocabularyWords)
        .where(
          and(
            eq(vocabularyWords.status, "published"),
            data.category ? eq(vocabularyWords.category, data.category) : undefined,
          ),
        )
        .orderBy(asc(vocabularyWords.sortOrder), asc(vocabularyWords.createdAt))
        .limit(data.category ? 120 : 200);
    return userId ? withUser(userId, query) : withAnon(query);
  });

const translationsSchema = z.object({
  locale: z.string().max(8),
  wordIds: z.array(z.string().uuid()).max(200),
});

export const getVocabularyTranslations = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => translationsSchema.parse(d))
  .handler(async ({ data }) => {
    if (data.wordIds.length === 0) return [];
    const userId = await getOptionalUserId();
    const query = (db: Parameters<Parameters<typeof withAnon>[0]>[0]) =>
      db
        .select({
          wordId: vocabularyTranslations.wordId,
          meaning: vocabularyTranslations.meaning,
          exampleTranslation: vocabularyTranslations.exampleTranslation,
        })
        .from(vocabularyTranslations)
        .where(
          and(eq(vocabularyTranslations.locale, data.locale), inArray(vocabularyTranslations.wordId, data.wordIds)),
        );
    return userId ? withUser(userId, query) : withAnon(query);
  });

export const getMyVocabularyProgress = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    return withUser(userId, (db) =>
      db
        .select({ wordId: vocabularyProgress.wordId, mastered: vocabularyProgress.mastered })
        .from(vocabularyProgress)
        .where(eq(vocabularyProgress.userId, userId)),
    );
  });

const toggleSchema = z.object({ wordId: z.string().uuid(), mastered: z.boolean() });

export const toggleVocabularyWordKnown = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => toggleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    await withUser(userId, (db) =>
      db
        .insert(vocabularyProgress)
        .values({ userId, wordId: data.wordId, mastered: data.mastered, timesPracticed: 1 })
        .onConflictDoUpdate({
          target: [vocabularyProgress.userId, vocabularyProgress.wordId],
          set: { mastered: data.mastered, timesPracticed: sql`${vocabularyProgress.timesPracticed} + 1` },
        }),
    );
    return { ok: true };
  });

const recordPracticeSchema = z.object({ wordId: z.string().uuid() });

/** Called after a completed "Use it in Speaking" attempt (vocab-speak.tsx) —
 * this is the only thing that makes that flow count as vocabulary progress
 * instead of only ever landing in speaking_attempts. Never touches
 * `mastered`: speaking practice increases the practice count, it doesn't by
 * itself mark a word "known" (that stays the learner's own checkbox call). */
export const recordVocabularyPractice = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => recordPracticeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    await withUser(userId, (db) =>
      db
        .insert(vocabularyProgress)
        .values({ userId, wordId: data.wordId, timesPracticed: 1 })
        .onConflictDoUpdate({
          target: [vocabularyProgress.userId, vocabularyProgress.wordId],
          set: { timesPracticed: sql`${vocabularyProgress.timesPracticed} + 1` },
        }),
    );
    return { ok: true };
  });
