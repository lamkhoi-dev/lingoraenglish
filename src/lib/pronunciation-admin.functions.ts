/**
 * Admin management for the Pronunciation "advanced skills" library (word
 * stress, sentence stress, intonation, connected speech, reductions,
 * rhythm, chunking, fluency) — same pattern as shadowing-admin.functions.ts:
 * every handler verifies the caller is an admin on the server first, so the
 * library can be grown or edited from the dashboard without code changes.
 */
import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { withAdmin } from "@/db";
import { pronunciationLessons } from "@/db/schema/schema";
import { requireAdmin } from "@/lib/require-auth";

const SKILLS = [
  "word-stress",
  "sentence-stress",
  "intonation",
  "connected-speech",
  "reductions",
  "rhythm",
  "chunking",
  "fluency",
] as const;
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const ACCENTS = ["us", "uk"] as const;

const itemInput = z.object({
  text: z.string().min(1).max(300),
  pattern: z.string().max(200).optional(),
  note: z.string().max(300).optional(),
});

const lessonInput = z.object({
  id: z.string().uuid().optional(),
  skill: z.enum(SKILLS),
  title: z.string().min(2).max(160),
  level: z.enum(LEVELS).default("beginner"),
  difficulty: z.enum(DIFFICULTIES).default("easy"),
  accent: z.enum(ACCENTS).default("us"),
  explain: z.string().max(500).default(""),
  points: z.array(z.string().min(1).max(200)).max(10).default([]),
  items: z.array(itemInput).min(1).max(20),
  caution: z.string().max(400).default(""),
  is_free: z.boolean().default(false),
  sort_order: z.number().int().min(1).max(9999),
  status: z.enum(["published", "draft"]).default("published"),
});

/** Every lesson across all 8 skills, with a per-skill total/free tally —
 * mirrors adminListShadowTopics' tally shape, just computed over the fixed
 * SKILLS list instead of a dynamic topics table. */
export const adminListPronunciationLessons = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const rows = await withAdmin((db) =>
      db
        .select({
          id: pronunciationLessons.id,
          skill: pronunciationLessons.skill,
          title: pronunciationLessons.title,
          level: pronunciationLessons.level,
          difficulty: pronunciationLessons.difficulty,
          accent: pronunciationLessons.accent,
          explain: pronunciationLessons.explain,
          points: pronunciationLessons.points,
          items: pronunciationLessons.items,
          caution: pronunciationLessons.caution,
          isFree: pronunciationLessons.isFree,
          sortOrder: pronunciationLessons.sortOrder,
          status: pronunciationLessons.status,
        })
        .from(pronunciationLessons)
        .orderBy(asc(pronunciationLessons.skill), asc(pronunciationLessons.sortOrder)),
    );

    const tally = new Map<string, { total: number; free: number }>();
    for (const row of rows) {
      if (row.status !== "published") continue;
      const t = tally.get(row.skill) ?? { total: 0, free: 0 };
      t.total += 1;
      if (row.isFree) t.free += 1;
      tally.set(row.skill, t);
    }

    return {
      lessons: rows.map((r) => ({
        id: r.id,
        skill: r.skill,
        title: r.title,
        level: r.level,
        difficulty: r.difficulty,
        accent: r.accent,
        explain: r.explain,
        points: r.points,
        items: r.items as { text: string; pattern?: string; note?: string }[],
        caution: r.caution,
        is_free: r.isFree,
        sort_order: r.sortOrder,
        status: r.status,
      })),
      tally: Object.fromEntries(SKILLS.map((s) => [s, tally.get(s) ?? { total: 0, free: 0 }])),
    };
  });

export const adminSavePronunciationLesson = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => lessonInput.parse(d))
  .handler(async ({ data }) => {
    const { id, ...fields } = data;
    const values = {
      skill: fields.skill,
      title: fields.title,
      level: fields.level,
      difficulty: fields.difficulty,
      accent: fields.accent,
      explain: fields.explain,
      points: fields.points,
      items: fields.items,
      caution: fields.caution,
      isFree: fields.is_free,
      sortOrder: fields.sort_order,
      status: fields.status,
    };
    if (id) {
      await withAdmin((db) => db.update(pronunciationLessons).set(values).where(eq(pronunciationLessons.id, id)));
      return { id };
    }
    const rows = await withAdmin((db) =>
      db.insert(pronunciationLessons).values(values).returning({ id: pronunciationLessons.id }),
    );
    return { id: rows[0]!.id };
  });

/** The codebase's "delete" convention (see shadowing/coach admin) is a soft
 * status toggle, never a hard row delete. */
export const adminSetPronunciationLessonStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["published", "draft"]) }).parse(d))
  .handler(async ({ data }) => {
    await withAdmin((db) =>
      db.update(pronunciationLessons).set({ status: data.status }).where(eq(pronunciationLessons.id, data.id)),
    );
    return { ok: true };
  });

// Yêu cầu 9: per-skill "set free count" removed — see the matching note in
// shadowing-admin.functions.ts. The number now lives at
// billing_plans.limits.pronunciation_lessons_free_per_skill and is applied
// to every skill by entitlements.server.ts's resyncContentFreeRanks().
