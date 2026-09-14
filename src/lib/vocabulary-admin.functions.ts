/**
 * Admin management for the Vocabulary word library (100 words/category,
 * easy → hard) — same pattern as pronunciation-admin.functions.ts: every
 * handler verifies the caller is an admin on the server first, so the
 * library can be grown or edited from the dashboard without code changes.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gt, lte } from "drizzle-orm";
import { z } from "zod";

import { withAdmin } from "@/db";
import { vocabularyWords } from "@/db/schema/schema";
import { VOCAB_CATEGORIES } from "@/lib/ipa-data";
import { requireAdmin } from "@/lib/require-auth";

const CATEGORIES = VOCAB_CATEGORIES as readonly string[];
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

const wordInput = z.object({
  id: z.string().uuid().optional(),
  category: z.enum(CATEGORIES as [string, ...string[]]),
  word: z.string().min(1).max(100),
  ipa: z.string().max(100).default(""),
  meaningEn: z.string().min(1).max(500),
  meaningVi: z.string().max(500).default(""),
  exampleSentence: z.string().min(1).max(500),
  exampleVi: z.string().max(500).default(""),
  usageContext: z.string().max(500).default(""),
  level: z.enum(LEVELS).default("B1"),
  synonyms: z.array(z.string().min(1).max(60)).max(10).default([]),
  antonyms: z.array(z.string().min(1).max(60)).max(10).default([]),
  accessTier: z.enum(["free", "premium", "ielts_pro"]).default("premium"),
  sortOrder: z.number().int().min(1).max(9999),
  status: z.enum(["published", "draft"]).default("published"),
});

/** Every word across all categories, with a per-category total/free tally —
 * mirrors adminListPronunciationLessons' tally shape, computed over the
 * fixed VOCAB_CATEGORIES list. */
export const adminListVocabularyWords = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const rows = await withAdmin((db) =>
      db
        .select({
          id: vocabularyWords.id,
          category: vocabularyWords.category,
          word: vocabularyWords.word,
          ipa: vocabularyWords.ipa,
          meaningEn: vocabularyWords.meaningEn,
          meaningVi: vocabularyWords.meaningVi,
          exampleSentence: vocabularyWords.exampleSentence,
          exampleVi: vocabularyWords.exampleVi,
          usageContext: vocabularyWords.usageContext,
          level: vocabularyWords.level,
          synonyms: vocabularyWords.synonyms,
          antonyms: vocabularyWords.antonyms,
          accessTier: vocabularyWords.accessTier,
          sortOrder: vocabularyWords.sortOrder,
          status: vocabularyWords.status,
        })
        .from(vocabularyWords)
        .orderBy(asc(vocabularyWords.category), asc(vocabularyWords.sortOrder)),
    );

    const tally = new Map<string, { total: number; free: number }>();
    for (const row of rows) {
      if (row.status !== "published") continue;
      const t = tally.get(row.category) ?? { total: 0, free: 0 };
      t.total += 1;
      if (row.accessTier === "free") t.free += 1;
      tally.set(row.category, t);
    }

    return {
      words: rows.map((r) => ({
        id: r.id,
        category: r.category,
        word: r.word,
        ipa: r.ipa,
        meaning_en: r.meaningEn,
        meaning_vi: r.meaningVi,
        example_sentence: r.exampleSentence,
        example_vi: r.exampleVi,
        usage_context: r.usageContext,
        level: r.level,
        synonyms: r.synonyms,
        antonyms: r.antonyms,
        access_tier: r.accessTier,
        sort_order: r.sortOrder,
        status: r.status,
      })),
      tally: Object.fromEntries(CATEGORIES.map((c) => [c, tally.get(c) ?? { total: 0, free: 0 }])),
    };
  });

export const adminSaveVocabularyWord = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => wordInput.parse(d))
  .handler(async ({ data }) => {
    const { id, ...fields } = data;
    const values = {
      category: fields.category,
      word: fields.word,
      ipa: fields.ipa,
      meaningEn: fields.meaningEn,
      meaningVi: fields.meaningVi,
      exampleSentence: fields.exampleSentence,
      exampleVi: fields.exampleVi,
      usageContext: fields.usageContext,
      level: fields.level,
      synonyms: fields.synonyms.length > 0 ? fields.synonyms : [""],
      antonyms: fields.antonyms.length > 0 ? fields.antonyms : [""],
      accessTier: fields.accessTier,
      sortOrder: fields.sortOrder,
      status: fields.status,
    };
    if (id) {
      await withAdmin((db) => db.update(vocabularyWords).set(values).where(eq(vocabularyWords.id, id)));
      return { id };
    }
    const rows = await withAdmin((db) =>
      db.insert(vocabularyWords).values(values).returning({ id: vocabularyWords.id }),
    );
    return { id: rows[0]!.id };
  });

/** The codebase's "delete" convention (see shadowing/pronunciation admin) is
 * a soft status toggle, never a hard row delete. */
export const adminSetVocabularyWordStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["published", "draft"]) }).parse(d))
  .handler(async ({ data }) => {
    await withAdmin((db) => db.update(vocabularyWords).set({ status: data.status }).where(eq(vocabularyWords.id, data.id)));
    return { ok: true };
  });

/** Marks the first N words (by sort_order) of one category free and the
 * rest premium — mirrors adminSetPronunciationFreeCount exactly. */
export const adminSetVocabularyFreeCount = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ category: z.enum(CATEGORIES as [string, ...string[]]), free_count: z.number().int().min(0).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    await withAdmin(async (db) => {
      await db
        .update(vocabularyWords)
        .set({ accessTier: "free" })
        .where(and(eq(vocabularyWords.category, data.category), lte(vocabularyWords.sortOrder, data.free_count)));
      await db
        .update(vocabularyWords)
        .set({ accessTier: "premium" })
        .where(and(eq(vocabularyWords.category, data.category), gt(vocabularyWords.sortOrder, data.free_count)));
    });
    return { ok: true };
  });
