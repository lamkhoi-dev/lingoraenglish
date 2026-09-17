import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { withAdmin, withUser } from "@/db";
import {
  aiUsageLog,
  dailyPlans,
  profiles,
  pronunciationLessons,
  pronunciationScores,
  shadowingSentences,
  speakingAttempts,
  speakingTests,
  ttsCache,
  vocabularyWords,
} from "@/db/schema/schema";
import { requireAuth } from "@/lib/require-auth";
import {
  AiNotConnectedError,
  analyseIeltsPronunciationAudio,
  analysePronunciationAudio,
  currentAudioProvider,
  currentLlmModel,
  currentSttModel,
  currentTextProvider,
  currentTtsModel,
  llmJson,
  providerStatuses,
  synthesise,
  transcribe,
} from "./ai-providers.server";
import { assertWithinDailyBudget, priceCall } from "./ai-cost.server";
import { assertUnlockedOrPremium, getLimits, reserveUsage, type Capability, type Tier } from "./entitlements.server";
import { explanationLanguageSchema, langNote } from "./explanation-language";
import { findSoundIndex, isSoundIndexFree, soundPracticeTargets } from "./pronunciation-sounds.server";
import { analyseSpeakingTranscript } from "./speaking-analysis.server";
import { vocabularySpeakingQuestion } from "./vocabulary-practice";

/* ------------------------- practice-item binding ------------------------- */
// Yêu cầu 10: every AI scoring call names ONE concrete practice item, and the
// server checks both that the caller may open that item and that the text
// being scored really belongs to it. Otherwise a direct API call could skip
// the item id altogether, or pair a free item's id with a locked item's
// words, and get unlimited scoring for content the plan doesn't include.

const sameText = (a: string, b: string) => a.trim().replace(/\s+/g, " ") === b.trim().replace(/\s+/g, " ");

function assertTextBelongs(text: string, allowed: string[]) {
  if (!allowed.some((candidate) => sameText(candidate, text))) {
    throw new Error("That practice line doesn't belong to this exercise.");
  }
}

/** Same prompt list speaking-test-library.ts#testPrompts shows: the cue card
 * for IELTS Part 2, the question list for everything else. */
async function assertSpeakingTestPrompt(userId: string, testId: string, prompt: string, capability: Capability) {
  const rows = await withAdmin((db) =>
    db
      .select({ isFree: speakingTests.isFree, questions: speakingTests.questions, cueCard: speakingTests.cueCard })
      .from(speakingTests)
      .where(and(eq(speakingTests.id, testId), eq(speakingTests.status, "published")))
      .limit(1),
  );
  const test = rows[0];
  if (!test) throw new Error("That test is no longer available.");
  await assertUnlockedOrPremium(
    userId,
    test.isFree,
    capability,
    "This test is part of Lingora English Premium. Upgrade to unlock all Speaking Tests.",
  );
  const questions = Array.isArray(test.questions) ? test.questions.filter((q): q is string => typeof q === "string") : [];
  assertTextBelongs(prompt, test.cueCard ? [...questions, test.cueCard] : questions);
}

/* ----------------------------- cost control ----------------------------- */

const DAILY_AI_LIMIT = 300;

/**
 * Which plan allowance each AI capability draws from. Deliberately does NOT
 * include speaking_analysis/ielts_evaluation/pronunciation_feedback — those
 * are gated by each item's own free/premium status instead (see
 * assertUnlockedOrPremium below), which is the single source of truth for
 * AI Coach turns, Speaking Tests and Pronunciation. enforceLimit() below
 * still runs its flat daily abuse cap and cost log for every capability
 * regardless of whether it's mapped here.
 *
 * stt/tts used to be mapped to monthly stt_requests/tts_requests quotas
 * (40-100/month free) — removed 2026-09-16. That was a hidden 7th/8th limit:
 * not one of the six the customer's spec names (Yêu cầu 10), shared across
 * every recording-based feature at once (a learner well within their 3 free
 * Coach turns could still get blocked practising Pronunciation just from
 * having re-recorded 40 times that month), and never shown to the learner.
 * The spec's actual ask for this (3.1 "giới hạn tần suất... chống lạm dụng",
 * 3.2 "giới hạn chi phí theo ngày") is a flat DAILY cap across everything,
 * which DAILY_AI_LIMIT above already is — a second, monthly, per-service cap
 * on top of it was never requested. Keep in sync with MONTHLY_QUOTA_KEYS in
 * entitlements.server.ts. */
