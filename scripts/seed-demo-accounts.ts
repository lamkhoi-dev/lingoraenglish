/**
 * Creates 4 demo accounts (admin / free / premium / ielts_pro) with realistic
 * progress data, for browsing the dev app without needing real migrated
 * user data from Supabase. Safe to re-run: each account is deleted (cascade)
 * and recreated fresh every run. NOT part of the app — a one-off dev tool,
 * same spirit as scripts/load-*.py.
 *
 * Usage: bun run scripts/seed-demo-accounts.ts
 */
import { eq } from "drizzle-orm";

import { rawSql, withAdmin } from "../src/db";
import {
  ieltsAttempts,
  listeningLessons,
  listeningProgress,
  profiles,
  pronunciationScores,
  shadowingSentences,
  shadowingProgress,
  speakingAttempts,
  speakingTestProgress,
  speakingTests,
  subscriptions,
  userRoles,
  usersInAuth,
  vocabularyProgress,
  vocabularyWords,
} from "../src/db/schema/schema";
import { hashPassword } from "../src/lib/session.server";

const PASSWORD = "Demo@1234";

type Tier = "free" | "premium" | "ielts_pro";

type DemoAccountSpec = {
  email: string;
  firstName: string;
  lastName: string;
  tier: Tier;
  isAdmin?: boolean;
};

const ACCOUNTS: DemoAccountSpec[] = [
  { email: "demo-admin@lingoraenglish.local", firstName: "Admin", lastName: "Demo", tier: "free", isAdmin: true },
  { email: "demo-free@lingoraenglish.local", firstName: "Free", lastName: "Learner", tier: "free" },
  { email: "demo-premium@lingoraenglish.local", firstName: "Premium", lastName: "Learner", tier: "premium" },
  { email: "demo-ielts@lingoraenglish.local", firstName: "Ielts", lastName: "Learner", tier: "ielts_pro" },
];

const TODAY = new Date().toISOString().slice(0, 10);

