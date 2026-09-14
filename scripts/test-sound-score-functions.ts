/**
 * One-off validation script — NOT part of the app. Exercises
 * pronunciation.functions.ts's updatePronunciationSoundScore: the running-
 * average logic (score = (oldScore*oldAttempts + newAccuracy) / newAttempts)
 * is the one place in this migration doing read-modify-write arithmetic on
 * a numeric column, so it's worth checking the actual math, not just that
 * the query runs.
 */
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { rawSql, withAdmin, withUser } from "../src/db";
import { pronunciationScores, usersInAuth } from "../src/db/schema/schema";

async function updateSoundScore(userId: string, sound: string, accuracy: number) {
  await withUser(userId, async (db) => {
    const existingRows = await db
      .select({ id: pronunciationScores.id, score: pronunciationScores.score, attempts: pronunciationScores.attempts })
      .from(pronunciationScores)
      .where(and(eq(pronunciationScores.userId, userId), eq(pronunciationScores.sound, sound)))
      .limit(1);
    const existing = existingRows[0];
    if (existing) {
      const nextAttempts = existing.attempts + 1;
      const nextScore = Math.round((Number(existing.score) * existing.attempts + accuracy) / nextAttempts);
      await db.update(pronunciationScores).set({ score: String(nextScore), attempts: nextAttempts }).where(eq(pronunciationScores.id, existing.id));
    } else {
      await db.insert(pronunciationScores).values({ userId, sound, score: String(accuracy), attempts: 1 });
    }
  });
}

async function main() {
  const userId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-sound-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  // First attempt: no existing row -> insert at attempts=1, score=accuracy.
  await updateSoundScore(userId, "th", 80);
  let row = (await withAdmin((db) => db.select().from(pronunciationScores).where(and(eq(pronunciationScores.userId, userId), eq(pronunciationScores.sound, "th"))))).at(0)!;
  if (row.attempts !== 1 || Number(row.score) !== 80) throw new Error(`FAIL: first attempt expected attempts=1/score=80, got ${JSON.stringify(row)}`);
  console.log("First attempt (no existing row): inserted at attempts=1, score=accuracy. OK.");

  // Second attempt: (80*1 + 90) / 2 = 85.
  await updateSoundScore(userId, "th", 90);
  row = (await withAdmin((db) => db.select().from(pronunciationScores).where(and(eq(pronunciationScores.userId, userId), eq(pronunciationScores.sound, "th"))))).at(0)!;
  if (row.attempts !== 2 || Number(row.score) !== 85) throw new Error(`FAIL: second attempt expected attempts=2/score=85, got ${JSON.stringify(row)}`);
  console.log("Second attempt: running average (80*1+90)/2 = 85. OK.");

  // Third attempt: (85*2 + 40) / 3 = 70 (rounded).
  await updateSoundScore(userId, "th", 40);
  row = (await withAdmin((db) => db.select().from(pronunciationScores).where(and(eq(pronunciationScores.userId, userId), eq(pronunciationScores.sound, "th"))))).at(0)!;
  if (row.attempts !== 3 || Number(row.score) !== 70) throw new Error(`FAIL: third attempt expected attempts=3/score=70, got ${JSON.stringify(row)}`);
  console.log("Third attempt: running average (85*2+40)/3 = 70 (rounded). OK.");

  // A different sound for the same user must not interfere.
  await updateSoundScore(userId, "sh", 60);
  const thRow = (await withAdmin((db) => db.select().from(pronunciationScores).where(and(eq(pronunciationScores.userId, userId), eq(pronunciationScores.sound, "th"))))).at(0)!;
  if (Number(thRow.score) !== 70 || thRow.attempts !== 3) throw new Error("FAIL: updating a different sound affected 'th'");
  console.log("Different sound for the same user tracked independently. OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));

  console.log("\nALL SOUND-SCORE CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