const CAPABILITY_MAP: Record<string, Capability> = {
  learning_plan: "plan",
};

/** Cost log only — the plan allowance itself was already claimed by
 * enforceLimit()'s reservation before the AI call. */
async function logUsage(
  userId: string,
  capability: string,
  units: number,
  inputTokens = 0,
  outputTokens = 0,
  model = currentLlmModel(),
) {
  const isAudio = capability === "stt" || capability === "tts";
  await withAdmin((db) =>
    db.insert(aiUsageLog).values({
      userId,
      capability,
      provider: isAudio ? currentAudioProvider() : currentTextProvider(),
      model,
      units,
      inputTokens,
      outputTokens,
      // Priced now, not at read time: model prices change, and a past call has
      // to keep what it actually cost (mục 3.2 "chi phí ước tính").
      estimatedCostMicroUsd: priceCall(model, inputTokens, outputTokens),
    }),
  );
}

/** Runs the daily abuse cap, then atomically claims one unit of the plan
 * allowance (when `capability` is metered). Returns the refund to call if
 * the AI call that follows fails, so a failed call never costs the learner
 * a use (Yêu cầu 10). */
async function enforceLimit(userId: string, capability: string): Promise<() => Promise<void>> {
  // Mục 3.2 "giới hạn chi phí theo ngày" — a whole-system spend cap, checked
  // before the per-learner call cap below. Inert until an admin sets a budget.
  await assertWithinDailyBudget();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await withAdmin((db) =>
    db.select({ id: aiUsageLog.id }).from(aiUsageLog).where(and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, since))).limit(DAILY_AI_LIMIT),
  );
  if (rows.length >= DAILY_AI_LIMIT) {
    throw new Error("You have reached today's practice limit. Come back tomorrow — Lingora English will be here!");
  }

  const mapped = CAPABILITY_MAP[capability];
  return mapped ? reserveUsage(userId, mapped) : async () => {};
}

function toError(error: unknown): never {
  if (error instanceof AiNotConnectedError) {
    throw new Error(`API not connected — ${error.capability.toUpperCase()} requires ${error.requires}.`);
  }
  throw error;
}

/* ----------------------------- provider status ----------------------------- */

export const getAiStatus = createServerFn({ method: "GET" }).handler(async () => providerStatuses());

/* ------------------------------- transcription ------------------------------ */

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ audioBase64: z.string().min(64), mimeType: z.string().default("audio/wav") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const refund = await enforceLimit(context.userId, "stt");
    try {
      const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
      const text = await transcribe(bytes, data.mimeType);
      await logUsage(context.userId, "stt", 1, 0, 0, currentSttModel());
      return { transcript: text };
    } catch (error) {
      await refund();
      toError(error);
    }
  });

/* ----------------------------- speaking analysis ---------------------------- */

const speakingSchema = z
  .object({
    question: z.string().min(1).max(500),
    transcript: z.string().min(1).max(4000),
    lang: explanationLanguageSchema,
    level: z.string().default("B1"),
    /** A TOEFL/PTE Speaking Test (the question must be one of its prompts). */
    testId: z.string().uuid().optional(),
    /** A Vocabulary word ("Use it in speaking") — the question is rebuilt
     * from the word's own row. AI Coach turns are not scored here at all:
     * coachReply scores them inside the same request that spends the turn. */
    wordId: z.string().uuid().optional(),
  })
  .refine((d) => Boolean(d.testId) !== Boolean(d.wordId), {
    message: "Choose one test or one word to practise with.",
  });

export type SpeakingAnalysis = {
  fluency: number;
  grammar: number;
  vocabulary: number;
  overall: number;
  mistakes: { wrong: string; why: string }[];
  corrections: { from: string; to: string }[];
  better_vocabulary: { instead_of: string; use: string }[];
  natural_answer: string;
  feedback: string;
};

