/**
 * One-off validation script — NOT part of the app. Proves the RLS
 * compatibility shim (db/0000_auth_compat_shim.sql) + src/db/index.ts
 * actually isolate two users from each other, and that concurrent
 * requests on the shared connection pool don't leak `app.user_id` across
 * each other. Run once against the local dev Postgres, then delete or
 * keep for regression checks — not wired into any build step.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { rawSql, withAdmin, withAnon, withUser } from "../src/db";
import { speakingAttempts, vocabularyWords } from "../src/db/schema/schema";

async function main() {
  const userA = randomUUID();
  const userB = randomUUID();

  // Seed via service_role (bypasses RLS) — mirrors how a signup flow would insert.
  await withAdmin(async (db) => {
    await db.execute(sql`insert into auth.users (id, email, encrypted_password) values
      (${userA}, ${"a-" + userA + "@test.local"}, 'x'),
      (${userB}, ${"b-" + userB + "@test.local"}, 'x')`);
    await db.insert(speakingAttempts).values([
      { userId: userA, questionText: "Q for A", transcript: "hello from A" },
      { userId: userB, questionText: "Q for B", transcript: "hello from B" },
    ]);
  });

  // 1. User A must see only their own row.
  const aRows = await withUser(userA, (db) => db.select().from(speakingAttempts));
  const bRows = await withUser(userB, (db) => db.select().from(speakingAttempts));
  console.log(`User A sees ${aRows.length} row(s):`, aRows.map((r) => r.transcript));
  console.log(`User B sees ${bRows.length} row(s):`, bRows.map((r) => r.transcript));
  if (aRows.length !== 1 || aRows[0]?.userId !== userA) throw new Error("FAIL: user A isolation broken");
  if (bRows.length !== 1 || bRows[0]?.userId !== userB) throw new Error("FAIL: user B isolation broken");

  // 2. Anon (no session) must never see private rows — either RLS filters to zero rows,
  // or (as here, since `anon` was never GRANTed this table at all) Postgres denies the
  // query outright. Both are safe outcomes; only "got real rows back" is a failure.
  try {
    const anonRows = await withAnon((db) => db.select().from(speakingAttempts));
    if (anonRows.length !== 0) throw new Error(`FAIL: anon should see 0 speaking_attempts, saw ${anonRows.length}`);
    console.log("Anon query on speaking_attempts returned 0 rows (RLS filtered).");
  } catch (err) {
    const full = `${err}` + (err instanceof Error && err.cause ? ` | cause: ${err.cause}` : "");
    if (/permission denied/.test(full)) {
      console.log("Anon query on speaking_attempts was denied at the grant level (expected — matches Supabase).");
    } else {
      throw err;
    }
  }
  const anonVocab = await withAnon((db) => db.select().from(vocabularyWords).limit(1));
  console.log(`Anon sees ${anonVocab.length} public vocabulary row(s) (should be > 0 if seeded)`);

  // 3. Concurrency: fire A and B truly in parallel many times — a leak would show up as
  // cross-contamination (A occasionally seeing B's row) under pool reuse pressure.
  const rounds = 25;
  const results = await Promise.all(
    Array.from({ length: rounds }, (_, i) =>
      i % 2 === 0
        ? withUser(userA, (db) => db.select().from(speakingAttempts)).then((r) => ({ who: "A", r }))
        : withUser(userB, (db) => db.select().from(speakingAttempts)).then((r) => ({ who: "B", r })),
    ),
  );
  for (const { who, r } of results) {
    const expected = who === "A" ? userA : userB;
    if (r.length !== 1 || r[0]?.userId !== expected) {
      throw new Error(`FAIL: concurrency leak — ${who} got rows for ${JSON.stringify(r.map((x) => x.userId))}`);
    }
  }
  console.log(`Concurrency check: ${rounds} interleaved requests, no cross-user leakage.`);

  // Cleanup — stay on the same transaction-scoped `db` throughout; mixing
  // in the top-level `rawSql` here would open a second connection that
  // deadlocks against this transaction's still-uncommitted delete.
  await withAdmin(async (db) => {
    await db.delete(speakingAttempts).where(sql`user_id in (${userA}, ${userB})`);
    await db.execute(sql`delete from auth.users where id in (${userA}, ${userB})`);
  });

  console.log("\nALL CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
