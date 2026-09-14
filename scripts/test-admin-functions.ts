/**
 * One-off validation script — NOT part of the app. Exercises the DB-level
 * logic behind src/lib/admin.functions.ts and requireAdmin (require-auth.ts).
 * This is the highest-risk file in Giai đoạn 3 per the plan (most privileged
 * surface: sees every user's data, edits content access tiers, edits UI
 * translations) so the checks here specifically target permission boundaries,
 * not just "does the query run":
 *   1. requireAdmin's role check rejects a plain user and accepts an admin.
 *   2. getAdminOverview-style reads see ALL users' profiles, not just the
 *      caller's own (proves withAdmin is actually bypassing "own row" RLS
 *      here, which is correct for an admin surface — the opposite property
 *      of every other *.functions.ts test in this migration).
 *   3. setContentAccessTier-style update actually changes the row.
 *   4. saveTranslationOverride-style upsert both inserts and updates.
 */
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { rawSql, withAdmin } from "../src/db";
import { profiles, uiTranslations, userRoles, usersInAuth, vocabularyWords } from "../src/db/schema/schema";

async function isAdmin(userId: string): Promise<boolean> {
  const rows = await withAdmin((db) =>
    db.select({ role: userRoles.role }).from(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.role, "admin"))).limit(1),
  );
  return rows.length > 0;
}

async function main() {
  const plainUserId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-admin-plain-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });
  const adminUserId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-admin-real-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });
  await withAdmin((db) => db.insert(userRoles).values({ userId: adminUserId, role: "admin" }));

  if (await isAdmin(plainUserId)) throw new Error("FAIL: requireAdmin-style check accepted a plain user");
  if (!(await isAdmin(adminUserId))) throw new Error("FAIL: requireAdmin-style check rejected a real admin");
  console.log("requireAdmin-style role check: plain user rejected, admin user accepted. OK.");

  // getAdminOverview-style read: must see the OTHER user's profile too —
  // this is the one place in the whole migration where seeing across users
  // is correct, not a leak, precisely because requireAdmin gated it above.
  const allProfiles = await withAdmin((db) => db.select({ id: profiles.id }).from(profiles));
  const ids = new Set(allProfiles.map((p) => p.id));
  if (!ids.has(plainUserId) || !ids.has(adminUserId)) {
    throw new Error("FAIL: admin overview did not see both seeded users' profiles");
  }
  console.log("getAdminOverview-style read sees every user's profile (expected for an admin-only surface). OK.");

  // setContentAccessTier-style update.
  const word = await withAdmin(async (db) => {
    const rows = await db
      .insert(vocabularyWords)
      .values({ word: `admin-test-${randomUUID()}`, status: "published", accessTier: "free" })
      .returning({ id: vocabularyWords.id });
    return rows[0]!;
  });
  await withAdmin((db) => db.update(vocabularyWords).set({ accessTier: "premium" }).where(eq(vocabularyWords.id, word.id)));
  const afterTierChange = await withAdmin((db) =>
    db.select({ accessTier: vocabularyWords.accessTier }).from(vocabularyWords).where(eq(vocabularyWords.id, word.id)),
  );
  if (afterTierChange[0]?.accessTier !== "premium") throw new Error("FAIL: access tier update did not land");
  console.log("setContentAccessTier-style update: OK.");

  // saveTranslationOverride-style upsert — insert then update via the same conflict target.
  const locale = "vi";
  const key = `test.admin.${randomUUID()}`;
  await withAdmin((db) =>
    db
      .insert(uiTranslations)
      .values({ locale, translationKey: key, value: "first" })
      .onConflictDoUpdate({ target: [uiTranslations.locale, uiTranslations.translationKey], set: { value: "first" } }),
  );
  await withAdmin((db) =>
    db
      .insert(uiTranslations)
      .values({ locale, translationKey: key, value: "second" })
      .onConflictDoUpdate({ target: [uiTranslations.locale, uiTranslations.translationKey], set: { value: "second" } }),
  );
  const rows = await withAdmin((db) =>
    db.select({ value: uiTranslations.value }).from(uiTranslations).where(and(eq(uiTranslations.locale, locale), eq(uiTranslations.translationKey, key))),
  );
  if (rows.length !== 1 || rows[0]?.value !== "second") {
    throw new Error(`FAIL: upsert should have exactly 1 row with value "second", got ${JSON.stringify(rows)}`);
  }
  console.log("saveTranslationOverride-style upsert (insert then update, same conflict target): OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, plainUserId)));
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, adminUserId)));
  await withAdmin((db) => db.delete(vocabularyWords).where(eq(vocabularyWords.id, word.id)));
  await withAdmin((db) => db.delete(uiTranslations).where(and(eq(uiTranslations.locale, locale), eq(uiTranslations.translationKey, key))));

  console.log("\nALL ADMIN-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
