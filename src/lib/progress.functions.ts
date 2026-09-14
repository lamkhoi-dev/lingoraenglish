import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gte } from "drizzle-orm";

import { withUser } from "@/db";
import {
  conversationSessions,
  listeningAttempts,
  listeningProgress,
  pronunciationScores,
  shadowingProgress,
  speakingAttempts,
  vocabularyProgress,
} from "@/db/schema/schema";
import type { SpeakingAnalysis } from "@/lib/lily.functions";
import { requireAuth } from "@/lib/require-auth";

// Postgres `numeric` columns come back from drizzle-orm as strings (avoids
// silent precision loss) — Supabase's PostgREST used to hand these to the
// client as bare JSON numbers, which is what every caller here still
// expects, so convert at this boundary rather than touching every UI.
function num(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/** Dashboard's 5 skill-area score bars. */
export const getDashboardProgress = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const [speaking, vocab, listening, pron, sessions] = await withUser(userId, (db) =>
      Promise.all([
        db
          .select({ overall: speakingAttempts.overall })
          .from(speakingAttempts)
          .where(eq(speakingAttempts.userId, userId))
          .limit(50),
        db
          .select({ mastered: vocabularyProgress.mastered })
          .from(vocabularyProgress)
          .where(eq(vocabularyProgress.userId, userId))
          .limit(500),
        db
          .select({ score: listeningAttempts.score })
          .from(listeningAttempts)
          .where(eq(listeningAttempts.userId, userId))
          .limit(50),
        db
          .select({ score: pronunciationScores.score })
          .from(pronunciationScores)
          .where(eq(pronunciationScores.userId, userId))
          .limit(100),
        db
          .select({ performance: conversationSessions.performance })
          .from(conversationSessions)
          .where(eq(conversationSessions.userId, userId))
          .limit(50),
      ]),
    );

    const avg = (values: (string | null)[], scale = 10) => {
      const nums = values.map(num).filter((v): v is number => v !== null);
      if (!nums.length) return 0;
      return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * (100 / scale));
    };
    const mastered = vocab.filter((r) => r.mastered).length;

    return {
      speaking: avg(speaking.map((r) => r.overall)),
      vocabulary: Math.min(100, mastered * 2),
      grammar: avg(sessions.map((r) => r.performance)),
      listening: avg(listening.map((r) => r.score), 100),
      pronunciation: avg(pron.map((r) => r.score), 100),
    };
  });

/** "Today's practice" completion — derived from activity rows created/updated
 * since local midnight, matching the original per-table existence checks. */
export const getTodayCompletion = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const since = todayStart.toISOString();

    const [vocab, speaking, shadowing, listening] = await withUser(userId, (db) =>
      Promise.all([
        db
          .select({ id: vocabularyProgress.id })
          .from(vocabularyProgress)
          .where(and(eq(vocabularyProgress.userId, userId), gte(vocabularyProgress.updatedAt, since)))
          .limit(1),
        db
          .select({ id: speakingAttempts.id })
          .from(speakingAttempts)
          .where(and(eq(speakingAttempts.userId, userId), gte(speakingAttempts.createdAt, since)))
          .limit(1),
        db
          .select({ id: shadowingProgress.id })
          .from(shadowingProgress)
          .where(and(eq(shadowingProgress.userId, userId), gte(shadowingProgress.lastPractisedAt, since)))
          .limit(1),
        db
          .select({ id: listeningProgress.id })
          .from(listeningProgress)
          .where(and(eq(listeningProgress.userId, userId), gte(listeningProgress.updatedAt, since)))
          .limit(1),
      ]),
    );

    return {
      vocabulary: vocab.length > 0,
      aiSpeaking: speaking.length > 0,
      shadowing: shadowing.length > 0,
      listeningLab: listening.length > 0,
    };
  });

