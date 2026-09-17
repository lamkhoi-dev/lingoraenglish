import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { withUser } from "@/db";
import {
  coachTurns,
  conversationMessages,
  conversationSessions,
  dailyPlans,
  ieltsAttempts,
  listeningAttempts,
  listeningProgress,
  profiles,
  pronunciationAttempts,
  pronunciationScores,
  shadowingProgress,
  speakingAttempts,
  speakingTestProgress,
  vocabularyProgress,
} from "@/db/schema/schema";
import { requireAuth } from "@/lib/require-auth";

export const getMyAccountProfile = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const rows = await withUser(context.userId, (db) =>
      db
        .select({
          fullName: profiles.fullName,
          nativeLanguage: profiles.nativeLanguage,
          englishLevel: profiles.englishLevel,
          targetLevel: profiles.targetLevel,
          learningGoal: profiles.learningGoal,
          dailyGoalMinutes: profiles.dailyGoalMinutes,
          voicePreference: profiles.voicePreference,
        })
        .from(profiles)
        .where(eq(profiles.id, context.userId))
        .limit(1),
    );
    return rows[0] ?? null;
  });

const cefrLevelSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);

const updateProfileSchema = z.object({
  fullName: z.string().max(200),
  nativeLanguage: z.string().max(8),
  englishLevel: cefrLevelSchema,
  targetLevel: cefrLevelSchema,
  learningGoal: z.string().max(50),
  dailyGoalMinutes: z.number().int().min(1).max(240),
  englishOnlyMode: z.boolean(),
  voicePreference: z.string().max(20),
  interfaceLanguage: z.string().max(8),
});

export const updateMyAccountProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => updateProfileSchema.parse(d))
  .handler(async ({ data, context }) => {
    await withUser(context.userId, (db) =>
      db
        .update(profiles)
        .set({
          fullName: data.fullName,
          nativeLanguage: data.nativeLanguage,
          englishLevel: data.englishLevel,
          targetLevel: data.targetLevel,
          learningGoal: data.learningGoal,
          dailyGoalMinutes: data.dailyGoalMinutes,
          englishOnlyMode: data.englishOnlyMode,
          voicePreference: data.voicePreference,
          interfaceLanguage: data.interfaceLanguage,
          uiLanguage: data.interfaceLanguage,
        })
        .where(eq(profiles.id, context.userId)),
    );
    return { ok: true };
  });

const updateInterfaceLanguageSchema = z.object({ interfaceLanguage: z.string().max(8) });

/** Only touches interface_language, matching the original exactly — a
 * separate, narrower write path from updateMyAccountProfile/
 * completeOnboarding, which also set ui_language alongside it. Those two
 * columns can drift because of this (a pre-existing quirk, not introduced
 * here — not this migration's job to fix). */
export const updateInterfaceLanguage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => updateInterfaceLanguageSchema.parse(d))
  .handler(async ({ data, context }) => {
    await withUser(context.userId, (db) =>
      db.update(profiles).set({ interfaceLanguage: data.interfaceLanguage }).where(eq(profiles.id, context.userId)),
    );
    return { ok: true };
  });

const updateEnglishOnlyModeSchema = z.object({ englishOnlyMode: z.boolean() });

export const updateEnglishOnlyMode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => updateEnglishOnlyModeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await withUser(context.userId, (db) =>
      db.update(profiles).set({ englishOnlyMode: data.englishOnlyMode }).where(eq(profiles.id, context.userId)),
    );
    return { ok: true };
  });

const completeOnboardingSchema = z.object({
  interfaceLanguage: z.string().max(8),
  nativeLanguage: z.string().max(100),
  englishLevel: cefrLevelSchema,
  targetLevel: cefrLevelSchema,
  learningGoal: z.string().max(50),
  dailyGoalMinutes: z.number().int().min(1).max(240),
});

/** Partial update, unlike updateMyAccountProfile — onboarding only ever
 * touches these 6 fields plus onboardedAt, leaving fullName/voicePreference/
 * englishOnlyMode etc. untouched (matches the original Supabase .update()
 * call exactly, which only listed these columns). */
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => completeOnboardingSchema.parse(d))
  .handler(async ({ data, context }) => {
    await withUser(context.userId, (db) =>
      db
        .update(profiles)
        .set({
          interfaceLanguage: data.interfaceLanguage,
          uiLanguage: data.interfaceLanguage,
          nativeLanguage: data.nativeLanguage,
          englishLevel: data.englishLevel,
          targetLevel: data.targetLevel,
          learningGoal: data.learningGoal,
          dailyGoalMinutes: data.dailyGoalMinutes,
          onboardedAt: new Date().toISOString(),
        })
        .where(eq(profiles.id, context.userId)),
    );
    return { ok: true };
  });

/** Wipes practice history/recordings, not the account itself — matches the
 * original "Delete my recordings & data" button, which never deleted
 * auth.users. */
export const deleteMyAccountData = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    await withUser(userId, async (db) => {
      await db.delete(speakingAttempts).where(eq(speakingAttempts.userId, userId));
      await db.delete(pronunciationAttempts).where(eq(pronunciationAttempts.userId, userId));
      await db.delete(pronunciationScores).where(eq(pronunciationScores.userId, userId));
      await db.delete(ieltsAttempts).where(eq(ieltsAttempts.userId, userId));
      await db.delete(dailyPlans).where(eq(dailyPlans.userId, userId));
      // Current tables. The three below them are the Supabase-era ones this
      // function was written against and which nothing writes to any more —
      // kept so older accounts are cleared too.
      await db.delete(listeningProgress).where(eq(listeningProgress.userId, userId));
      await db.delete(shadowingProgress).where(eq(shadowingProgress.userId, userId));
      await db.delete(vocabularyProgress).where(eq(vocabularyProgress.userId, userId));
      await db.delete(speakingTestProgress).where(eq(speakingTestProgress.userId, userId));
      await db.delete(listeningAttempts).where(eq(listeningAttempts.userId, userId));
      await db.delete(conversationMessages).where(eq(conversationMessages.userId, userId));
      await db.delete(conversationSessions).where(eq(conversationSessions.userId, userId));

      // Coach history is redacted rather than deleted, and the rows stay.
      // coach_turns is both the learner's transcript *and* the ledger the free
      // allowance is counted from (coach_reserve_turn, migration 0005), and
      // coach_sessions cascades into it — so deleting would hand every free
      // account unlimited turns by pressing this button. Clearing the text
      // removes what is actually private; coach_text keeps a non-empty
      // tombstone because the count only includes turns whose reply landed.
      await db
        .update(coachTurns)
        .set({ userText: "", coachText: "[deleted]", analysis: null })
        .where(eq(coachTurns.userId, userId));
      // coach_sessions is deliberately left alone: coach_turns.session_id
      // cascades from it, so deleting a session would take the redacted ledger
      // rows with it and reset the allowance after all. Its columns are a
      // catalogue topic, level and status — nothing the learner wrote.
    });
    return { ok: true };
  });
