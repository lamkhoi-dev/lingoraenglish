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
  speakingAttempts,
  speakingTests,
  ttsCache,
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
  type ChatMessage,
} from "./ai-providers.server";
import { recordUsage, requireCapacity, resolveTier, TIER_RANK, UpgradeRequiredError, type Capability } from "./entitlements.server";
import { findSoundIndex, FREE_SOUND_COUNT, isSoundIndexFree } from "./pronunciation-content";

/**
 * Free/premium here is decided purely by the item's own position (sound
 * index, lesson rank within its skill, or the speaking_tests.is_free flag)
 * — never by the generic monthly capability quota in entitlements.server.ts.
 * Throws UpgradeRequiredError when the caller's tier isn't Premium/IELTS Pro
 * and the item is past the free allowance.
 */
async function assertUnlockedOrPremium(userId: string, unlocked: boolean, capability: Capability, message: string) {
  if (unlocked) return;
  const tier = await resolveTier(userId);
  if (TIER_RANK[tier] < TIER_RANK["premium"]) {
    throw new UpgradeRequiredError(capability, tier, message);
  }
}

/* ----------------------------- cost control ----------------------------- */

const DAILY_AI_LIMIT = 300;

/** Which plan allowance each AI capability draws from. Deliberately does NOT
 * include speaking_analysis/ielts_evaluation/pronunciation_feedback — those
 * are gated by each item's own free/premium status instead (see
 * assertUnlockedOrPremium below), which is the single source of truth for
 * AI Coach turns, Speaking Tests and Pronunciation. Keeping them mapped to a
 * separate monthly quota here would just reintroduce the two gates
 * disagreeing with each other. enforceLimit() below still runs its flat
 * daily abuse cap and cost log for every capability regardless. */
const CAPABILITY_MAP: Record<string, Capability> = {
  stt: "stt",
  tts: "tts",
  learning_plan: "plan",
};

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
    }),
  );

  const mapped = CAPABILITY_MAP[capability];
  if (mapped) await recordUsage(userId, mapped, units);
}

async function enforceLimit(userId: string, capability: string) {
  const mapped = CAPABILITY_MAP[capability];
  // Plan entitlement first: paid capabilities are gated server-side only.
  if (mapped) await requireCapacity(userId, mapped);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await withAdmin((db) =>
    db.select({ id: aiUsageLog.id }).from(aiUsageLog).where(and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, since))).limit(DAILY_AI_LIMIT),
  );
  if (rows.length >= DAILY_AI_LIMIT) {
    throw new Error("You have reached today's practice limit. Come back tomorrow — Lingora English will be here!");
  }
}

function toError(error: unknown): never {
  if (error instanceof AiNotConnectedError) {
    throw new Error(`API not connected — ${error.capability.toUpperCase()} requires ${error.requires}.`);
  }
  throw error;
}

/** Interface languages Lingora English can explain in. English is the fallback. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  vi: "Vietnamese",
  es: "Spanish",
  pt: "Brazilian Portuguese",
  fr: "French",
  de: "German",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  "zh-CN": "Simplified Chinese",
  "zh-TW": "Traditional Chinese",
  hi: "Hindi",
  id: "Indonesian",
  tr: "Turkish",
  ru: "Russian",
  ar: "Modern Standard Arabic",
};

export const explanationLanguageSchema = z
  .string()
  .max(8)
  .default("en")
  .transform((code) => (LANGUAGE_NAMES[code] ? code : "en"));

const langNote = (lang: string) => {
  const name = LANGUAGE_NAMES[lang] ?? "English";
  return name === "English"
    ? "Write everything in clear, simple English."
    : `Write every explanation and feedback field in ${name}, but keep English example sentences, corrections, rewrites and vocabulary in English.`;
};


/* ----------------------------- provider status ----------------------------- */

export const getAiStatus = createServerFn({ method: "GET" }).handler(async () => providerStatuses());

/* ------------------------------- transcription ------------------------------ */

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ audioBase64: z.string().min(64), mimeType: z.string().default("audio/wav") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await enforceLimit(context.userId, "stt");
    try {
      const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
      const text = await transcribe(bytes, data.mimeType);
      await logUsage(context.userId, "stt", 1, 0, 0, currentSttModel());
      return { transcript: text };
    } catch (error) {
      toError(error);
    }
  });

/* ----------------------------- speaking analysis ---------------------------- */

