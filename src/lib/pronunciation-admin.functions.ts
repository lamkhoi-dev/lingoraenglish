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
import { pronunciationLessons, ttsCache } from "@/db/schema/schema";
import { concatWavClips, synthesise, ttsCacheKey } from "@/lib/ai-providers.server";
import { buildIsolatedSoundPrompt, buildSoundScript } from "@/lib/ipa-tts-map";
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

/* ------------------------------ sound audio ------------------------------ */

// Must match the voice pron-practice.tsx hardcodes for every Sounds-drill
// Listen call, or a save here would land under a key students never look up.
const SOUND_VOICE = "shimmer";

const soundTargetInput = z.object({
  /** e.g. "/ʃ/" — passed straight through to buildSoundScript, same as the
   * student-facing targetSound prop in pron-practice.tsx. */
  ipaSymbol: z.string().min(1).max(24),
  exampleWord: z.string().min(1).max(120),
  exampleSentence: z.string().max(300).optional(),
});

/** Bare symbols where sending "word ... sentence" as one call made Gemini
 * skip the lone word on every retry (reported 2026-09-26). Scoped to just
 * these three on purpose — every other symbol's word+sentence call already
 * works, and splitting it too would be an unreviewed, un-asked-for change
 * to a recipe that isn't broken. */
const NEEDS_SEPARATE_WORD_CALL = new Set(["tʃ", "f", "l"]);

/**
 * Admin-only: generate ONE fresh candidate take for a Sounds-drill clip
 * WITHOUT touching ttsCache. TTS generation isn't fully deterministic (the
 * same text can come out differently take to take), so this exists purely
 * for the admin to preview a candidate — and compare it against whatever is
 * already cached, via the ordinary Listen button, which is untouched by
 * this call — before deciding whether it's worth keeping. Nothing is
 * persisted until adminSaveSoundAudio is called with this exact take.
 *
 * The isolated "âm" (sound) is always its own call, using the special
 * instruction+delimiter prompt from buildIsolatedSoundPrompt (plain text/
 * real-word substitutes were the actual bug being fixed 2026-09-26 — this
 * gets Gemini to say the real IPA symbol instead), then spliced with
 * itself so it's said twice — done in code, not asked of the model, because
 * asking Gemini for "the symbol, twice in a row" in one generation came
 * back as one repetition.
 *
 * The word+sentence half stays ONE call ("word ... sentence"), same as it
 * always has — except for NEEDS_SEPARATE_WORD_CALL's three symbols, which
 * need the word split out into its own call too.
 */
export const adminGenerateSoundTake = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => soundTargetInput.parse(d))
  .handler(async ({ data }) => {
    const bareSymbol = data.ipaSymbol.replaceAll("/", "").trim();
    const soundPromise = synthesise(buildIsolatedSoundPrompt(data.ipaSymbol), SOUND_VOICE);

    let combined: string;
    if (NEEDS_SEPARATE_WORD_CALL.has(bareSymbol)) {
      const [soundClip, wordClip, sentenceClip] = await Promise.all([
        soundPromise,
        synthesise(data.exampleWord, SOUND_VOICE),
        data.exampleSentence ? synthesise(data.exampleSentence, SOUND_VOICE) : Promise.resolve(null),
      ]);
      combined = concatWavClips(soundClip.base64, soundClip.base64, 250);
      combined = concatWavClips(combined, wordClip.base64, 400);
      if (sentenceClip) combined = concatWavClips(combined, sentenceClip.base64, 400);
    } else {
      const wordSentenceText = data.exampleSentence
        ? `${data.exampleWord} ... ${data.exampleSentence}`
        : data.exampleWord;
      const [soundClip, wordClip] = await Promise.all([soundPromise, synthesise(wordSentenceText, SOUND_VOICE)]);
      combined = concatWavClips(soundClip.base64, soundClip.base64, 250);
      combined = concatWavClips(combined, wordClip.base64, 400);
    }
    return { audioBase64: combined, mime: "audio/wav" };
  });

const saveSoundAudioInput = soundTargetInput.extend({
  // The exact bytes the admin just previewed via adminGenerateSoundTake —
  // saved as-is, never regenerated here. Regenerating on save would risk
  // committing a different (unheard, possibly worse) take than the one the
  // admin actually approved by ear, given generation isn't deterministic.
  audioBase64: z.string().min(1).max(3_000_000),
  mimeType: z.string().min(1).max(60),
});

/**
 * Admin-only "save this take" for one Sounds-drill audio clip.
 *
 * The 44-sound Listen button plays `buildSoundScript(symbol, word, sentence)`
 * through the platform's normal cached-TTS path (speak(), in lily.functions
 * .ts) — completely unchanged by this function. A cache miss there generates
 * once and caches whatever Gemini happens to say, forever (onConflictDoNothing
 * — a bad first take could never self-heal). This function lets an admin
 * force a specific, already-auditioned take into ttsCache under the exact
 * same key (onConflictDoUpdate, so a bad existing entry can be overwritten).
 * Regular students never call this; their next Listen for that sound/word/
 * sentence combo is then simply a cache hit on the admin-approved clip.
 */
export const adminSaveSoundAudio = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => saveSoundAudioInput.parse(d))
  .handler(async ({ data }) => {
    const text = buildSoundScript(data.ipaSymbol, data.exampleWord, data.exampleSentence);
    const key = ttsCacheKey(SOUND_VOICE, text);

    await withAdmin((db) =>
      db
        .insert(ttsCache)
        .values({
          cacheKey: key,
          textContent: text,
          voice: SOUND_VOICE,
          audioBase64: data.audioBase64,
          mimeType: data.mimeType,
        })
        .onConflictDoUpdate({
          target: ttsCache.cacheKey,
          set: { textContent: text, audioBase64: data.audioBase64, mimeType: data.mimeType, hits: 0 },
        }),
    );

    return { ok: true };
  });
