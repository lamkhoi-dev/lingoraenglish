import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { withAdmin, withUser } from "@/db";
import { pronunciationAttempts, pronunciationLessons, pronunciationScores } from "@/db/schema/schema";
import { getLimits, resolveTier, TIER_RANK, UpgradeRequiredError } from "@/lib/entitlements.server";
import type { Phoneme } from "@/lib/pronunciation-content";
import { findSoundIndex, isSoundIndexFree, PHONEMES, SOUND_COUNT } from "@/lib/pronunciation-sounds.server";
import { getOptionalUserId, requireAuth } from "@/lib/require-auth";

export type SoundCatalogueEntry = Phoneme & { unlocked: boolean };

/** Sounds list for the /pronunciation "Sounds" tab, gated server-side —
 * mirrors speaking_test_catalogue()'s approach (Yêu cầu 5: "Free user không
 * thể bypass Premium bằng frontend"). PHONEMES itself lives in a plain
 * module the client used to import directly, which shipped every sound's
 * full lesson content (words/sentences/how-to/mouth-position/mistakes) to
 * every visitor regardless of tier — this is the only path the route should
 * use now. Symbol/name/group/level/difficulty always show (so the picker
 * grid still displays all 44 and can filter/search), but everything a
 * learner would actually study is redacted to empty for locked sounds. */
export const getSoundsCatalogue = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await getOptionalUserId();
  const tier = userId ? await resolveTier(userId) : "free";
  const premium = TIER_RANK[tier] >= TIER_RANK.premium;
  const freeCount = (await getLimits("free"))["pronunciation_sounds_free_count"] ?? 3;
  return PHONEMES.map((p, index): SoundCatalogueEntry => {
    const unlocked = premium || isSoundIndexFree(index, freeCount);
    if (unlocked) return { ...p, unlocked };
    // exactOptionalPropertyTypes forbids accentNote: undefined — drop the key
    // entirely instead so a locked sound has no accent note rather than one
    // explicitly set to undefined.
    const { accentNote: _accentNote, ...rest } = p;
    return {
      ...rest,
      unlocked,
      how: "",
      lips: "",
      teeth: "",
      tongue: "",
      jaw: "",
      mistakes: [],
      words: [],
      sentences: [],
      pairs: [],
    };
  });
});

/** Yêu cầu 9: the "first N free" numbers shown in the UI (Sounds and the 8
 * advanced skills) come from the same billing_plans.limits every gate
 * reads, instead of a hard-coded display constant that could drift from
 * the real enforcement. */
export const getPronunciationFreeCounts = createServerFn({ method: "GET" }).handler(async () => {
  const limits = await getLimits("free");
  return {
    sounds: limits["pronunciation_sounds_free_count"] ?? 3,
    lessonsPerSkill: limits["pronunciation_lessons_free_per_skill"] ?? 5,
    totalSounds: SOUND_COUNT,
  };
});

export type SkillLessonItem = { text: string; pattern?: string; note?: string };

export type SkillLessonCatalogueEntry = {
  id: string;
  skill: string;
  title: string;
  level: string;
  difficulty: string;
  accent: string;
  explain: string;
  points: string[];
  items: SkillLessonItem[];
  caution: string;
  unlocked: boolean;
};

/** Lessons list for the /pronunciation 8 advanced-skill tabs (word stress,
 * sentence stress, intonation, connected speech, reductions, rhythm,
 * chunking, fluency) — same gating pattern as getSoundsCatalogue above, now
 * reading from the pronunciation_lessons table (admin-managed, see
 * pronunciation-admin.functions.ts) instead of the SKILL_LESSONS array that
 * used to ship every lesson's content to every visitor regardless of tier.
 * `isFree` is an explicit per-row column (set at load/seed time or toggled
 * by an admin), not a live position-based rank — evaluatePronunciation's
 * lessonId gate reads the same column directly, so the two never disagree. */
export const getSkillLessonsCatalogue = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await getOptionalUserId();
  const tier = userId ? await resolveTier(userId) : "free";
  const premium = TIER_RANK[tier] >= TIER_RANK.premium;
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
      })
      .from(pronunciationLessons)
      .where(eq(pronunciationLessons.status, "published"))
      .orderBy(asc(pronunciationLessons.skill), asc(pronunciationLessons.sortOrder)),
  );
  return rows.map((l): SkillLessonCatalogueEntry => {
    const unlocked = premium || l.isFree;
    const base = {
      id: l.id,
      skill: l.skill,
      title: l.title,
      level: l.level,
      difficulty: l.difficulty,
      accent: l.accent,
      unlocked,
    };
    if (unlocked) {
      return { ...base, explain: l.explain, points: l.points, items: l.items as SkillLessonItem[], caution: l.caution };
    }
    return { ...base, explain: "", points: [], items: [], caution: "" };
  });
});

