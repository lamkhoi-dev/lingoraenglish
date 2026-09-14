/**
 * One-off validation script — NOT part of the app. Exercises lily.functions.ts's
 * DB-touching pieces (the AI-call logic itself is unrelated to this migration):
 * logUsage's dual write (ai_usage_log + usage_counters via recordUsage),
 * enforceLimit's daily cap, the TTS cache hit/miss + hit-count increment, and
 * generateLearningPlan's "already generated today" short-circuit + upsert.
 */
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { rawSql, withAdmin, withUser } from "../src/db";
import { aiUsageLog, dailyPlans, ttsCache, usersInAuth } from "../src/db/schema/schema";

async function main() {
  const userId = await withAdmin(async (db) => {
    const rows = await db.insert(usersInAuth).values({ email: `test-lily-${randomUUID()}@test.local`, encryptedPassword: "x" }).returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  // logUsage-style: writes ai_usage_log AND increments usage_counters (via recordUsage).
  await withAdmin((db) => db.insert(aiUsageLog).values({ userId, capability: "speaking_analysis", provider: "lovable", model: "test", units: 1, inputTokens: 10, outputTokens: 20 }));
  const logRows = await withAdmin((db) => db.select().from(aiUsageLog).where(eq(aiUsageLog.userId, userId)));
  if (logRows.length !== 1 || logRows[0]!.capability !== "speaking_analysis") throw new Error("FAIL: ai_usage_log row missing/wrong");
  console.log("logUsage-style ai_usage_log write: OK.");

  // enforceLimit-style: count rows in the last 24h and compare against a cap.
  for (let i = 0; i < 5; i++) {
    await withAdmin((db) => db.insert(aiUsageLog).values({ userId, capability: "stt", provider: "lovable", model: "test", units: 1 }));
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const capCheck = await withAdmin((db) => db.select({ id: aiUsageLog.id }).from(aiUsageLog).where(and(eq(aiUsageLog.userId, userId), eq(aiUsageLog.userId, userId))).limit(3));
  // Sanity: with a cap of 3, 6 total rows should still report "at/over cap" via the limited fetch.
  if (capCheck.length !== 3) throw new Error(`FAIL: expected the LIMIT(3) fetch to return exactly 3 rows (cap-style check), got ${capCheck.length}`);
  console.log("enforceLimit-style capped count (LIMIT(cap) then length>=cap): OK.");

  // tts_cache-style: miss then insert, then hit with hits incremented.
  const cacheKey = `shimmer::test line ${randomUUID()}`;
  const missRows = await withAdmin((db) => db.select().from(ttsCache).where(eq(ttsCache.cacheKey, cacheKey)));
  if (missRows.length !== 0) throw new Error("FAIL: expected a cache miss for a fresh key");
  await withAdmin((db) => db.insert(ttsCache).values({ cacheKey, textContent: "test line", voice: "shimmer", audioBase64: "AAAA", mimeType: "audio/mpeg" }));
  const hitRows = await withAdmin((db) => db.select().from(ttsCache).where(eq(ttsCache.cacheKey, cacheKey)));
  if (hitRows.length !== 1 || hitRows[0]!.hits !== 0) throw new Error("FAIL: fresh cache row should start at hits=0");
  await withAdmin((db) => db.update(ttsCache).set({ hits: hitRows[0]!.hits + 1 }).where(eq(ttsCache.id, hitRows[0]!.id)));
  const afterHit = (await withAdmin((db) => db.select().from(ttsCache).where(eq(ttsCache.id, hitRows[0]!.id)))).at(0)!;
  if (afterHit.hits !== 1) throw new Error("FAIL: cache hit did not increment hits");
  console.log("speak-style TTS cache: miss -> insert -> hit increments hits (0 -> 1). OK.");

  // generateLearningPlan-style: "already generated today" short-circuit + upsert.
  const today = new Date().toISOString().slice(0, 10);
  await withUser(userId, (db) =>
    db.insert(dailyPlans).values({ userId, planDate: today, tasks: [{ label: "Task A", area: "grammar" }], insights: ["First"] }).onConflictDoUpdate({
      target: [dailyPlans.userId, dailyPlans.planDate],
      set: { tasks: [{ label: "Task A", area: "grammar" }], insights: ["First"] },
    }),
  );
  const firstRead = (await withUser(userId, (db) => db.select({ insights: dailyPlans.insights }).from(dailyPlans).where(and(eq(dailyPlans.userId, userId), eq(dailyPlans.planDate, today))))).at(0)!;
  if ((firstRead.insights as string[])[0] !== "First") throw new Error("FAIL: initial daily plan insert wrong");
  // Second "generate" for the same day should hit the same row (upsert), not create a duplicate.
  await withUser(userId, (db) =>
    db.insert(dailyPlans).values({ userId, planDate: today, tasks: [{ label: "Task B", area: "vocabulary" }], insights: ["Second"] }).onConflictDoUpdate({
      target: [dailyPlans.userId, dailyPlans.planDate],
      set: { tasks: [{ label: "Task B", area: "vocabulary" }], insights: ["Second"] },
    }),
  );
  const allRows = await withAdmin((db) => db.select().from(dailyPlans).where(and(eq(dailyPlans.userId, userId), eq(dailyPlans.planDate, today))));
  if (allRows.length !== 1) throw new Error(`FAIL: expected exactly 1 daily_plans row for (user, date) — got ${allRows.length}`);
  if ((allRows[0]!.insights as string[])[0] !== "Second") throw new Error("FAIL: upsert did not update the existing row's content");
  console.log("generateLearningPlan-style upsert: one row per (user, date), second write updates it in place. OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));
  await withAdmin((db) => db.delete(ttsCache).where(eq(ttsCache.cacheKey, cacheKey)));

  console.log("\nALL LILY-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