export const analyseSpeaking = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => speakingSchema.parse(d))
  .handler(async ({ data, context }) => {
    let question = data.question;
    if (data.testId) {
      await assertSpeakingTestPrompt(context.userId, data.testId, data.question, "speaking");
    } else {
      const rows = await withAdmin((db) =>
        db
          .select({ word: vocabularyWords.word, exampleSentence: vocabularyWords.exampleSentence, accessTier: vocabularyWords.accessTier })
          .from(vocabularyWords)
          .where(and(eq(vocabularyWords.id, data.wordId!), eq(vocabularyWords.status, "published")))
          .limit(1),
      );
      const word = rows[0];
      if (!word) throw new Error("That word is no longer available.");
      await assertUnlockedOrPremium(
        context.userId,
        word.accessTier === "free",
        "speaking",
        "This word is part of Lingora English Premium. Upgrade to practise every word in the library.",
        word.accessTier as Tier,
      );
      question = vocabularySpeakingQuestion(word.word, word.exampleSentence);
    }
    await enforceLimit(context.userId, "speaking_analysis");
    try {
      const { value, inputTokens, outputTokens } = await analyseSpeakingTranscript({
        question,
        transcript: data.transcript,
        level: data.level,
        lang: data.lang,
      });
      await logUsage(context.userId, "speaking_analysis", 1, inputTokens, outputTokens);
      return value;
    } catch (error) {
      toError(error);
    }
  });

/* --------------------------------- IELTS ----------------------------------- */

export type IeltsEvaluation = {
  fluency_coherence: number;
  lexical_resource: number;
  grammatical_range: number;
  /** Scored separately from the fields above — this call only sees a
   * transcript, so Pronunciation comes from a second, audio-grounded call
   * (analyseIeltsPronunciationAudio) merged in below. Null when no audio was
   * sent or Gemini couldn't score it. */
  pronunciation: number | null;
  estimated_band: number;
  feedback: string;
  corrected_answer: string;
  natural_answer: string;
  band6_version: string;
  band7_version: string;
  band8_version: string;
};

export const evaluateIelts = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        testId: z.string().uuid(),
        part: z.number().int().min(1).max(3),
        question: z.string().max(600),
        transcript: z.string().min(1).max(5000),
        lang: explanationLanguageSchema,
        /** The learner's own recording, so Pronunciation can be scored from
         * what was actually heard instead of staying blank. Optional only
         * for schema back-compat — every caller submitting a test has the
         * recording in hand and should send it. */
        audioBase64: z.string().max(4_000_000).optional(),
        mimeType: z.string().max(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSpeakingTestPrompt(context.userId, data.testId, data.question, "ielts");
    await enforceLimit(context.userId, "ielts_evaluation");
    try {
      const audioBytes = data.audioBase64 ? Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0)) : null;
      const [{ value, inputTokens, outputTokens }, pronunciation] = await Promise.all([
        llmJson<IeltsEvaluation>(
          [
            {
              role: "system",
              content: `You are an experienced IELTS speaking examiner. Band scores use 0.5 steps between 4.0 and 9.0. ${langNote(data.lang)}
JSON only: {"fluency_coherence":0,"lexical_resource":0,"grammatical_range":0,"estimated_band":0,"feedback":"","corrected_answer":"","natural_answer":"","band6_version":"","band7_version":"","band8_version":""}
Keep answer versions in English. Do NOT score pronunciation — you only see a transcript. feedback: max 4 short sentences.`,
            },
            { role: "user", content: `Part ${data.part}\nQuestion: ${data.question}\nCandidate: ${data.transcript}` },
          ],
          1400,
        ),
        audioBytes
          ? analyseIeltsPronunciationAudio(audioBytes, data.mimeType || "audio/wav", langNote(data.lang)).catch(() => null)
          : Promise.resolve(null),
      ]);
      value.pronunciation = pronunciation?.band ?? null;
      await logUsage(context.userId, "ielts_evaluation", 1, inputTokens, outputTokens);
      return value;
    } catch (error) {
      toError(error);
    }
  });

/* ----------------------------- pronunciation ------------------------------- */

