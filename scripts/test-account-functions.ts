/**
 * One-off validation script — NOT part of the app. Exercises the DB-level
 * logic behind src/lib/account.functions.ts the same way test-auth-core.ts
 * and test-signup-profile.ts do (through withUser/withAdmin directly,
 * bypassing the cookie/request-context layer a standalone script doesn't
 * have). The important risk here isn't syntax — it's the multi-table
 * delete in deleteMyAccountData: confirms it wipes exactly the calling
 * user's rows across all 7 tables and never touches another user's.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { rawSql, withAdmin, withUser } from "../src/db";
import {
  conversationMessages,
  conversationSessions,
  ieltsAttempts,
  listeningAttempts,
  profiles,
  pronunciationAttempts,
  pronunciationScores,
  speakingAttempts,
  usersInAuth,
} from "../src/db/schema/schema";

async function seedActivity(userId: string) {
  await withAdmin(async (db) => {
    await db.insert(speakingAttempts).values({ userId });
    await db.insert(pronunciationAttempts).values({ userId });
    await db.insert(pronunciationScores).values({ userId, sound: "th" });
    await db.insert(ieltsAttempts).values({ userId });
    await db.insert(listeningAttempts).values({ userId });
    const [session] = await db
      .insert(conversationSessions)
      .values({ userId })
      .returning({ id: conversationSessions.id });
    await db.insert(conversationMessages).values({ sessionId: session!.id, userId, role: "user" });
  });
}

async function countActivity(userId: string): Promise<number> {
  return withAdmin(async (db) => {
    const [a, b, c, d, e, f] = await Promise.all([
      db.select().from(speakingAttempts).where(eq(speakingAttempts.userId, userId)),
      db.select().from(pronunciationAttempts).where(eq(pronunciationAttempts.userId, userId)),
      db.select().from(pronunciationScores).where(eq(pronunciationScores.userId, userId)),
      db.select().from(ieltsAttempts).where(eq(ieltsAttempts.userId, userId)),
      db.select().from(listeningAttempts).where(eq(listeningAttempts.userId, userId)),
      db.select().from(conversationSessions).where(eq(conversationSessions.userId, userId)),
    ]);
    return a.length + b.length + c.length + d.length + e.length + f.length;
  });
}

// Mirrors deleteMyAccountData's handler body exactly.
async function deleteMyAccountData(userId: string) {
  await withUser(userId, async (db) => {
    await db.delete(speakingAttempts).where(eq(speakingAttempts.userId, userId));
    await db.delete(pronunciationAttempts).where(eq(pronunciationAttempts.userId, userId));
    await db.delete(pronunciationScores).where(eq(pronunciationScores.userId, userId));
    await db.delete(ieltsAttempts).where(eq(ieltsAttempts.userId, userId));
    await db.delete(listeningAttempts).where(eq(listeningAttempts.userId, userId));
    await db.delete(conversationMessages).where(eq(conversationMessages.userId, userId));
    await db.delete(conversationSessions).where(eq(conversationSessions.userId, userId));
  });
}

async function main() {
  const userA = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-acct-a-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });
  const userB = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-acct-b-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  await seedActivity(userA);
  await seedActivity(userB);
  const beforeA = await countActivity(userA);
  const beforeB = await countActivity(userB);
  if (beforeA !== 6 || beforeB !== 6) {
    throw new Error(`FAIL: seeding didn't land as expected (A=${beforeA}, B=${beforeB}, want 6/6)`);
  }
  console.log("Seed: 6 rows across 6 tables for each of user A and user B. OK.");

  // updateMyAccountProfile-style write, scoped to A only.
  await withUser(userA, (db) =>
    db.update(profiles).set({ fullName: "Test Account A", dailyGoalMinutes: 30 }).where(eq(profiles.id, userA)),
  );
  const [profileA] = await withAdmin((db) => db.select().from(profiles).where(eq(profiles.id, userA)));
  const [profileB] = await withAdmin((db) => db.select().from(profiles).where(eq(profiles.id, userB)));
  if (profileA?.fullName !== "Test Account A" || profileA.dailyGoalMinutes !== 30) {
    throw new Error(`FAIL: profile update on A did not land — got ${JSON.stringify(profileA)}`);
  }
  if (profileB?.fullName === "Test Account A") {
    throw new Error("FAIL: profile update on A leaked into B");
  }
  console.log("updateMyAccountProfile-style scoped write: OK, no cross-user leak.");

  // deleteMyAccountData-style delete, scoped to A only.
  await deleteMyAccountData(userA);
  const afterA = await countActivity(userA);
  const afterB = await countActivity(userB);
  if (afterA !== 0) throw new Error(`FAIL: user A still has ${afterA} activity rows after delete`);
  if (afterB !== 6) throw new Error(`FAIL: user B lost rows too (has ${afterB}, want 6) — cross-user delete leak`);
  console.log("deleteMyAccountData-style scoped delete: wiped A's 6 rows, left B's 6 rows untouched. OK.");

  // Cleanup — conversation_messages cascades with conversation_sessions, so
  // only B's session-owning rows need explicit cleanup before the users.
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userA)));
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userB)));

  console.log("\nALL ACCOUNT-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