/** /pronunciation page's own-progress panel: recent scored attempts (for the
 * per-skill averages) plus every per-sound score (for "weak sounds"). */
export const getMyPronunciationProgress = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const [attempts, scores] = await withUser(userId, (db) =>
      Promise.all([
        db
          .select({ mode: pronunciationAttempts.mode, accuracy: pronunciationAttempts.accuracy })
          .from(pronunciationAttempts)
          .where(and(eq(pronunciationAttempts.userId, userId), isNotNull(pronunciationAttempts.accuracy)))
          .orderBy(desc(pronunciationAttempts.createdAt))
          .limit(400),
        db
          .select({
            sound: pronunciationScores.sound,
            score: pronunciationScores.score,
            attempts: pronunciationScores.attempts,
            mastered: pronunciationScores.mastered,
          })
          .from(pronunciationScores)
          .where(eq(pronunciationScores.userId, userId)),
      ]),
    );

    return {
      attempts: attempts.map((a) => ({ mode: a.mode, accuracy: a.accuracy === null ? null : Number(a.accuracy) })),
      scores: scores.map((s) => ({ sound: s.sound, score: Number(s.score), attempts: s.attempts, mastered: s.mastered })),
    };
  });

const updateSoundScoreSchema = z.object({ sound: z.string().max(20), accuracy: z.number() });

export type SoundScoreUpdate = { score: number; attempts: number; clearRuns: number; mastered: boolean };

/** Running average per sound (score = (oldScore * oldAttempts + newAccuracy)
 * / (oldAttempts + 1)), plus practice step 8 "Mastered": clearRuns counts
 * consecutive attempts scoring >=90 and resets to 0 otherwise, mastered once
 * clearRuns reaches 2 — exactly mirrors shadowing_progress's clear_attempts/
 * status (same non-sticky semantics: a later poor attempt can un-mark
 * mastered again, it isn't a one-way flag). Previously this whole "mastered"
 * concept only lived in a client-side useState that reset on every remount
 * (switching sounds, or a page reload) — now persisted like every sibling
 * practice feature (Shadowing, Vocabulary) already does. */
export const updatePronunciationSoundScore = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => updateSoundScoreSchema.parse(d))
  .handler(async ({ data, context }): Promise<SoundScoreUpdate> => {
    const userId = context.userId;
    const index = findSoundIndex(data.sound);
    if (index < 0) throw new Error("Unknown sound.");
    const freeCount = (await getLimits("free"))["pronunciation_sounds_free_count"] ?? 3;
    if (!isSoundIndexFree(index, freeCount)) {
      const tier = await resolveTier(userId);
      if (TIER_RANK[tier] < TIER_RANK.premium) {
        throw new UpgradeRequiredError(
          "pronunciation",
          tier,
          `The first ${freeCount} sounds are free. Upgrade to Premium to unlock all ${SOUND_COUNT} sounds.`,
        );
      }
    }
    return withUser(userId, async (db) => {
      const existingRows = await db
        .select({
          id: pronunciationScores.id,
          score: pronunciationScores.score,
          attempts: pronunciationScores.attempts,
          clearRuns: pronunciationScores.clearRuns,
        })
        .from(pronunciationScores)
        .where(and(eq(pronunciationScores.userId, userId), eq(pronunciationScores.sound, data.sound)))
        .limit(1);
      const existing = existingRows[0];
      const nextClearRuns = data.accuracy >= 90 ? (existing?.clearRuns ?? 0) + 1 : 0;
      const nextMastered = nextClearRuns >= 2;
      if (existing) {
        const nextAttempts = existing.attempts + 1;
        const nextScore = Math.round((Number(existing.score) * existing.attempts + data.accuracy) / nextAttempts);
        await db
          .update(pronunciationScores)
          .set({ score: String(nextScore), attempts: nextAttempts, clearRuns: nextClearRuns, mastered: nextMastered })
          .where(eq(pronunciationScores.id, existing.id));
        return { score: nextScore, attempts: nextAttempts, clearRuns: nextClearRuns, mastered: nextMastered };
      }
      await db.insert(pronunciationScores).values({
        userId,
        sound: data.sound,
        score: String(data.accuracy),
        attempts: 1,
        clearRuns: nextClearRuns,
        mastered: nextMastered,
      });
      return { score: data.accuracy, attempts: 1, clearRuns: nextClearRuns, mastered: nextMastered };
    });
  });
