/**
 * One-off validation script — NOT part of the app. Exercises the two things
 * added to src/lib/auth.functions.ts in this pass, bypassing the
 * cookie/request-context layer the same way test-auth-core.ts does:
 *   1. signUp's new profile-field write (firstName/lastName/country/
 *      ageRange/terms/privacy) lands correctly on the profiles row the
 *      handle_new_user() trigger creates.
 *   2. getCurrentUser's new profile+isAdmin bundling, read back through
 *      withUser() so the "own profile read" / "own roles read" RLS
 *      policies are actually exercised, not bypassed.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { rawSql, withAdmin, withUser } from "../src/db";
import { profiles, userRoles, usersInAuth } from "../src/db/schema/schema";

async function main() {
  const email = `test-signup-${randomUUID()}@test.local`;

  // Mirrors signUp()'s handler body exactly (minus password hashing/session
  // creation, which test-auth-core.ts already covers).
  const userId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email, encryptedPassword: "irrelevant-for-this-test" })
      .returning({ id: usersInAuth.id });
    const row = rows[0]!;

    await db
      .update(profiles)
      .set({
        firstName: "Ada",
        lastName: "Lovelace",
        country: "United Kingdom",
        ageRange: "25_34",
        interfaceLanguage: "vi",
        termsAcceptedAt: new Date().toISOString(),
        privacyAcceptedAt: new Date().toISOString(),
      })
      .where(eq(profiles.id, row.id));

    return row.id;
  });
  console.log("signUp-style insert + profile update: OK (no throw).");

  // handle_new_user() trigger ran synchronously — profile row must already exist.
  const directRead = await withAdmin((db) =>
    db.select().from(profiles).where(eq(profiles.id, userId)).limit(1),
  );
  const row = directRead[0];
  if (!row) throw new Error("FAIL: handle_new_user() trigger did not create a profiles row");
  if (row.firstName !== "Ada" || row.lastName !== "Lovelace")
    throw new Error(`FAIL: profile fields not written — got ${JSON.stringify(row)}`);
  if (row.country !== "United Kingdom" || row.ageRange !== "25_34")
    throw new Error(`FAIL: country/ageRange not written — got ${JSON.stringify(row)}`);
  if (!row.termsAcceptedAt || !row.privacyAcceptedAt)
    throw new Error("FAIL: termsAcceptedAt/privacyAcceptedAt not written");
  console.log("Profile fields from signUp landed correctly: OK.");

  // getCurrentUser()'s profile+role read, done through withUser() exactly
  // like the real handler — proves "own profile read" / "own roles read"
  // RLS still resolves correctly for this row via app.current_user_id().
  const { profile, isAdmin } = await withUser(userId, async (db) => {
    const profileRows = await db
      .select({
        id: profiles.id,
        fullName: profiles.fullName,
        englishLevel: profiles.englishLevel,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    const roleRows = await db.select({ role: userRoles.role }).from(userRoles);
    return { profile: profileRows[0] ?? null, isAdmin: roleRows.some((r) => r.role === "admin") };
  });
  if (!profile) throw new Error("FAIL: withUser could not read own profile (RLS regression?)");
  if (isAdmin) throw new Error("FAIL: fresh signup should not be admin");
  console.log("getCurrentUser-style scoped read via withUser: OK (profile found, isAdmin=false).");

  // Now grant admin and confirm the same read flips to isAdmin=true — proves
  // "own roles read" policy (using: user_id = auth.uid() or has_role(...,'admin'))
  // is being evaluated per-row, not cached/stale.
  await withAdmin((db) => db.insert(userRoles).values({ userId, role: "admin" }));
  const afterGrant = await withUser(userId, (db) =>
    db.select({ role: userRoles.role }).from(userRoles),
  );
  if (!afterGrant.some((r) => r.role === "admin"))
    throw new Error("FAIL: own roles read did not see freshly granted admin role");
  console.log("Role grant visible through withUser immediately: OK.");

  // Cross-user isolation: a second, unrelated user must NOT see the first
  // user's profile through withUser (own-row RLS still applies).
  const otherUserId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-other-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });
  const crossRead = await withUser(otherUserId, (db) =>
    db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, userId)),
  );
  if (crossRead.length !== 0) throw new Error("FAIL: user B could read user A's profile — RLS leak");
  console.log("Cross-user isolation still holds: OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, otherUserId)));

  console.log("\nALL SIGNUP-PROFILE CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
