/**
 * One-off validation script — NOT part of the app. Exercises the DB-level
 * logic behind src/lib/vocabulary.functions.ts and
 * src/lib/pronunciation.functions.ts.
 *
 * Specific risk being checked: vocabulary_words is tier-gated
 * (`can_access_tier(access_tier)`), and getVocabularyWords() branches
 * between withAnon()/withUser() depending on whether a session exists
 * (see getOptionalUserId in require-auth.ts). A mistake there (e.g.
 * accidentally using withAdmin, which bypasses RLS entirely) would leak
 * premium-tier content to visitors and free-tier users alike.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { rawSql, withAdmin, withAnon, withUser } from "../src/db";
import {
  pronunciationAttempts,
  pronunciationScores,
  usersInAuth,
  vocabularyProgress,
  vocabularyWords,
} from "../src/db/schema/schema";

async function main() {
  const freeWord = await withAdmin(async (db) => {
    const rows = await db
      .insert(vocabularyWords)
      .values({ word: `free-${randomUUID()}`, status: "published", accessTier: "free" })
      .returning({ id: vocabularyWords.id, word: vocabularyWords.word });
    return rows[0]!;
  });
  const premiumWord = await withAdmin(async (db) => {
    const rows = await db
      .insert(vocabularyWords)
      .values({ word: `premium-${randomUUID()}`, status: "published", accessTier: "premium" })
      .returning({ id: vocabularyWords.id, word: vocabularyWords.word });
    return rows[0]!;
  });

  // getVocabularyWords()-style read, anon branch.
  const asAnon = await withAnon((db) =>
    db.select({ id: vocabularyWords.id }).from(vocabularyWords).where(eq(vocabularyWords.status, "published")),
  );
  const anonIds = new Set(asAnon.map((r) => r.id));
  if (!anonIds.has(freeWord.id)) throw new Error("FAIL: anon can't see free-tier word");
  if (anonIds.has(premiumWord.id)) throw new Error("FAIL: anon can see premium-tier word — RLS/tier leak");
  console.log("Anon sees free-tier vocabulary, not premium-tier: OK.");

  // Same query, but as a real (non-premium) logged-in user — must match anon's view exactly.
  const userId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-vocab-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });
  const asFreeUser = await withUser(userId, (db) =>
    db.select({ id: vocabularyWords.id }).from(vocabularyWords).where(eq(vocabularyWords.status, "published")),
  );
  const freeUserIds = new Set(asFreeUser.map((r) => r.id));
  if (!freeUserIds.has(freeWord.id)) throw new Error("FAIL: free-tier user can't see free-tier word");
  if (freeUserIds.has(premiumWord.id)) {
    throw new Error("FAIL: logged-in free-tier user can see premium-tier word — entitlement check bypassed");
  }
  console.log("Logged-in free-tier user sees the same free-tier-only view as anon: OK.");

  // getMyVocabularyProgress / toggle-style write, cross-user isolation.
  const otherUserId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-vocab-other-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });
  await withUser(userId, (db) =>
    db.insert(vocabularyProgress).values({ userId, wordId: freeWord.id, mastered: true, timesPracticed: 1 }),
  );
  const otherProgress = await withUser(otherUserId, (db) =>
    db.select().from(vocabularyProgress).where(eq(vocabularyProgress.userId, userId)),
  );
  if (otherProgress.length !== 0) throw new Error("FAIL: user B can read user A's vocabulary_progress");
  console.log("vocabulary_progress cross-user isolation: OK.");

  // getMyPronunciationProgress-style read: numeric columns convert cleanly.
  await withAdmin(async (db) => {
    await db.insert(pronunciationScores).values({ userId, sound: "th", score: "81.25" });
    await db.insert(pronunciationAttempts).values({ userId, mode: "sounds", accuracy: "77.00" });
  });
  const pron = await withUser(userId, (db) =>
    db.select({ score: pronunciationScores.score }).from(pronunciationScores).where(eq(pronunciationScores.userId, userId)),
  );
  const scoreNum = Number(pron[0]!.score);
  if (Math.abs(scoreNum - 81.25) > 0.001) throw new Error(`FAIL: expected 81.25, got ${scoreNum}`);
  console.log("pronunciation numeric conversion: OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, otherUserId)));
  await withAdmin((db) => db.delete(vocabularyWords).where(eq(vocabularyWords.id, freeWord.id)));
  await withAdmin((db) => db.delete(vocabularyWords).where(eq(vocabularyWords.id, premiumWord.id)));

  console.log("\nALL VOCAB/PRONUNCIATION-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
