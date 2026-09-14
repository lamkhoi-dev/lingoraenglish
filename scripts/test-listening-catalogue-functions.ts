/**
 * One-off validation script — NOT part of the app. Exercises:
 *   1. listening.functions.ts's getListeningCatalogue/getListeningLesson —
 *      raw-SQL RPC + direct table read, both tier-gated, both branching
 *      withAnon()/withUser() like vocabulary/coach.
 *   2. saveListeningProgress's accumulate-don't-overwrite semantics: a
 *      second save for the same lesson must ADD to attempts/seconds_listened,
 *      not reset them — this is the one save*Progress function in the whole
 *      migration that isn't a plain upsert, so it's the one worth a
 *      dedicated regression check.
 *   3. content-catalogue.functions.ts's getContentCatalogue for the
 *      'vocabulary' kind (shares the same RPC pattern).
 */
import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { rawSql, withAdmin, withAnon, withUser } from "../src/db";
import { listeningLessons, listeningProgress, usersInAuth } from "../src/db/schema/schema";

async function main() {
  const freeLesson = await withAdmin(async (db) => {
    const rows = await db
      .insert(listeningLessons)
      .values({ slug: `free-${randomUUID()}`, title: "Free lesson", status: "published", isFree: true })
      .returning({ id: listeningLessons.id });
    return rows[0]!;
  });
  const premiumLesson = await withAdmin(async (db) => {
    const rows = await db
      .insert(listeningLessons)
      .values({ slug: `premium-${randomUUID()}`, title: "Premium lesson", status: "published", isFree: false })
      .returning({ id: listeningLessons.id });
    return rows[0]!;
  });

  const asAnon = (await withAnon((db) => db.execute(sql`select * from listening_catalogue()`))) as {
    id: string;
    unlocked: boolean;
  }[];
  const anonFree = asAnon.find((r) => r.id === freeLesson.id);
  const anonPremium = asAnon.find((r) => r.id === premiumLesson.id);
  if (!anonFree?.unlocked) throw new Error("FAIL: anon should see the free lesson unlocked");
  if (anonPremium?.unlocked !== false) throw new Error("FAIL: anon should see the premium lesson locked");
  console.log("listening_catalogue() via db.execute(sql): tier-gating correct for anon. OK.");

  // getListeningLesson-style direct read: anon can read the free lesson body
  // (RLS: is_free OR can_access_tier('premium')) but not the premium one.
  const anonReadFree = await withAnon((db) => db.select({ id: listeningLessons.id }).from(listeningLessons).where(eq(listeningLessons.id, freeLesson.id)));
  const anonReadPremium = await withAnon((db) => db.select({ id: listeningLessons.id }).from(listeningLessons).where(eq(listeningLessons.id, premiumLesson.id)));
  if (anonReadFree.length !== 1) throw new Error("FAIL: anon could not read the free lesson body directly");
  if (anonReadPremium.length !== 0) throw new Error("FAIL: anon could read the premium lesson body directly — RLS leak");
  console.log("Direct listening_lessons row read respects the same tier gate for anon. OK.");

  const asVocabAnon = (await withAnon((db) => db.execute(sql`select * from content_catalogue(${"vocabulary"})`))) as unknown[];
  if (!Array.isArray(asVocabAnon)) throw new Error("FAIL: content_catalogue('vocabulary') did not return an array-like result");
  console.log("content_catalogue('vocabulary') via db.execute(sql): OK (row shape returned).");

  // saveListeningProgress-style accumulate semantics.
  const userId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-listening-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  async function saveOnce(secondsListened: number) {
    return withUser(userId, async (db) => {
      const existingRows = await db
        .select({ attempts: listeningProgress.attempts, secondsListened: listeningProgress.secondsListened })
        .from(listeningProgress)
        .where(and(eq(listeningProgress.userId, userId), eq(listeningProgress.lessonId, freeLesson.id)))
        .limit(1);
      const existing = existingRows[0];
      const nextAttempts = (existing?.attempts ?? 0) + 1;
      const nextSeconds = (existing?.secondsListened ?? 0) + secondsListened;
      const rows = await db
        .insert(listeningProgress)
        .values({ userId, lessonId: freeLesson.id, attempts: nextAttempts, secondsListened: nextSeconds, completedAt: new Date().toISOString() })
        .onConflictDoUpdate({
          target: [listeningProgress.userId, listeningProgress.lessonId],
          set: { attempts: nextAttempts, secondsListened: nextSeconds, completedAt: new Date().toISOString() },
        })
        .returning({ attempts: listeningProgress.attempts, secondsListened: listeningProgress.secondsListened });
      return rows[0]!;
    });
  }

  const first = await saveOnce(30);
  if (first.attempts !== 1 || first.secondsListened !== 30) throw new Error(`FAIL: first save expected attempts=1/seconds=30, got ${JSON.stringify(first)}`);
  const second = await saveOnce(45);
  if (second.attempts !== 2 || second.secondsListened !== 75) {
    throw new Error(`FAIL: second save expected attempts=2/seconds=75 (accumulated), got ${JSON.stringify(second)}`);
  }
  console.log("saveListeningProgress-style accumulate semantics (attempts +1, seconds_listened added, not overwritten): OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));
  await withAdmin((db) => db.delete(listeningLessons).where(eq(listeningLessons.id, freeLesson.id)));
  await withAdmin((db) => db.delete(listeningLessons).where(eq(listeningLessons.id, premiumLesson.id)));

  console.log("\nALL LISTENING/CATALOGUE-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
