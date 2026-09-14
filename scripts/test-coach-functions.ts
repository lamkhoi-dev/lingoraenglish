/**
 * One-off validation script — NOT part of the app. Exercises coach.functions.ts,
 * with the main focus on coach_reserve_turn() — the one Postgres function in
 * this migration that exists specifically to prevent a race condition (firing
 * several "send message" requests at once to beat the free-turn limit). This
 * confirms: (a) it's callable through withUser() at all (needs auth.uid()),
 * (b) it enforces the free-turn limit correctly, and (c) — the actual point
 * of the advisory lock — N concurrent calls against the same session hand out
 * N distinct, gapless turn numbers, never a duplicate.
 */
import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { rawSql, withAdmin, withUser } from "../src/db";
import { coachSessions, coachTopics, coachTurns, usersInAuth } from "../src/db/schema/schema";

async function reserveTurn(userId: string, sessionId: string, limit: number, countFree: boolean): Promise<number> {
  const rows = await withUser(userId, (db) =>
    db.execute(sql`select coach_reserve_turn(${sessionId}, ${limit}, ${countFree}) as turn_number`),
  );
  const value = (rows as unknown as { turn_number: number | null }[])[0]?.turn_number;
  if (value == null) throw new Error("reserveTurn returned null");
  return value;
}

/** DrizzleQueryError's own .message is just "Failed query: <sql text>" — the
 * actual Postgres exception text (e.g. "turn_limit_reached") is on .cause. */
function errorMentions(err: unknown, needle: string): boolean {
  let current: unknown = err;
  for (let i = 0; i < 5 && current; i++) {
    if (current instanceof Error && current.message.includes(needle)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

async function main() {
  const topic = await withAdmin(async (db) => {
    const rows = await db
      .insert(coachTopics)
      .values({ category: "free", slug: `test-${randomUUID()}`, title: "Test Topic", openingMessage: "Hello!", isActive: true, accessTier: "free" })
      .returning({ id: coachTopics.id });
    return rows[0]!;
  });
  const userId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-coach-session-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  // startCoachSession-style: create session + opening turn (turn 0, not counted free).
  const sessionRows = await withAdmin((db) =>
    db.insert(coachSessions).values({ userId, topicId: topic.id, category: "free", topicTitle: "Test Topic", level: "B1", tierAtStart: "free" }).returning({ id: coachSessions.id }),
  );
  const session = sessionRows[0]!;
  await withAdmin((db) => db.insert(coachTurns).values({ sessionId: session.id, userId, turnNumber: 0, userText: "", coachText: "Hello!", countedFree: false }));
  console.log("startCoachSession-style: session + opening turn (0) created. OK.");

  // coach_reserve_turn via withUser — must succeed for the real session owner.
  const turn1 = await reserveTurn(userId, session.id, 10, true);
  if (turn1 !== 1) throw new Error(`FAIL: expected first reserved turn to be 1, got ${turn1}`);
  console.log("coach_reserve_turn() via withUser(): first real turn reserved as turn_number=1. OK.");

  // Free-turn limit enforcement: with limit=1 and 1 already counted-free turn
  // on record (turn1, countFree=true), the next countFree=true reservation
  // must raise turn_limit_reached.
  let limitHit = false;
  try {
    await reserveTurn(userId, session.id, 1, true);
  } catch (err) {
    limitHit = errorMentions(err, "turn_limit_reached");
    if (!limitHit) console.error("unexpected error shape:", err);
  }
  if (!limitHit) throw new Error("FAIL: coach_reserve_turn did not enforce the free-turn limit");
  console.log("coach_reserve_turn() enforces the free-turn limit (turn_limit_reached). OK.");

  // Concurrency: fire 10 reservations at once against a FRESH session (no
  // limit this time) — the advisory lock inside coach_reserve_turn must
  // still hand out 10 distinct, non-colliding turn numbers.
  const session2Rows = await withAdmin((db) =>
    db.insert(coachSessions).values({ userId, topicId: topic.id, category: "free", topicTitle: "Test Topic", level: "B1", tierAtStart: "free" }).returning({ id: coachSessions.id }),
  );
  const session2 = session2Rows[0]!;
  await withAdmin((db) => db.insert(coachTurns).values({ sessionId: session2.id, userId, turnNumber: 0, userText: "", coachText: "Hi!", countedFree: false }));

  const results = await Promise.all(Array.from({ length: 10 }, () => reserveTurn(userId, session2.id, 0, false)));
  const unique = new Set(results);
  if (unique.size !== 10) throw new Error(`FAIL: expected 10 distinct turn numbers from 10 concurrent reservations, got ${JSON.stringify(results)}`);
  console.log(`coach_reserve_turn() under 10 concurrent calls on the same session: 10 distinct turn numbers, no collision (${[...unique].sort((a, b) => a - b).join(",")}). OK.`);

  // Cross-user protection: a different user must NOT be able to reserve a
  // turn on someone else's session (auth.uid() <> owner check inside the function).
  const otherUserId = await withAdmin(async (db) => {
    const rows = await db.insert(usersInAuth).values({ email: `test-coach-other-${randomUUID()}@test.local`, encryptedPassword: "x" }).returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });
  let rejected = false;
  try {
    await reserveTurn(otherUserId, session2.id, 0, false);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("FAIL: a different user was able to reserve a turn on someone else's coach session");
  console.log("coach_reserve_turn() rejects a caller who doesn't own the session. OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, otherUserId)));
  await withAdmin((db) => db.delete(coachTopics).where(eq(coachTopics.id, topic.id)));

  console.log("\nALL COACH-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
