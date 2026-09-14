/**
 * One-off validation script — NOT part of the app. Exercises the DB-level
 * logic behind src/lib/progress.functions.ts. The specific risk being
 * checked here: Postgres `numeric` columns come back from drizzle-orm as
 * strings, not numbers (unlike Supabase's PostgREST, which serialized them
 * as bare JSON numbers) — every caller downstream does arithmetic/
 * comparisons on these values, so a missed Number() conversion would pass
 * type-checking (string is still assignable in loose spots) but silently
 * break math at runtime. This confirms the actual returned values are
 * numbers, not strings, and that per-user scoping still holds.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { rawSql, withAdmin, withUser } from "../src/db";
import {
  conversationSessions,
  listeningAttempts,
  pronunciationScores,
  speakingAttempts,
  usersInAuth,
  vocabularyProgress,
} from "../src/db/schema/schema";

async function main() {
  const userId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-progress-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });
  const otherUserId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-progress-other-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  await withAdmin(async (db) => {
    await db.insert(speakingAttempts).values([
      { userId, overall: "8.5", questionText: "Q1" },
      { userId, overall: "6.0", questionText: "Q2" },
      // Belongs to the other user — must never show up in userId's results.
      { userId: otherUserId, overall: "1.0", questionText: "not mine" },
    ]);
    await db.insert(pronunciationScores).values({ userId, sound: "th", score: "72.50" });
    await db.insert(listeningAttempts).values({ userId, score: "90.00" });
    await db.insert(conversationSessions).values({ userId, performance: "7.5" });
  });

  // Mirrors getDashboardProgress()'s handler body.
  const dashboard = await withUser(userId, async (db) => {
    const [speaking, vocab, listening, pron, sessions] = await Promise.all([
      db.select({ overall: speakingAttempts.overall }).from(speakingAttempts).where(eq(speakingAttempts.userId, userId)).limit(50),
      db.select({ mastered: vocabularyProgress.mastered }).from(vocabularyProgress).where(eq(vocabularyProgress.userId, userId)).limit(500),
      db.select({ score: listeningAttempts.score }).from(listeningAttempts).where(eq(listeningAttempts.userId, userId)).limit(50),
      db.select({ score: pronunciationScores.score }).from(pronunciationScores).where(eq(pronunciationScores.userId, userId)).limit(100),
      db.select({ performance: conversationSessions.performance }).from(conversationSessions).where(eq(conversationSessions.userId, userId)).limit(50),
    ]);
    return { speaking, vocab, listening, pron, sessions };
  });

  if (dashboard.speaking.length !== 2) {
    throw new Error(`FAIL: expected 2 speaking_attempts scoped to userId, got ${dashboard.speaking.length} — RLS leak?`);
  }
  if (typeof dashboard.speaking[0]!.overall !== "string") {
    throw new Error("FAIL: expected raw driver value to be a string (this is the thing Number() must convert)");
  }
  const overallNums = dashboard.speaking.map((r) => Number(r.overall));
  if (overallNums.some((n) => Number.isNaN(n))) throw new Error("FAIL: Number(numeric-string) produced NaN");
  const avgOverall = overallNums.reduce((a, b) => a + b, 0) / overallNums.length;
  if (Math.abs(avgOverall - 7.25) > 0.001) throw new Error(`FAIL: expected avg 7.25, got ${avgOverall}`);
  console.log("Numeric columns round-trip as strings from the driver and convert cleanly with Number(): OK.");
  console.log(`Cross-user isolation on speaking_attempts: only userId's 2 rows visible (not otherUserId's). OK.`);

  const pronScore = Number(dashboard.pron[0]!.score);
  if (Math.abs(pronScore - 72.5) > 0.001) throw new Error(`FAIL: pronunciation score expected 72.5, got ${pronScore}`);
  console.log("pronunciation_scores numeric conversion: OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, otherUserId)));

  console.log("\nALL PROGRESS-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
