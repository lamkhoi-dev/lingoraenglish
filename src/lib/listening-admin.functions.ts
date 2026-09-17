/**
 * Admin management for Listening Lab lessons (mục 4.3: "công cụ quản trị để bổ
 * sung, chỉnh sửa học liệu về sau mà không cần sửa mã nguồn").
 *
 * Until now Listening had a bulk loader (scripts/load-listening.py) but no
 * dashboard editor, so fixing a typo in one of the 119 lessons meant SSHing to
 * the VPS and re-running a script. Same shape as pronunciation-admin.functions.ts:
 * every handler re-checks admin on the server, and "delete" is a status toggle,
 * never a hard row delete.
 */
import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { withAdmin } from "@/db";
import { listeningLessons } from "@/db/schema/schema";
import { LISTENING_CATEGORIES } from "@/lib/listening-content";
import { requireAdmin } from "@/lib/require-auth";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const ACCENTS = ["american", "british", "canadian", "australian"] as const;

/** Mirrors ListeningQuestion / DictationItem / ScriptLine in listening-content.ts —
 * the page reads these straight out of the jsonb, so a malformed save would
 * break the lesson at practice time rather than here. */
const scriptLine = z.object({
  speaker: z.string().min(1).max(60),
  line: z.string().min(1).max(600),
});

const question = z.object({
  type: z.string().min(1).max(40),
  prompt: z.string().min(1).max(400),
  options: z.array(z.string().min(1).max(200)).min(2).max(6),
  answer: z.string().min(1).max(200),
  explanation: z.string().max(600).default(""),
  skill: z.string().min(1).max(40),
});

const dictationItem = z.object({
  sentence: z.string().min(1).max(400),
  blanks: z.array(z.string().min(1).max(80)).min(1).max(10),
  challenge: z.string().min(1).max(40),
  explanation: z.string().max(600).default(""),
});

const connectedSpeechNote = z.object({
  written: z.string().min(1).max(200),
  spoken: z.string().min(1).max(200),
});

const lessonInput = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Slug is lowercase letters, numbers and hyphens only."),
  title: z.string().min(2).max(200),
  level: z.enum(LEVELS).default("A1"),
  category: z.enum(LISTENING_CATEGORIES),
  topic: z.string().max(160).default(""),
  difficulty: z.number().int().min(1).max(5).default(1),
  duration_seconds: z.number().int().min(5).max(1800).default(30),
  accent: z.enum(ACCENTS).default("american"),
  script: z.array(scriptLine).min(1).max(80),
  questions: z.array(question).max(20).default([]),
  dictation: z.array(dictationItem).max(20).default([]),
  connected_speech: z.array(connectedSpeechNote).max(20).default([]),
  sort_order: z.number().int().min(0).max(9999),
  status: z.enum(["published", "draft"]).default("published"),
});

/** Every lesson plus a per-category tally, so the editor can show how the
 * seven categories compare without a second round trip. */
export const adminListListeningLessons = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const rows = await withAdmin((db) =>
      db
        .select({
          id: listeningLessons.id,
          slug: listeningLessons.slug,
          title: listeningLessons.title,
          level: listeningLessons.level,
          category: listeningLessons.category,
          topic: listeningLessons.topic,
          difficulty: listeningLessons.difficulty,
          durationSeconds: listeningLessons.durationSeconds,
          accent: listeningLessons.accent,
          script: listeningLessons.script,
          questions: listeningLessons.questions,
          dictation: listeningLessons.dictation,
          connectedSpeech: listeningLessons.connectedSpeech,
          isFree: listeningLessons.isFree,
          sortOrder: listeningLessons.sortOrder,
          status: listeningLessons.status,
        })
        .from(listeningLessons)
        .orderBy(asc(listeningLessons.category), asc(listeningLessons.sortOrder)),
    );

    const tally = new Map<string, { total: number; free: number }>();
    for (const r of rows) {
      const entry = tally.get(r.category) ?? { total: 0, free: 0 };
      entry.total += 1;
      if (r.isFree) entry.free += 1;
      tally.set(r.category, entry);
    }

    return {
      lessons: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        level: r.level,
        category: r.category,
        topic: r.topic,
        difficulty: r.difficulty,
        duration_seconds: r.durationSeconds,
        accent: r.accent,
        script: r.script as z.infer<typeof scriptLine>[],
        questions: r.questions as z.infer<typeof question>[],
        dictation: r.dictation as z.infer<typeof dictationItem>[],
        connected_speech: r.connectedSpeech as z.infer<typeof connectedSpeechNote>[],
        is_free: r.isFree,
        sort_order: r.sortOrder,
        status: r.status,
      })),
      tally: Object.fromEntries(
        LISTENING_CATEGORIES.map((c) => [c, tally.get(c) ?? { total: 0, free: 0 }]),
      ),
      categories: LISTENING_CATEGORIES,
    };
  });

export const adminSaveListeningLesson = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => lessonInput.parse(d))
  .handler(async ({ data }) => {
    const { id, ...fields } = data;
    // is_free is deliberately absent: Yêu cầu 9 puts that under
    // billing_plans.limits.listening_free_categories, applied by
    // resyncContentFreeRanks(). Editing it here would just be overwritten.
    const values = {
      slug: fields.slug,
      title: fields.title,
      level: fields.level,
      category: fields.category,
      topic: fields.topic,
      difficulty: fields.difficulty,
      durationSeconds: fields.duration_seconds,
      accent: fields.accent,
      script: fields.script,
      questions: fields.questions,
      dictation: fields.dictation,
      connectedSpeech: fields.connected_speech,
      sortOrder: fields.sort_order,
      status: fields.status,
      updatedAt: new Date().toISOString(),
    };
    if (id) {
      await withAdmin((db) =>
        db.update(listeningLessons).set(values).where(eq(listeningLessons.id, id)),
      );
      return { id };
    }
    const rows = await withAdmin((db) =>
      db.insert(listeningLessons).values(values).returning({ id: listeningLessons.id }),
    );
    return { id: rows[0]!.id };
  });

/** Soft "delete", matching the convention across the other admin modules. */
export const adminSetListeningLessonStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["published", "draft"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    await withAdmin((db) =>
      db
        .update(listeningLessons)
        .set({ status: data.status, updatedAt: new Date().toISOString() })
        .where(eq(listeningLessons.id, data.id)),
    );
    return { ok: true };
  });
