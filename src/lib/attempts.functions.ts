/**
 * "Save my own practice attempt" writes — shared by every practice surface
 * (AI Speaking Coach, IELTS/TOEFL/PTE speaking tests, and later pronunciation/
 * shadowing/vocabulary-speak) instead of each page repeating the same insert.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { withUser } from "@/db";
import { ieltsAttempts, pronunciationAttempts, speakingAttempts } from "@/db/schema/schema";
import { requireAuth } from "@/lib/require-auth";

const numOrNull = (n: number | null) => (n === null ? null : String(n));

/* ------------------------------ speaking attempt ---------------------------- */

const saveSpeakingAttemptSchema = z.object({
  questionText: z.string().max(2000),
  transcript: z.string().max(20000),
  fluency: z.number().nullable(),
  grammar: z.number().nullable(),
  vocabulary: z.number().nullable(),
  overall: z.number().nullable(),
  mistakes: z.array(z.object({ wrong: z.string(), why: z.string() })),
  corrections: z.array(z.object({ from: z.string(), to: z.string() })),
  betterVocabulary: z.array(z.object({ instead_of: z.string(), use: z.string() })),
  naturalAnswer: z.string(),
  feedback: z.string(),
});

export const saveSpeakingAttempt = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => saveSpeakingAttemptSchema.parse(d))
  .handler(async ({ data, context }) => {
    await withUser(context.userId, (db) =>
      db.insert(speakingAttempts).values({
        userId: context.userId,
        questionText: data.questionText,
        transcript: data.transcript,
        fluency: numOrNull(data.fluency),
        grammar: numOrNull(data.grammar),
        vocabulary: numOrNull(data.vocabulary),
        overall: numOrNull(data.overall),
        mistakes: data.mistakes,
        corrections: data.corrections,
        betterVocabulary: data.betterVocabulary,
        naturalAnswer: data.naturalAnswer,
        feedback: data.feedback,
      }),
    );
    return { ok: true };
  });

/* -------------------------------- ielts attempt ------------------------------ */

const saveIeltsAttemptSchema = z.object({
  part: z.number().int().min(1).max(3),
  questionText: z.string().max(2000),
  transcript: z.string().max(20000),
  fluencyCoherence: z.number().nullable(),
  lexicalResource: z.number().nullable(),
  grammaticalRange: z.number().nullable(),
  pronunciation: z.number().nullable(),
  estimatedBand: z.number().nullable(),
  feedback: z.string(),
  correctedAnswer: z.string(),
  naturalAnswer: z.string(),
  band6Version: z.string(),
  band7Version: z.string(),
  band8Version: z.string(),
});

export const saveIeltsAttempt = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => saveIeltsAttemptSchema.parse(d))
  .handler(async ({ data, context }) => {
    await withUser(context.userId, (db) =>
      db.insert(ieltsAttempts).values({
        userId: context.userId,
        part: data.part,
        questionText: data.questionText,
        transcript: data.transcript,
        fluencyCoherence: numOrNull(data.fluencyCoherence),
        lexicalResource: numOrNull(data.lexicalResource),
        grammaticalRange: numOrNull(data.grammaticalRange),
        pronunciation: numOrNull(data.pronunciation),
        estimatedBand: numOrNull(data.estimatedBand),
        feedback: data.feedback,
        correctedAnswer: data.correctedAnswer,
        naturalAnswer: data.naturalAnswer,
        band6Version: data.band6Version,
        band7Version: data.band7Version,
        band8Version: data.band8Version,
      }),
    );
    return { ok: true };
  });

/* --------------------------- pronunciation attempt --------------------------- */

const savePronunciationAttemptSchema = z.object({
  mode: z.string().max(60),
  target: z.string().max(2000),
  targetSound: z.string().max(20).nullable(),
  transcript: z.string().max(20000),
  accuracy: z.number().nullable(),
  feedback: z.string(),
  isDemo: z.boolean(),
});

export const savePronunciationAttempt = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => savePronunciationAttemptSchema.parse(d))
  .handler(async ({ data, context }) => {
    await withUser(context.userId, (db) =>
      db.insert(pronunciationAttempts).values({
        userId: context.userId,
        mode: data.mode,
        target: data.target,
        targetSound: data.targetSound,
        transcript: data.transcript,
        accuracy: numOrNull(data.accuracy),
        feedback: data.feedback,
        isDemo: data.isDemo,
      }),
    );
    return { ok: true };
  });