export type PronunciationResult = {
  /** false whenever no calibrated acoustic pronunciation-scoring API
   * (Azure Speech Pronunciation Assessment / SpeechAce / ELSA) is
   * connected — that's still true even when heardAudio is true below,
   * since a general-purpose model listening isn't the same as a certified
   * phonetic score. */
  acoustic: boolean;
  /** True when the feedback below comes from Gemini actually listening to
   * the recording, not just diffing the transcript against the target. */
  heardAudio: boolean;
  demo: boolean;
  wordAccuracy: number | null;
  readBack: string;
  matched: string[];
  missed: string[];
  feedback: string;
};

/**
 * Pronunciation analysis, scored by AI.
 * When the client sends its recording, Gemini (the audio provider) listens
 * to the actual audio and returns its own honest 0-100 pronunciation score
 * plus qualitative feedback (see analysePronunciationAudio) — a real AI
 * judgement, meaningfully better than guessing from a text diff alone.
 * wordAccuracy falls back to a deterministic word-match % (recognised words
 * vs. target, from the speech-to-text read-back) only when no audio was
 * sent, or Gemini's audio call fails / isn't configured. `acoustic` stays
 * `false` either way: no lab-calibrated phonetic engine (Azure/SpeechAce/
 * ELSA) is connected — see the Vấn đề 5 decision in ai-providers.server.ts.
 */