async function main() {
  const passwordHash = await hashPassword(PASSWORD);

  const [words, sentences, lessons, ieltsTests] = await withAdmin((db) =>
    Promise.all([
      db.select({ id: vocabularyWords.id }).from(vocabularyWords).limit(8),
      db.select({ id: shadowingSentences.id }).from(shadowingSentences).limit(8),
      db.select({ id: listeningLessons.id }).from(listeningLessons).limit(5),
      db
        .select({ id: speakingTests.id })
        .from(speakingTests)
        .where(eq(speakingTests.exam, "ielts"))
        .limit(6),
    ]),
  );
  if (words.length === 0 || sentences.length === 0 || lessons.length === 0) {
    throw new Error(
      "Content tables are empty — run the scripts/load-*.py seed loaders first (vocabulary/shadowing/listening).",
    );
  }

  for (const spec of ACCOUNTS) {
    // Idempotent: wipe any previous run's account first (cascade deletes everything under it).
    await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.email, spec.email)));

    const userId = await withAdmin(async (db) => {
      const inserted = await db
        .insert(usersInAuth)
        .values({
          email: spec.email,
          encryptedPassword: passwordHash,
          emailConfirmedAt: new Date().toISOString(),
        })
        .returning({ id: usersInAuth.id });
      const id = inserted[0]!.id;

      // handle_new_user() trigger already created a blank profiles row — fill it in.
      await db
        .update(profiles)
        .set({
          firstName: spec.firstName,
          lastName: spec.lastName,
          fullName: `${spec.firstName} ${spec.lastName}`,
          country: "Vietnam",
          ageRange: "25_34",
          englishLevel: "B1",
          targetLevel: "C1",
          interfaceLanguage: "vi",
          streakDays: 5,
          practiceMinutes: 120,
          lastPracticeOn: TODAY,
          onboardedAt: new Date().toISOString(),
          termsAcceptedAt: new Date().toISOString(),
          privacyAcceptedAt: new Date().toISOString(),
        })
        .where(eq(profiles.id, id));

      if (spec.isAdmin) {
        await db.insert(userRoles).values({ userId: id, role: "admin" });
      }

      if (spec.tier !== "free") {
        const priceId = spec.tier === "premium" ? "lily_premium_monthly" : "lily_ielts_monthly";
        const amount = spec.tier === "premium" ? 999 : 1999;
        await db.insert(subscriptions).values({
          userId: id,
          paddleSubscriptionId: `demo_sub_${spec.tier}_${id.slice(0, 8)}`,
          paddleCustomerId: `demo_cust_${spec.tier}_${id.slice(0, 8)}`,
          productId: `demo_product_${spec.tier}`,
          priceId,
          status: "active",
          billingInterval: "month",
          currency: "USD",
          amount,
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
          // The REAL app resolves tier via resolveTier()/getEntitlement() in entitlements.server.ts,
          // which defaults `env` to getPaddleEnvironment() (src/lib/payments-env.ts) — that reads
          // VITE_PAYMENTS_CLIENT_TOKEN's prefix, not a hardcoded "live". In dev (.env.development has
          // a "test_..." token) that resolves to "sandbox", so a subscription row stamped "live" here
          // is invisible to the actual app even though effective_tier(id) in a raw SQL query (which
          // defaults its own check_env param to 'live') would still show it as active — a false
          // positive if you only check with raw SQL instead of the app's real code path. Match
          // whichever environment this deployment's build actually resolves to.
          environment: "sandbox",
        });
      }

      // Vocabulary progress — mark a few real words as known/practicing.
      for (const [i, w] of words.entries()) {
        await db
          .insert(vocabularyProgress)
          .values({ userId: id, wordId: w.id, timesPracticed: 3 + i, mastered: i % 2 === 0 })
          .onConflictDoNothing();
      }

      // Pronunciation sound scores.
      const sounds = ["/θ/", "/ð/", "/r/", "/l/", "/v/"];
      for (const [i, sound] of sounds.entries()) {
        await db
          .insert(pronunciationScores)
          .values({ userId: id, sound, score: String(60 + i * 8), attempts: 4 + i })
          .onConflictDoNothing();
      }

      // Speaking practice attempts (flagged isDemo, matches the column's intent).
      for (let i = 0; i < 3; i++) {
        await db.insert(speakingAttempts).values({
          userId: id,
          questionText: "Describe a memorable trip you took recently.",
          transcript: "Last year I travelled to Da Nang with my family and it was a great experience...",
          fluency: String(6 + i * 0.5),
          grammar: String(6.5 + i * 0.3),
          vocabulary: String(7 + i * 0.2),
          pronunciation: String(6.5 + i * 0.4),
          overall: String(6.5 + i * 0.3),
          feedback: "Good use of past tense and linking words; work on reducing filler words.",
          isDemo: true,
        });
      }

      // Shadowing progress against real sentences.
      for (const [i, s] of sentences.entries()) {
        await db
          .insert(shadowingProgress)
          .values({
            userId: id,
            sentenceId: s.id,
            attempts: 2 + i,
            clearAttempts: 1 + i,
            bestAccuracy: String(70 + i * 3),
            lastAccuracy: String(68 + i * 3),
            status: i % 2 === 0 ? "strong" : "in_progress",
          })
          .onConflictDoNothing();
      }

      // Listening progress against real lessons.
      for (const [i, l] of lessons.entries()) {
        await db
          .insert(listeningProgress)
          .values({
            userId: id,
            lessonId: l.id,
            comprehensionScore: 70 + i * 5,
            dictationScore: 65 + i * 5,
            overallScore: 68 + i * 5,
            attempts: 1 + i,
            secondsListened: 120 + i * 30,
            completedAt: new Date().toISOString(),
          })
          .onConflictDoNothing();
      }

      // IELTS-specific content — only for the ielts_pro demo account.
      if (spec.tier === "ielts_pro") {
        for (const [i, t] of ieltsTests.entries()) {
          await db
            .insert(speakingTestProgress)
            .values({
              userId: id,
              testId: t.id,
              attempts: 1 + i,
              lastBand: String(6.5 + i * 0.5),
              bestBand: String(6.5 + i * 0.5),
              completedAt: new Date().toISOString(),
            })
            .onConflictDoNothing();
        }
        for (let i = 0; i < 2; i++) {
          await db.insert(ieltsAttempts).values({
            userId: id,
            part: 2,
            questionText: "Describe a skill you would like to learn.",
            transcript: "I would like to learn how to cook Vietnamese food because...",
            fluencyCoherence: "6.5",
            lexicalResource: "7.0",
            grammaticalRange: "6.5",
            pronunciation: "6.5",
            estimatedBand: "6.5",
            feedback: "Clear structure; expand on reasons with more detail.",
            isDemo: true,
          });
        }
      }

      return id;
    });

    const tag = spec.isAdmin ? `${spec.tier} + admin` : spec.tier;
    console.log(`${spec.email.padEnd(38)} [${tag}] -> ${userId}`);
  }

  console.log(`\nDemo accounts ready — password for all: ${PASSWORD}`);
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
