import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { withAnon, withUser } from "@/db";
import { shadowingProgress } from "@/db/schema/schema";
import { getOptionalUserId, requireAuth } from "@/lib/require-auth";

const numOrNull = (n: number | null) => (n === null ? null : String(n));

/** Topic list with sentence counts — not tier-gated itself (no auth.uid()
 * dependency in the original SQL function), so always safe via withAnon(). */
export const getShadowingTopics = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await withAnon((db) => db.execute(sql`select * from shadowing_topic_overview()`));
  return rows as unknown as {
    slug: string;
    name: string;
    topic_group: string;
    blurb: string;
    sort_order: number;
    total_sentences: number;
    free_sentences: number;
  }[];
});

const topicSlugSchema = z.object({ topicSlug: z.string().max(200) });

/** Sentence bodies are tier-gated (is_free OR can_access_tier('premium')) —
 * same optional-auth branching as every other *_catalogue-style function. */
export const getShadowingSentences = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => topicSlugSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getOptionalUserId();
    const query = (db: Parameters<Parameters<typeof withAnon>[0]>[0]) =>
      db.execute(sql`select * from shadowing_topic_sentences(${data.topicSlug})`);
    const rows = userId ? await withUser(userId, query) : await withAnon(query);
    return rows as unknown as {
      id: string;
      sort_order: number;
      level: string;
      difficulty: number;
      sentence_type: string;
      sentence: string;
      natural_form: string;
      accent: string;
      pronunciation_focus: string;
      stress_focus: string;
      intonation_focus: string;
      connected_speech_focus: string;
      vocabulary: { word: string; meaning: string }[];
      grammar_focus: string;
      tags: string[];
      is_free: boolean;
      unlocked: boolean;
    }[];
  });

export const getMyShadowingProgress = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const rows = await withUser(context.userId, (db) =>
      db
        .select({
          sentenceId: shadowingProgress.sentenceId,
          attempts: shadowingProgress.attempts,
          clearAttempts: shadowingProgress.clearAttempts,
          bestAccuracy: shadowingProgress.bestAccuracy,
          lastAccuracy: shadowingProgress.lastAccuracy,
          status: shadowingProgress.status,
          secondsPractised: shadowingProgress.secondsPractised,
          lastPractisedAt: shadowingProgress.lastPractisedAt,
        })
        .from(shadowingProgress)
        .where(eq(shadowingProgress.userId, context.userId)),
    );
    return rows.map((r) => ({
      sentence_id: r.sentenceId,
      attempts: r.attempts,
      clear_attempts: r.clearAttempts,
      best_accuracy: r.bestAccuracy === null ? null : Number(r.bestAccuracy),
      last_accuracy: r.lastAccuracy === null ? null : Number(r.lastAccuracy),
      status: r.status as "in_progress" | "needs_practice" | "strong" | "mastered",
      seconds_practised: r.secondsPractised,
      last_practised_at: r.lastPractisedAt,
    }));
  });

const saveShadowingProgressSchema = z.object({
  sentenceId: z.string().uuid(),
  attempts: z.number().int(),
  clearAttempts: z.number().int(),
  bestAccuracy: z.number().nullable(),
  lastAccuracy: z.number().nullable(),
  status: z.enum(["in_progress", "needs_practice", "strong", "mastered"]),
  secondsPractised: z.number().int(),
});

/** Plain upsert, matching the original exactly — the client (not the
 * server) computes the next attempts/clear_attempts/best_accuracy from the
 * progress row it already holds, same trust level as the original upsert. */
export const saveShadowingProgress = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => saveShadowingProgressSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const rows = await withUser(userId, (db) =>
      db
        .insert(shadowingProgress)
        .values({
          userId,
          sentenceId: data.sentenceId,
          attempts: data.attempts,
          clearAttempts: data.clearAttempts,
          bestAccuracy: numOrNull(data.bestAccuracy),
          lastAccuracy: numOrNull(data.lastAccuracy),
          status: data.status,
          secondsPractised: data.secondsPractised,
          lastPractisedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: [shadowingProgress.userId, shadowingProgress.sentenceId],
          set: {
            attempts: data.attempts,
            clearAttempts: data.clearAttempts,
            bestAccuracy: numOrNull(data.bestAccuracy),
            lastAccuracy: numOrNull(data.lastAccuracy),
            status: data.status,
            secondsPractised: data.secondsPractised,
            lastPractisedAt: new Date().toISOString(),
          },
        })
        .returning({
          sentenceId: shadowingProgress.sentenceId,
          attempts: shadowingProgress.attempts,
          clearAttempts: shadowingProgress.clearAttempts,
          bestAccuracy: shadowingProgress.bestAccuracy,
          lastAccuracy: shadowingProgress.lastAccuracy,
          status: shadowingProgress.status,
          secondsPractised: shadowingProgress.secondsPractised,
          lastPractisedAt: shadowingProgress.lastPractisedAt,
        }),
    );
    const saved = rows[0]!;
    return {
      sentence_id: saved.sentenceId,
      attempts: saved.attempts,
      clear_attempts: saved.clearAttempts,
      best_accuracy: saved.bestAccuracy === null ? null : Number(saved.bestAccuracy),
      last_accuracy: saved.lastAccuracy === null ? null : Number(saved.lastAccuracy),
      status: saved.status as "in_progress" | "needs_practice" | "strong" | "mastered",
      seconds_practised: saved.secondsPractised,
      last_practised_at: saved.lastPractisedAt,
    };
  });
