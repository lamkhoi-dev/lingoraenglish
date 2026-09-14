import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { withAnon, withUser } from "@/db";
import { listeningLessons, listeningProgress } from "@/db/schema/schema";
import { getOptionalUserId, requireAuth } from "@/lib/require-auth";

/** Public catalogue — calls the original listening_catalogue() Postgres
 * function (same "don't reimplement a tier-gated query" reasoning as the
 * other *_catalogue functions in this migration). */
export const getListeningCatalogue = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await getOptionalUserId();
  const query = (db: Parameters<Parameters<typeof withAnon>[0]>[0]) => db.execute(sql`select * from listening_catalogue()`);
  const rows = userId ? await withUser(userId, query) : await withAnon(query);
  return rows as unknown as {
    id: string;
    slug: string;
    title: string;
    level: string;
    category: string;
    topic: string;
    difficulty: number;
    duration_seconds: number;
    accent: string;
    question_count: number;
    dictation_count: number;
    is_free: boolean;
    sort_order: number;
    unlocked: boolean;
  }[];
});

export const getMyListeningProgress = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const rows = await withUser(context.userId, (db) =>
      db
        .select({
          lessonId: listeningProgress.lessonId,
          comprehensionScore: listeningProgress.comprehensionScore,
          dictationScore: listeningProgress.dictationScore,
          overallScore: listeningProgress.overallScore,
          attempts: listeningProgress.attempts,
          secondsListened: listeningProgress.secondsListened,
          weakAreas: listeningProgress.weakAreas,
          completedAt: listeningProgress.completedAt,
        })
        .from(listeningProgress)
        .where(eq(listeningProgress.userId, context.userId)),
    );
    return rows.map((r) => ({
      lesson_id: r.lessonId,
      comprehension_score: r.comprehensionScore,
      dictation_score: r.dictationScore,
      overall_score: r.overallScore,
      attempts: r.attempts,
      seconds_listened: r.secondsListened,
      weak_areas: (r.weakAreas as string[] | null) ?? [],
      completed_at: r.completedAt,
    }));
  });

const lessonIdSchema = z.object({ id: z.string().uuid() });

/** Single lesson body — only reached from the UI once the catalogue already
 * marked the card `unlocked`, but RLS (is_free OR can_access_tier('premium'))
 * is the real gate; anon can still read free lessons directly by id. */
export const getListeningLesson = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => lessonIdSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getOptionalUserId();
    const query = (db: Parameters<Parameters<typeof withAnon>[0]>[0]) =>
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
        })
        .from(listeningLessons)
        .where(eq(listeningLessons.id, data.id))
        .limit(1);
    const rows = userId ? await withUser(userId, query) : await withAnon(query);
    const row = rows[0];
    if (!row) return null;
    const questions = Array.isArray(row.questions) ? row.questions : [];
    const dictation = Array.isArray(row.dictation) ? row.dictation : [];
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      level: row.level,
      category: row.category,
      topic: row.topic,
      difficulty: row.difficulty,
      duration_seconds: row.durationSeconds,
      accent: row.accent,
      script: Array.isArray(row.script) ? row.script : [],
      questions,
      dictation,
      connected_speech: Array.isArray(row.connectedSpeech) ? row.connectedSpeech : [],
      is_free: row.isFree,
      sort_order: row.sortOrder,
      question_count: questions.length,
      dictation_count: dictation.length,
      unlocked: true,
    };
  });

const saveProgressSchema = z.object({
  lessonId: z.string().uuid(),
  comprehensionScore: z.number().int(),
  dictationScore: z.number().int(),
  overallScore: z.number().int(),
  secondsListened: z.number().int().min(0),
  weakAreas: z.array(z.string()),
});

/** Mirrors the original "read existing row, then upsert with accumulated
 * attempts/seconds_listened" logic exactly — attempts increments and
 * seconds_listened adds onto the previous total rather than overwriting it. */
export const saveListeningProgress = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => saveProgressSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const saved = await withUser(userId, async (db) => {
      const existingRows = await db
        .select({ attempts: listeningProgress.attempts, secondsListened: listeningProgress.secondsListened })
        .from(listeningProgress)
        .where(and(eq(listeningProgress.userId, userId), eq(listeningProgress.lessonId, data.lessonId)))
        .limit(1);
      const existing = existingRows[0];
      const nextAttempts = (existing?.attempts ?? 0) + 1;
      const nextSeconds = (existing?.secondsListened ?? 0) + data.secondsListened;

      const rows = await db
        .insert(listeningProgress)
        .values({
          userId,
          lessonId: data.lessonId,
          comprehensionScore: data.comprehensionScore,
          dictationScore: data.dictationScore,
          overallScore: data.overallScore,
          attempts: nextAttempts,
          secondsListened: nextSeconds,
          weakAreas: data.weakAreas,
          completedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: [listeningProgress.userId, listeningProgress.lessonId],
          set: {
            comprehensionScore: data.comprehensionScore,
            dictationScore: data.dictationScore,
            overallScore: data.overallScore,
            attempts: nextAttempts,
            secondsListened: nextSeconds,
            weakAreas: data.weakAreas,
            completedAt: new Date().toISOString(),
          },
        })
        .returning({
          lessonId: listeningProgress.lessonId,
          comprehensionScore: listeningProgress.comprehensionScore,
          dictationScore: listeningProgress.dictationScore,
          overallScore: listeningProgress.overallScore,
          attempts: listeningProgress.attempts,
          secondsListened: listeningProgress.secondsListened,
          completedAt: listeningProgress.completedAt,
        });
      return rows[0]!;
    });

    return {
      lesson_id: saved.lessonId,
      comprehension_score: saved.comprehensionScore,
      dictation_score: saved.dictationScore,
      overall_score: saved.overallScore,
      attempts: saved.attempts,
      seconds_listened: saved.secondsListened,
      completed_at: saved.completedAt,
    };
  });
