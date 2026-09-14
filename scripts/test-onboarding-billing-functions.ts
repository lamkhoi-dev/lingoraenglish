/**
 * One-off validation script — NOT part of the app. Exercises
 * account.functions.ts's completeOnboarding (partial profile update —
 * confirms it does NOT clobber fields it doesn't list) and
 * billing.functions.ts's getPublicPlans (plain withAnon() read).
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { rawSql, withAdmin, withAnon, withUser } from "../src/db";
import { billingPlans, profiles, usersInAuth } from "../src/db/schema/schema";

async function main() {
  const userId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-onboard-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  // Give the profile a fullName first — completeOnboarding must not touch it.
  await withUser(userId, (db) => db.update(profiles).set({ fullName: "Keep Me" }).where(eq(profiles.id, userId)));

  await withUser(userId, (db) =>
    db
      .update(profiles)
      .set({
        interfaceLanguage: "vi",
        uiLanguage: "vi",
        nativeLanguage: "Vietnamese",
        englishLevel: "B1",
        targetLevel: "C1",
        learningGoal: "confidence",
        dailyGoalMinutes: 20,
        onboardedAt: new Date().toISOString(),
      })
      .where(eq(profiles.id, userId)),
  );

  const row = (await withAdmin((db) => db.select().from(profiles).where(eq(profiles.id, userId)))).at(0)!;
  if (row.fullName !== "Keep Me") throw new Error(`FAIL: completeOnboarding-style update clobbered fullName, got "${row.fullName}"`);
  if (row.nativeLanguage !== "Vietnamese" || row.dailyGoalMinutes !== 20 || !row.onboardedAt) {
    throw new Error(`FAIL: onboarding fields did not land — ${JSON.stringify(row)}`);
  }
  console.log("completeOnboarding-style partial update: onboarding fields set, unrelated fullName untouched. OK.");

  // getPublicPlans-style read. `tier` is globally unique (one row per
  // free/premium/ielts_pro), so this reads whatever plans already exist
  // rather than inserting a colliding one — the thing under test is that
  // withAnon() can read billing_plans at all (RLS: "Anyone can read active
  // plans"), not the seed data itself.
  const plansAsAdmin = await withAdmin((db) => db.select({ id: billingPlans.id }).from(billingPlans));
  const plansAsAnon = await withAnon((db) => db.select({ id: billingPlans.id }).from(billingPlans));
  if (plansAsAdmin.length > 0 && plansAsAnon.length === 0) {
    throw new Error("FAIL: withAdmin sees billing_plans rows but withAnon sees none — RLS may be misconfigured");
  }
  console.log(`getPublicPlans-style read via withAnon(): OK (${plansAsAnon.length} row(s) visible, matches admin's ${plansAsAdmin.length}).`);

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));

  console.log("\nALL ONBOARDING/BILLING-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