const speakingSchema = z.object({
  question: z.string().min(1).max(500),
  transcript: z.string().min(1).max(4000),
  lang: explanationLanguageSchema,
  level: z.string().default("B1"),
  /** Set only by the TOEFL/PTE non-read-back tasks in Speaking Tests — AI
   * Coach turn grading and Vocabulary's "use it in speaking" leave this
   * unset, since they're already gated elsewhere (coach_turns, and
   * vocabulary_words' own RLS respectively). */
  testId: z.string().uuid().optional(),
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
    if (data.testId) {
      const testRows = await withAdmin((db) =>
        db.select({ isFree: speakingTests.isFree }).from(speakingTests).where(eq(speakingTests.id, data.testId!)).limit(1),
      );
      const test = testRows[0];
      if (!test) throw new Error("That test is no longer available.");
      await assertUnlockedOrPremium(
        context.userId,
        test.isFree,
        "speaking",
        "This test is part of Lingora English Premium. Upgrade to unlock all Speaking Tests.",
      );
    }
    await enforceLimit(context.userId, "speaking_analysis");
    try {
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: `You are Lingora English, a warm, patient, encouraging female English teacher. Score honestly but kindly. ${langNote(data.lang)}
Return JSON only:
{"fluency":0-10,"grammar":0-10,"vocabulary":0-10,"overall":0-10,"mistakes":[{"wrong":"","why":""}],"corrections":[{"from":"","to":""}],"better_vocabulary":[{"instead_of":"","use":""}],"natural_answer":"","feedback":""}
Max 4 items per array. feedback: max 3 short sentences. Do NOT score pronunciation — you only see a transcript.`,
        },
        {
          role: "user",
          content: `Level: ${data.level}\nQuestion: ${data.question}\nStudent (speech-to-text): ${data.transcript}`,
        },
      ];
      const { value, inputTokens, outputTokens } = await llmJson<SpeakingAnalysis>(messages, 900);
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
    const testRows = await withAdmin((db) =>
      db.select({ isFree: speakingTests.isFree }).from(speakingTests).where(eq(speakingTests.id, data.testId)).limit(1),
    );
    const test = testRows[0];
    if (!test) throw new Error("That test is no longer available.");
    await assertUnlockedOrPremium(
      context.userId,
      test.isFree,
      "ielts",
      "This test is part of Lingora English Premium. Upgrade to unlock all Speaking Tests.",
    );
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
        /** IPA symbol when the drill focuses on one of the 44 sounds — also
         * re-checked below against the free-sound allowance regardless of
         * what the client thinks is unlocked. */
        targetSound: z.string().max(20).optional(),
        transcript: z.string().max(1000),
        lang: explanationLanguageSchema,
        /** Set by Pronunciation Coach's 8 advanced-skill lessons — a
         * pronunciation_lessons row id. */
        lessonId: z.string().uuid().optional(),
        /** Set by the TOEFL/PTE read-back tasks in Speaking Tests. */
        testId: z.string().uuid().optional(),
        /** The learner's own recording, so feedback can be grounded in what
         * was actually said rather than only the STT transcript. Optional —
         * every caller that has the recording handy should send it. */
        audioBase64: z.string().max(4_000_000).optional(),
        mimeType: z.string().max(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.targetSound) {
      const index = findSoundIndex(data.targetSound);
      await assertUnlockedOrPremium(
        context.userId,
        isSoundIndexFree(index),
        "pronunciation",
        `The first ${FREE_SOUND_COUNT} sounds are free. Upgrade to Premium to unlock all 44 sounds.`,
      );
    }
    if (data.lessonId) {
      const lessonRows = await withAdmin((db) =>
        db.select({ isFree: pronunciationLessons.isFree }).from(pronunciationLessons).where(eq(pronunciationLessons.id, data.lessonId!)).limit(1),
      );
      const lesson = lessonRows[0];
      if (!lesson) throw new Error("That example is no longer available.");
      await assertUnlockedOrPremium(
        context.userId,
        lesson.isFree,
        "pronunciation",
        "This example is part of Lingora English Premium. Upgrade to unlock the rest.",
      );
    }
    if (data.testId) {
      const rows = await withAdmin((db) =>
        db.select({ isFree: speakingTests.isFree }).from(speakingTests).where(eq(speakingTests.id, data.testId!)).limit(1),
      );
      const test = rows[0];
      if (!test) throw new Error("That test is no longer available.");
      await assertUnlockedOrPremium(
        context.userId,
        test.isFree,
        "ielts",
        "This test is part of Lingora English Premium. Upgrade to unlock all Speaking Tests.",
      );
    }
    await enforceLimit(context.userId, "pronunciation_feedback");
    try {
      const norm = (s: string) =>
        s
          .toLowerCase()
          .replace(/[^a-z\s']/g, " ")
          .split(/\s+/)
          .filter(Boolean);
      const targetWords = norm(data.target);
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
            data.target,
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
              content: `Target${data.targetSound ? ` (focus sound ${data.targetSound})` : ""}: ${data.target}\nRead back as: ${data.transcript || "(nothing recognised)"}\nWords not recognised: ${missed.join(", ") || "none"}`,
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

    await enforceLimit(context.userId, "tts");
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

    await enforceLimit(userId, "learning_plan");

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
      toError(error);
    }
  });
