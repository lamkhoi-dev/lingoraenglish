import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import { withUser } from "@/db";
import {
  coachSessions,
  listeningAttempts,
  listeningLessons,
  listeningProgress,
  pronunciationScores,
  shadowingProgress,
  shadowingSentences,
  speakingAttempts,
  speakingTestProgress,
  speakingTests,
  vocabularyProgress,
  vocabularyWords,
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

/**
 * Yêu cầu 13 — everything the progress page shows, from real rows only.
 *
 * The four percentages are **completion**, not average score: "số mục đã hoàn
 * thành trên tổng số mục có sẵn". The spec rules out average-score bars
 * explicitly, which is what this page used to render.
 *
 *  - Speaking     = (shadowing mastered + speaking tests completed) / everything published
 *                   in those two. Coach sessions are excluded from the ratio on purpose:
 *                   conversations are unlimited, so there is no denominator — the count
 *                   is reported on its own in the Speaking section instead.
 *  - Listening    = lessons completed / published lessons
 *  - Pronunciation= sounds mastered / 44
 *  - Vocabulary   = words marked learned / published words
 *
 * "Mastered" for a sound is `pronunciation_scores.mastered`, set by
 * pronunciation.functions.ts when clear_runs reaches 2 — i.e. two consecutive
 * attempts scoring >= 90, and lost again after a lower score. The page states
 * that threshold to the learner, per "cần định nghĩa rõ ngưỡng".
 */
export const getProgressOverview = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { SOUND_COUNT } = await import("./pronunciation-sounds.server");

    const count = (rows: { n: number }[]) => rows[0]?.n ?? 0;
    const one = sql<number>`count(*)::int`;

    const [
      coachCount,
      shadowDone,
      shadowTotal,
      testsDone,
      testsTotal,
      listenRows,
      listenTotal,
      soundsMastered,
      vocabLearned,
      vocabTotal,
      speakingScores,
    ] = await withUser(userId, (db) =>
      Promise.all([
        db.select({ n: one }).from(coachSessions).where(eq(coachSessions.userId, userId)),
        db
          .select({ n: one })
          .from(shadowingProgress)
          .where(
            and(eq(shadowingProgress.userId, userId), eq(shadowingProgress.status, "mastered")),
          ),
        db
          .select({ n: one })
          .from(shadowingSentences)
          .where(eq(shadowingSentences.status, "published")),
        db
          .select({ n: one })
          .from(speakingTestProgress)
          .where(
            and(
              eq(speakingTestProgress.userId, userId),
              sql`${speakingTestProgress.completedAt} is not null`,
            ),
          ),
        db.select({ n: one }).from(speakingTests).where(eq(speakingTests.status, "published")),
        db
          .select({
            comprehension: listeningProgress.comprehensionScore,
            dictation: listeningProgress.dictationScore,
            seconds: listeningProgress.secondsListened,
            completedAt: listeningProgress.completedAt,
          })
          .from(listeningProgress)
          .where(eq(listeningProgress.userId, userId)),
        db
          .select({ n: one })
          .from(listeningLessons)
          .where(eq(listeningLessons.status, "published")),
        db
          .select({ n: one })
          .from(pronunciationScores)
          .where(
            and(eq(pronunciationScores.userId, userId), eq(pronunciationScores.mastered, true)),
          ),
        db
          .select({ n: one })
          .from(vocabularyProgress)
          .where(and(eq(vocabularyProgress.userId, userId), eq(vocabularyProgress.mastered, true))),
        db.select({ n: one }).from(vocabularyWords).where(eq(vocabularyWords.status, "published")),
        db
          .select({ overall: speakingAttempts.overall })
          .from(speakingAttempts)
          .where(eq(speakingAttempts.userId, userId)),
      ]),
    );

    const pct = (done: number, total: number) =>
      total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    const average = (values: (number | null)[]) => {
      const nums = values.filter((v): v is number => v !== null);
      return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
    };

    const listenCompleted = listenRows.filter((r) => r.completedAt !== null).length;
    const speakingDone = count(shadowDone) + count(testsDone);
    const speakingTotalItems = count(shadowTotal) + count(testsTotal);
    const overallScores = speakingScores.map((r) => num(r.overall));

    return {
      skills: {
        speaking: pct(speakingDone, speakingTotalItems),
        listening: pct(listenCompleted, count(listenTotal)),
        pronunciation: pct(count(soundsMastered), SOUND_COUNT),
        vocabulary: pct(count(vocabLearned), count(vocabTotal)),
      },
      speaking: {
        coachSessions: count(coachCount),
        shadowingCompleted: count(shadowDone),
        shadowingTotal: count(shadowTotal),
        testsCompleted: count(testsDone),
        testsTotal: count(testsTotal),
        averageScore: average(overallScores),
      },
      listening: {
        lessonsCompleted: listenCompleted,
        lessonsTotal: count(listenTotal),
        comprehension: average(listenRows.map((r) => r.comprehension)),
        dictation: average(listenRows.map((r) => r.dictation)),
        secondsListened: listenRows.reduce((sum, r) => sum + r.seconds, 0),
      },
      pronunciation: { mastered: count(soundsMastered), total: SOUND_COUNT },
      vocabulary: { learned: count(vocabLearned), total: count(vocabTotal) },
      /** Drives the empty state — nothing practised yet must not render zeros
       * as if they were results (Yêu cầu 13: "không hiển thị số liệu giả"). */
      hasData:
        count(coachCount) > 0 ||
        count(shadowDone) > 0 ||
        count(testsDone) > 0 ||
        listenRows.length > 0 ||
        count(soundsMastered) > 0 ||
        count(vocabLearned) > 0 ||
        speakingScores.length > 0,
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
            id: coachSessions.id,
            topic: coachSessions.topicTitle,
            createdAt: coachSessions.createdAt,
            updatedAt: coachSessions.updatedAt,
            userTurns: coachSessions.userTurns,
          })
          .from(coachSessions)
          .where(eq(coachSessions.userId, userId))
          .orderBy(desc(coachSessions.createdAt))
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
      duration_seconds: Math.max(60, row.userTurns * 60),
      performance: null,
      feedback: "",
      created_at: row.createdAt,
    }));
    const sounds: ProgressSoundRow[] = soundRows.map((row) => ({ sound: row.sound, score: Number(row.score) }));

    return { speaking, sessions, sounds, lessonsCount: listened.length + mastered.length };
  });
