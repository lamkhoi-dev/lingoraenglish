/**
 * One-off validation script — NOT part of the app. Exercises:
 *   1. src/lib/coach.functions.ts's new getCoachTopicCatalogue — the first
 *      place in this migration calling a raw Postgres function
 *      (coach_topic_catalogue()) through db.execute(sql`...`) instead of
 *      Drizzle's table query builder. Confirms the row shape comes back
 *      correctly AND that tier-gating still works through it (same
 *      can_access_tier() risk as vocabulary_words, just reached differently).
 *   2. src/lib/attempts.functions.ts's three save*Attempt functions —
 *      mirrors their insert shape directly and checks numeric round-trip +
 *      cross-user isolation, same pattern as the other *-functions tests.
 */
import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { rawSql, withAdmin, withAnon, withUser } from "../src/db";
import { coachTopics, ieltsAttempts, pronunciationAttempts, speakingAttempts, usersInAuth } from "../src/db/schema/schema";

async function main() {
  const freeTopic = await withAdmin(async (db) => {
    const rows = await db
      .insert(coachTopics)
      .values({ category: "free", slug: `free-${randomUUID()}`, title: "Free topic", accessTier: "free" })
      .returning({ id: coachTopics.id });
    return rows[0]!;
  });
  const premiumTopic = await withAdmin(async (db) => {
    const rows = await db
      .insert(coachTopics)
      .values({ category: "free", slug: `premium-${randomUUID()}`, title: "Premium topic", accessTier: "premium" })
      .returning({ id: coachTopics.id });
    return rows[0]!;
  });

  // getCoachTopicCatalogue()-style call, anon branch.
  const asAnon = (await withAnon((db) => db.execute(sql`select * from coach_topic_catalogue(${null})`))) as {
    id: string;
    unlocked: boolean;
  }[];
  const anonFree = asAnon.find((r) => r.id === freeTopic.id);
  const anonPremium = asAnon.find((r) => r.id === premiumTopic.id);
  if (!anonFree || anonFree.unlocked !== true) throw new Error("FAIL: anon should see the free topic as unlocked");
  if (!anonPremium || anonPremium.unlocked !== false) {
    throw new Error("FAIL: anon should see the premium topic listed but locked (unlocked=false)");
  }
  console.log("coach_topic_catalogue() via db.execute(sql): row shape + anon tier-gating correct. OK.");

  const userId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-coach-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });
  const asFreeUser = (await withUser(userId, (db) =>
    db.execute(sql`select * from coach_topic_catalogue(${null})`),
  )) as { id: string; unlocked: boolean }[];
  const userPremium = asFreeUser.find((r) => r.id === premiumTopic.id);
  if (!userPremium || userPremium.unlocked !== false) {
    throw new Error("FAIL: a free-tier logged-in user should still see the premium topic as locked");
  }
  console.log("Same call scoped to a real (non-premium) user: premium topic still locked. OK.");

  // attempts.functions.ts-style inserts + cross-user isolation.
  const otherUserId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-coach-other-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  await withUser(userId, (db) =>
    db.insert(speakingAttempts).values({ userId, questionText: "Q", transcript: "T", overall: "7.5" }),
  );
  await withUser(userId, (db) =>
    db.insert(ieltsAttempts).values({ userId, questionText: "Q", transcript: "T", estimatedBand: "6.5" }),
  );
  await withUser(userId, (db) =>
    db.insert(pronunciationAttempts).values({ userId, mode: "ielts-read-aloud", target: "hello", accuracy: "88.00" }),
  );

  const otherSeesSpeaking = await withUser(otherUserId, (db) =>
    db.select().from(speakingAttempts).where(eq(speakingAttempts.userId, userId)),
  );
  const otherSeesIelts = await withUser(otherUserId, (db) =>
    db.select().from(ieltsAttempts).where(eq(ieltsAttempts.userId, userId)),
  );
  const otherSeesPron = await withUser(otherUserId, (db) =>
    db.select().from(pronunciationAttempts).where(eq(pronunciationAttempts.userId, userId)),
  );
  if (otherSeesSpeaking.length || otherSeesIelts.length || otherSeesPron.length) {
    throw new Error("FAIL: user B can read user A's attempt rows");
  }
  console.log("save*Attempt-style inserts land + are isolated from other users: OK.");

  const own = await withUser(userId, (db) => db.select().from(pronunciationAttempts).where(eq(pronunciationAttempts.userId, userId)));
  if (Math.abs(Number(own[0]!.accuracy) - 88) > 0.001) throw new Error("FAIL: pronunciation accuracy didn't round-trip");
  console.log("Numeric round-trip on pronunciation_attempts.accuracy: OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, otherUserId)));
  await withAdmin((db) => db.delete(coachTopics).where(eq(coachTopics.id, freeTopic.id)));
  await withAdmin((db) => db.delete(coachTopics).where(eq(coachTopics.id, premiumTopic.id)));

  console.log("\nALL COACH/ATTEMPTS-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