export type ProgressSpeakingRow = {
  id: string;
  question_text: string;
  transcript: string;
  fluency: number | null;
  grammar: number | null;
  vocabulary: number | null;
  overall: number | null;
  mistakes: SpeakingAnalysis["mistakes"];
  corrections: SpeakingAnalysis["corrections"];
  better_vocabulary: SpeakingAnalysis["better_vocabulary"];
  natural_answer: string | null;
  feedback: string;
  created_at: string;
};
export type ProgressSessionRow = {
  id: string;
  topic: string;
  duration_seconds: number;
  performance: number | null;
  feedback: string;
  created_at: string;
};
export type ProgressSoundRow = { sound: string; score: number };

/** /progress page: last 10 speaking attempts, last 10 conversation sessions,
 * every pronunciation score, and a lessons-completed count — same shape
 * PostgREST used to return, so the page's render code doesn't need to change. */
export const getMyProgressHistory = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const [speakingRows, sessionRows, soundRows, listened, mastered] = await withUser(userId, (db) =>
      Promise.all([
        db
          .select({
            id: speakingAttempts.id,
            questionText: speakingAttempts.questionText,
            transcript: speakingAttempts.transcript,
            fluency: speakingAttempts.fluency,
            grammar: speakingAttempts.grammar,
            vocabulary: speakingAttempts.vocabulary,
            overall: speakingAttempts.overall,
            mistakes: speakingAttempts.mistakes,
            corrections: speakingAttempts.corrections,
            betterVocabulary: speakingAttempts.betterVocabulary,
            naturalAnswer: speakingAttempts.naturalAnswer,
            feedback: speakingAttempts.feedback,
            createdAt: speakingAttempts.createdAt,
          })
          .from(speakingAttempts)
          .where(eq(speakingAttempts.userId, userId))
          .orderBy(desc(speakingAttempts.createdAt))
          .limit(10),
        db
          .select({
            id: conversationSessions.id,
            topic: conversationSessions.topic,
            durationSeconds: conversationSessions.durationSeconds,
            performance: conversationSessions.performance,
            feedback: conversationSessions.feedback,
            createdAt: conversationSessions.createdAt,
          })
          .from(conversationSessions)
          .where(eq(conversationSessions.userId, userId))
          .orderBy(desc(conversationSessions.createdAt))
          .limit(10),
        db
          .select({ sound: pronunciationScores.sound, score: pronunciationScores.score })
          .from(pronunciationScores)
          .where(eq(pronunciationScores.userId, userId))
          .orderBy(pronunciationScores.score),
        db.select({ id: listeningAttempts.id }).from(listeningAttempts).where(eq(listeningAttempts.userId, userId)),
        db
          .select({ id: vocabularyProgress.id })
          .from(vocabularyProgress)
          .where(and(eq(vocabularyProgress.userId, userId), eq(vocabularyProgress.mastered, true))),
      ]),
    );

    const speaking: ProgressSpeakingRow[] = speakingRows.map((row) => ({
      id: row.id,
      question_text: row.questionText,
      transcript: row.transcript,
      fluency: num(row.fluency),
      grammar: num(row.grammar),
      vocabulary: num(row.vocabulary),
      overall: num(row.overall),
      mistakes: (row.mistakes as SpeakingAnalysis["mistakes"]) ?? [],
      corrections: (row.corrections as SpeakingAnalysis["corrections"]) ?? [],
      better_vocabulary: (row.betterVocabulary as SpeakingAnalysis["better_vocabulary"]) ?? [],
      natural_answer: row.naturalAnswer,
      feedback: row.feedback,
      created_at: row.createdAt,
    }));
    const sessions: ProgressSessionRow[] = sessionRows.map((row) => ({
      id: row.id,
      topic: row.topic,
      duration_seconds: row.durationSeconds,
      performance: num(row.performance),
      feedback: row.feedback,
      created_at: row.createdAt,
    }));
    const sounds: ProgressSoundRow[] = soundRows.map((row) => ({ sound: row.sound, score: Number(row.score) }));

    return { speaking, sessions, sounds, lessonsCount: listened.length + mastered.length };
  });