export const analysePronunciation = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        target: z.string().min(1).max(400),
        transcript: z.string().max(1000),
        lang: explanationLanguageSchema,
        /** Exactly one practice item, checked server-side (the target must be
         * one of that item's own practice lines):
         * - targetSound: one of the 44 sounds (IPA symbol, RP or American)
         * - lessonId: a pronunciation_lessons row (8 advanced skills)
         * - testId: a TOEFL/PTE read-back task in Speaking Tests
         * - sentenceId: a Shadowing sentence (the target is taken from it) */
        targetSound: z.string().max(20).optional(),
        lessonId: z.string().uuid().optional(),
        testId: z.string().uuid().optional(),
        sentenceId: z.string().uuid().optional(),
        /** The learner's own recording, so feedback can be grounded in what
         * was actually said rather than only the STT transcript. Optional —
         * every caller that has the recording handy should send it. */
        audioBase64: z.string().max(4_000_000).optional(),
        mimeType: z.string().max(60).optional(),
      })
      .refine((d) => [d.targetSound, d.lessonId, d.testId, d.sentenceId].filter(Boolean).length === 1, {
        message: "Choose one sound, lesson, test or sentence to practise.",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let target = data.target;
    if (data.targetSound) {
      const index = findSoundIndex(data.targetSound);
      if (index < 0) throw new Error("Unknown sound.");
      const freeSoundCount = (await getLimits("free"))["pronunciation_sounds_free_count"] ?? 3;
      await assertUnlockedOrPremium(
        context.userId,
        isSoundIndexFree(index, freeSoundCount),
        "pronunciation",
        `The first ${freeSoundCount} sounds are free. Upgrade to Premium to unlock all 44 sounds.`,
      );
      assertTextBelongs(target, soundPracticeTargets(index));
    } else if (data.lessonId) {
      const lessonRows = await withAdmin((db) =>
        db
          .select({ isFree: pronunciationLessons.isFree, items: pronunciationLessons.items })
          .from(pronunciationLessons)
          .where(and(eq(pronunciationLessons.id, data.lessonId!), eq(pronunciationLessons.status, "published")))
          .limit(1),
      );
      const lesson = lessonRows[0];
      if (!lesson) throw new Error("That example is no longer available.");
      await assertUnlockedOrPremium(
        context.userId,
        lesson.isFree,
        "pronunciation",
        "This example is part of Lingora English Premium. Upgrade to unlock the rest.",
      );
      const items = Array.isArray(lesson.items) ? (lesson.items as { text?: unknown }[]) : [];
      assertTextBelongs(
        target,
        items.map((item) => item.text).filter((text): text is string => typeof text === "string"),
      );
    } else if (data.testId) {
      await assertSpeakingTestPrompt(context.userId, data.testId, target, "ielts");
    } else {
      const sentenceRows = await withAdmin((db) =>
        db
          .select({ isFree: shadowingSentences.isFree, sentence: shadowingSentences.sentence })
          .from(shadowingSentences)
          .where(and(eq(shadowingSentences.id, data.sentenceId!), eq(shadowingSentences.status, "published")))
          .limit(1),
      );
      const sentence = sentenceRows[0];
      if (!sentence) throw new Error("That sentence is no longer available.");
      await assertUnlockedOrPremium(
        context.userId,
        sentence.isFree,
        "pronunciation",
        "This sentence is part of Lingora English Premium. Upgrade to unlock every Shadowing sentence.",
      );
      target = sentence.sentence;
    }
    await enforceLimit(context.userId, "pronunciation_feedback");
    try {
      const norm = (s: string) =>
        s
          .toLowerCase()
          .replace(/[^a-z\s']/g, " ")
          .split(/\s+/)
          .filter(Boolean);
      const targetWords = norm(target);
      const saidWords = norm(data.transcript);
      const said = new Set(saidWords);
      const matched = targetWords.filter((w) => said.has(w));
      const missed = targetWords.filter((w) => !said.has(w));
      const textMatchAccuracy = targetWords.length
        ? Math.round((matched.length / targetWords.length) * 100)
        : null;

      const audioFeedback = data.audioBase64
        ? await analysePronunciationAudio(
            Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0)),
            data.mimeType || "audio/wav",
            target,
            langNote(data.lang),
          ).catch(() => null)
        : null;

      let feedback: string;
      let inputTokens: number;
      let outputTokens: number;
      if (audioFeedback) {
        feedback = audioFeedback.feedback;
        inputTokens = audioFeedback.inputTokens;
        outputTokens = audioFeedback.outputTokens;
      } else {
        const { value, inputTokens: inTok, outputTokens: outTok } = await llmJson<{ feedback: string }>(
          [
            {
              role: "system",
              content: `You are Lingora English, a gentle pronunciation coach. ${langNote(data.lang)}
You only have the speech-to-text read-back, not acoustic data, so never state a precise accuracy percentage. Give one concrete mouth/tongue tip.
JSON only: {"feedback":"max 3 short sentences"}`,
            },
            {
              role: "user",
              content: `Target${data.targetSound ? ` (focus sound ${data.targetSound})` : ""}: ${target}\nRead back as: ${data.transcript || "(nothing recognised)"}\nWords not recognised: ${missed.join(", ") || "none"}`,
            },
          ],
          250,
        );
        feedback = value.feedback;
        inputTokens = inTok;
        outputTokens = outTok;
      }
      await logUsage(context.userId, "pronunciation_feedback", 1, inputTokens, outputTokens);

      // Prefer Gemini's own audio-grounded score — only fall back to the
      // text-match % when there's no recording, or the audio call failed.
      const wordAccuracy = audioFeedback?.score ?? textMatchAccuracy;

      const result: PronunciationResult = {
        acoustic: false,
        heardAudio: Boolean(audioFeedback),
        demo: true,
        wordAccuracy,
        readBack: data.transcript,
        matched,
        missed,
        feedback,
      };
      return result;
    } catch (error) {
      toError(error);
    }
  });

/* --------------------------------- speech --------------------------------- */

/**
 * Text-to-speech with a persistent cache: identical text + voice is never
 * generated twice, which is the single biggest AI cost saving on the platform.
 */
