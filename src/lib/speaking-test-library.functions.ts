import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { withAnon, withUser } from "@/db";
import { speakingTestProgress } from "@/db/schema/schema";
import { getOptionalUserId, requireAuth } from "@/lib/require-auth";

const examSchema = z.object({ exam: z.enum(["ielts", "toefl", "pte"]) });

/** Calls the original speaking_test_catalogue(_exam) Postgres function as-is
 * (same reasoning as every other *_catalogue function in this migration). */
export const getSpeakingTestCatalogue = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => examSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getOptionalUserId();
    const query = (db: Parameters<Parameters<typeof withAnon>[0]>[0]) =>
      db.execute(sql`select * from speaking_test_catalogue(${data.exam})`);
    const rows = userId ? await withUser(userId, query) : await withAnon(query);
    return rows as unknown as {
      id: string;
      exam: string;
      part: number;
      slug: string;
      topic: string;
      difficulty: string;
      task_type: string;
      task_label: string;
      instructions: string;
      questions: string[];
      cue_card: string;
      cue_points: string[];
      preparation_time: number;
      speaking_time: number;
      test_number: number;
      is_free: boolean;
      sort_order: number;
      unlocked: boolean;
    }[];
  });

export const getMyTestProgress = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const rows = await withUser(context.userId, (db) =>
      db
        .select({
          testId: speakingTestProgress.testId,
          attempts: speakingTestProgress.attempts,
          lastBand: speakingTestProgress.lastBand,
          bestBand: speakingTestProgress.bestBand,
          completedAt: speakingTestProgress.completedAt,
        })
        .from(speakingTestProgress)
        .where(eq(speakingTestProgress.userId, context.userId)),
    );
    return rows.map((r) => ({
      test_id: r.testId,
      attempts: r.attempts,
      last_band: r.lastBand === null ? null : Number(r.lastBand),
      best_band: r.bestBand === null ? null : Number(r.bestBand),
      completed_at: r.completedAt,
    }));
  });

const recordAttemptSchema = z.object({ testId: z.string().uuid(), band: z.number().nullable() });

/** Mirrors the original "read existing, then update or insert" exactly —
 * speaking_test_progress has no unique (user_id, test_id) constraint to
 * upsert against, which is presumably why the original did it this way
 * rather than a Postgres-level upsert. */
export const recordSpeakingTestAttempt = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => recordAttemptSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    await withUser(userId, async (db) => {
      const existingRows = await db
        .select({ id: speakingTestProgress.id, attempts: speakingTestProgress.attempts, bestBand: speakingTestProgress.bestBand })
        .from(speakingTestProgress)
        .where(and(eq(speakingTestProgress.userId, userId), eq(speakingTestProgress.testId, data.testId)))
        .limit(1);
      const existing = existingRows[0];
      const best =
        data.band === null
          ? existing?.bestBand === undefined
            ? null
            : existing.bestBand === null
              ? null
              : Number(existing.bestBand)
          : Math.max(data.band, Number(existing?.bestBand ?? 0)) || data.band;

      if (existing) {
        await db
          .update(speakingTestProgress)
          .set({
            attempts: existing.attempts + 1,
            lastBand: data.band === null ? null : String(data.band),
            bestBand: best === null ? null : String(best),
            completedAt: new Date().toISOString(),
          })
          .where(eq(speakingTestProgress.id, existing.id));
      } else {
        await db.insert(speakingTestProgress).values({
          userId,
          testId: data.testId,
          attempts: 1,
          lastBand: data.band === null ? null : String(data.band),
          bestBand: best === null ? null : String(best),
          completedAt: new Date().toISOString(),
        });
      }
    });
    return { ok: true };
  });
