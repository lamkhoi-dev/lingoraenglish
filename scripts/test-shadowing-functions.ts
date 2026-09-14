/**
 * One-off validation script — NOT part of the app. Exercises
 * shadowing.functions.ts: the two raw-SQL RPC reads (topic overview +
 * tier-gated sentence bodies) and the plain-upsert save function.
 */
import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { rawSql, withAdmin, withAnon, withUser } from "../src/db";
import { shadowingProgress, shadowingSentences, shadowingTopics, usersInAuth } from "../src/db/schema/schema";

async function main() {
  const topic = await withAdmin(async (db) => {
    const rows = await db
      .insert(shadowingTopics)
      .values({ slug: `test-${randomUUID()}`, name: "Test topic", isActive: true })
      .returning({ id: shadowingTopics.id, slug: shadowingTopics.slug });
    return rows[0]!;
  });
  const freeSentence = await withAdmin(async (db) => {
    const rows = await db
      .insert(shadowingSentences)
      .values({ topicId: topic.id, sentence: "Free sentence.", isFree: true, status: "published", sortOrder: 1 })
      .returning({ id: shadowingSentences.id });
    return rows[0]!;
  });
  const premiumSentence = await withAdmin(async (db) => {
    const rows = await db
      .insert(shadowingSentences)
      .values({ topicId: topic.id, sentence: "Premium sentence.", isFree: false, status: "published", sortOrder: 2 })
      .returning({ id: shadowingSentences.id });
    return rows[0]!;
  });

  const overview = (await withAnon((db) => db.execute(sql`select * from shadowing_topic_overview()`))) as {
    slug: string;
    total_sentences: number;
    free_sentences: number;
  }[];
  const row = overview.find((r) => r.slug === topic.slug);
  if (!row || row.total_sentences !== 2 || row.free_sentences !== 1) {
    throw new Error(`FAIL: expected total=2/free=1 for topic, got ${JSON.stringify(row)}`);
  }
  console.log("shadowing_topic_overview(): counts correct. OK.");

  const sentencesAsAnon = (await withAnon((db) =>
    db.execute(sql`select * from shadowing_topic_sentences(${topic.slug})`),
  )) as { id: string; sentence: string; unlocked: boolean }[];
  const anonFree = sentencesAsAnon.find((r) => r.id === freeSentence.id);
  const anonPremium = sentencesAsAnon.find((r) => r.id === premiumSentence.id);
  if (anonFree?.sentence !== "Free sentence.") throw new Error("FAIL: anon should see the free sentence body");
  if (anonPremium?.sentence !== "") throw new Error(`FAIL: anon should see an EMPTY body for the locked premium sentence, got "${anonPremium?.sentence}"`);
  if (anonPremium?.unlocked !== false) throw new Error("FAIL: premium sentence should be marked locked for anon");
  console.log("shadowing_topic_sentences(): free body visible, premium body withheld + marked locked for anon. OK.");

  // saveShadowingProgress-style upsert.
  const userId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-shadow-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });
  const otherUserId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-shadow-other-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  await withUser(userId, (db) =>
    db
      .insert(shadowingProgress)
      .values({
        userId,
        sentenceId: freeSentence.id,
        attempts: 1,
        clearAttempts: 0,
        bestAccuracy: "72.00",
        lastAccuracy: "72.00",
        status: "in_progress",
        secondsPractised: 5,
      })
      .onConflictDoUpdate({
        target: [shadowingProgress.userId, shadowingProgress.sentenceId],
        set: { attempts: 1, bestAccuracy: "72.00", lastAccuracy: "72.00", status: "in_progress" },
      }),
  );
  const mine = await withUser(userId, (db) => db.select().from(shadowingProgress).where(eq(shadowingProgress.userId, userId)));
  if (mine.length !== 1 || Math.abs(Number(mine[0]!.bestAccuracy) - 72) > 0.001) {
    throw new Error(`FAIL: shadowing progress upsert/round-trip wrong, got ${JSON.stringify(mine)}`);
  }
  const otherSees = await withUser(otherUserId, (db) => db.select().from(shadowingProgress).where(eq(shadowingProgress.userId, userId)));
  if (otherSees.length !== 0) throw new Error("FAIL: user B can read user A's shadowing progress");
  console.log("saveShadowingProgress-style upsert + cross-user isolation: OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, otherUserId)));
  await withAdmin((db) => db.delete(shadowingTopics).where(eq(shadowingTopics.id, topic.id)));

  console.log("\nALL SHADOWING-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