export const speak = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ text: z.string().min(1).max(1200), voice: z.string().max(24).default("shimmer") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const key = `${currentAudioProvider()}::${data.voice}::${data.text.trim().toLowerCase()}`;

    const cachedRows = await withAdmin((db) =>
      db
        .select({ id: ttsCache.id, audioBase64: ttsCache.audioBase64, mimeType: ttsCache.mimeType, hits: ttsCache.hits })
        .from(ttsCache)
        .where(eq(ttsCache.cacheKey, key))
        .limit(1),
    );
    const cached = cachedRows[0];

    if (cached) {
      await withAdmin((db) => db.update(ttsCache).set({ hits: cached.hits + 1 }).where(eq(ttsCache.id, cached.id)));
      return { audioBase64: cached.audioBase64, mime: cached.mimeType, cached: true };
    }

    const refund = await enforceLimit(context.userId, "tts");
    try {
      const { base64, mime } = await synthesise(data.text, data.voice);
      // Two requests for the same text can race here (e.g. auto-play plus a
      // manual replay click); whichever loses the insert still has valid
      // audio in hand, so just skip the write instead of throwing.
      await withAdmin((db) =>
        db
          .insert(ttsCache)
          .values({ cacheKey: key, textContent: data.text, voice: data.voice, audioBase64: base64, mimeType: mime })
          .onConflictDoNothing({ target: ttsCache.cacheKey }),
      );
      await logUsage(context.userId, "tts", 1, 0, 0, currentTtsModel());
      return { audioBase64: base64, mime, cached: false };
    } catch (error) {
      await refund();
      toError(error);
    }
  });

/* ------------------------------ learning plan ------------------------------ */

export type LearningPlan = { insights: string[]; tasks: { label: string; area: string }[] };

export const generateLearningPlan = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ lang: explanationLanguageSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const today = new Date().toISOString().slice(0, 10);

    const existingRows = await withUser(userId, (db) =>
      db
        .select({ tasks: dailyPlans.tasks, insights: dailyPlans.insights })
        .from(dailyPlans)
        .where(and(eq(dailyPlans.userId, userId), eq(dailyPlans.planDate, today)))
        .limit(1),
    );
    const existing = existingRows[0];
    if (existing) {
      return {
        insights: (existing.insights ?? []) as unknown as string[],
        tasks: (existing.tasks ?? []) as unknown as LearningPlan["tasks"],
      };
    }

    const [speaking, sounds, profileRows] = await withUser(userId, (db) =>
      Promise.all([
        db
          .select({ overall: speakingAttempts.overall })
          .from(speakingAttempts)
          .where(eq(speakingAttempts.userId, userId))
          .orderBy(desc(speakingAttempts.createdAt))
          .limit(8),
        db
          .select({ sound: pronunciationScores.sound, score: pronunciationScores.score })
          .from(pronunciationScores)
          .where(eq(pronunciationScores.userId, userId))
          .limit(20),
        db
          .select({ englishLevel: profiles.englishLevel, targetLevel: profiles.targetLevel, learningGoal: profiles.learningGoal })
          .from(profiles)
          .where(eq(profiles.id, userId))
          .limit(1),
      ]),
    );
    const profile = profileRows[0];

    const summary = [
      `Level ${profile?.englishLevel ?? "B1"} aiming for ${profile?.targetLevel ?? "C1"}.`,
      profile?.learningGoal ? `Goal: ${profile.learningGoal}.` : "",
      speaking.length
        ? `Recent speaking scores: ${speaking.map((s) => s.overall ?? "-").join(", ")}.`
        : "No speaking attempts yet.",
      sounds.length
        ? `Pronunciation: ${sounds.map((s) => `${s.sound} ${Math.round(Number(s.score))}%`).join(", ")}.`
        : "No pronunciation data yet.",
    ]
      .filter(Boolean)
      .join(" ");

    const refund = await enforceLimit(userId, "learning_plan");
    try {
      const { value, inputTokens, outputTokens } = await llmJson<LearningPlan>(
        [
          {
            role: "system",
            content: `You are Lingora English, an English learning coach. ${langNote(data.lang)}
JSON only: {"insights":["max 3 short observations"],"tasks":[{"label":"short task","area":"pronunciation|grammar|vocabulary|speaking|listening"}]}
Exactly 4 tasks, one each from pronunciation, grammar, vocabulary, speaking (or listening).`,
          },
          { role: "user", content: summary },
        ],
        500,
      );
      await logUsage(userId, "learning_plan", 1, inputTokens, outputTokens);
      await withUser(userId, (db) =>
        db
          .insert(dailyPlans)
          .values({ userId, planDate: today, tasks: value.tasks, insights: value.insights })
          .onConflictDoUpdate({
            target: [dailyPlans.userId, dailyPlans.planDate],
            set: { tasks: value.tasks, insights: value.insights },
          }),
      );
      return value;
    } catch (error) {
      await refund();
      toError(error);
    }
  });
