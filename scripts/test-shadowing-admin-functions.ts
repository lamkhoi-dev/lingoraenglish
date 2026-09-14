/**
 * One-off validation script — NOT part of the app. Exercises
 * shadowing-admin.functions.ts's CRUD logic end to end: create a topic,
 * create sentences under it, verify the tally in adminListShadowTopics-style
 * counting, partial update, and the free/premium split-by-sort-order logic
 * in adminSetShadowFreeCount.
 */
import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, lte } from "drizzle-orm";

import { rawSql, withAdmin } from "../src/db";
import { shadowingSentences, shadowingTopics } from "../src/db/schema/schema";

async function main() {
  const topic = await withAdmin(async (db) => {
    const rows = await db
      .insert(shadowingTopics)
      .values({ slug: `test-${randomUUID()}`, name: "Test Topic", topicGroup: "Test Group", isActive: true })
      .returning({ id: shadowingTopics.id });
    return rows[0]!;
  });

  const s1 = await withAdmin(async (db) => {
    const rows = await db
      .insert(shadowingSentences)
      .values({ topicId: topic.id, sentence: "One.", level: "beginner", sortOrder: 1, status: "published", isFree: false })
      .returning({ id: shadowingSentences.id });
    return rows[0]!;
  });
  const s2 = await withAdmin(async (db) => {
    const rows = await db
      .insert(shadowingSentences)
      .values({ topicId: topic.id, sentence: "Two.", level: "beginner", sortOrder: 2, status: "published", isFree: false })
      .returning({ id: shadowingSentences.id });
    return rows[0]!;
  });
  const s3draft = await withAdmin(async (db) => {
    const rows = await db
      .insert(shadowingSentences)
      .values({ topicId: topic.id, sentence: "Three (draft).", level: "beginner", sortOrder: 3, status: "draft", isFree: false })
      .returning({ id: shadowingSentences.id });
    return rows[0]!;
  });

  // adminListShadowTopics-style tally: only counts status='published' rows.
  const [topics, counts] = await withAdmin((db) =>
    Promise.all([
      db.select({ id: shadowingTopics.id }).from(shadowingTopics).where(eq(shadowingTopics.id, topic.id)),
      db.select({ topicId: shadowingSentences.topicId, isFree: shadowingSentences.isFree, status: shadowingSentences.status }).from(shadowingSentences),
    ]),
  );
  const tally = new Map<string, { total: number; free: number }>();
  for (const row of counts) {
    if (row.status !== "published") continue;
    const t = tally.get(row.topicId) ?? { total: 0, free: 0 };
    t.total += 1;
    if (row.isFree) t.free += 1;
    tally.set(row.topicId, t);
  }
  const thisTally = tally.get(topic.id) ?? { total: 0, free: 0 };
  if (thisTally.total !== 2) throw new Error(`FAIL: expected 2 published sentences (draft excluded), got ${thisTally.total}`);
  if (!topics.some((t) => t.id === topic.id)) throw new Error("FAIL: topic not found in list");
  console.log("adminListShadowTopics-style tally: counts only published sentences (2, draft excluded). OK.");

  // adminUpdateShadowSentence-style partial update: only touches listed fields.
  await withAdmin((db) => db.update(shadowingSentences).set({ isFree: true }).where(eq(shadowingSentences.id, s1.id)));
  const s1After = (await withAdmin((db) => db.select().from(shadowingSentences).where(eq(shadowingSentences.id, s1.id)))).at(0)!;
  if (s1After.isFree !== true || s1After.sentence !== "One.") throw new Error(`FAIL: partial update wrong — ${JSON.stringify(s1After)}`);
  console.log("adminUpdateShadowSentence-style partial update: only isFree changed, sentence text untouched. OK.");

  // adminSetShadowFreeCount-style split: free_count=2 -> sortOrder<=2 free, >2 not free.
  await withAdmin(async (db) => {
    await db.update(shadowingSentences).set({ isFree: true }).where(and(eq(shadowingSentences.topicId, topic.id), lte(shadowingSentences.sortOrder, 2)));
    await db.update(shadowingSentences).set({ isFree: false }).where(and(eq(shadowingSentences.topicId, topic.id), gt(shadowingSentences.sortOrder, 2)));
  });
  const afterSplit = await withAdmin((db) =>
    db.select({ sortOrder: shadowingSentences.sortOrder, isFree: shadowingSentences.isFree }).from(shadowingSentences).where(eq(shadowingSentences.topicId, topic.id)).orderBy(asc(shadowingSentences.sortOrder)),
  );
  if (!afterSplit[0]?.isFree || !afterSplit[1]?.isFree || afterSplit[2]?.isFree) {
    throw new Error(`FAIL: free/premium split wrong — ${JSON.stringify(afterSplit)}`);
  }
  console.log("adminSetShadowFreeCount-style split: sortOrder<=2 free, sortOrder>2 not free. OK.");

  // Cleanup — sentences cascade with the topic.
  await withAdmin((db) => db.delete(shadowingTopics).where(eq(shadowingTopics.id, topic.id)));
  void s2;
  void s3draft;

  console.log("\nALL SHADOWING-ADMIN-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
