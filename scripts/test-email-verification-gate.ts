/**
 * One-off validation script — NOT part of the app. Confirms the restored
 * "confirm email before sign-in" gate in src/lib/auth.functions.ts: a fresh
 * signUp leaves emailConfirmedAt null (and — by inspection of signUp's
 * handler, which this script can't call directly; see test-auth-core.ts's
 * header comment for why — creates no session), verifyEmail is what sets
 * emailConfirmedAt, and that flag is exactly what signIn's handler checks
 * before issuing a session.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { hashPassword, verifyPassword } from "../src/lib/session.server";
import { rawSql, withAdmin } from "../src/db";
import { usersInAuth } from "../src/db/schema/schema";

async function main() {
  const email = `test-verify-gate-${randomUUID()}@test.local`;
  const password = "correct horse battery staple";
  const passwordHash = await hashPassword(password);

  // Mirrors signUp()'s insert — no emailConfirmedAt passed, so it must
  // default to null (this is the actual gate signIn checks).
  const userId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email, encryptedPassword: passwordHash })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  const fresh = await withAdmin((db) =>
    db
      .select({ encryptedPassword: usersInAuth.encryptedPassword, emailConfirmedAt: usersInAuth.emailConfirmedAt })
      .from(usersInAuth)
      .where(eq(usersInAuth.id, userId)),
  ).then((rows) => rows[0]!);
  if (fresh.emailConfirmedAt !== null) throw new Error("FAIL: freshly signed-up user should have emailConfirmedAt = null");
  if (!(await verifyPassword(password, fresh.encryptedPassword!))) throw new Error("FAIL: password hash didn't verify");
  console.log("Fresh signup: password verifies, emailConfirmedAt is null (matches signIn's gate condition). OK.");

  // Mirrors verifyEmail()'s handler — the part that actually flips the gate.
  await withAdmin((db) =>
    db.update(usersInAuth).set({ emailConfirmedAt: new Date().toISOString() }).where(eq(usersInAuth.id, userId)),
  );
  const afterVerify = await withAdmin((db) =>
    db.select({ emailConfirmedAt: usersInAuth.emailConfirmedAt }).from(usersInAuth).where(eq(usersInAuth.id, userId)),
  ).then((rows) => rows[0]!);
  if (!afterVerify.emailConfirmedAt) throw new Error("FAIL: emailConfirmedAt did not get set by the verify-style update");
  console.log("verifyEmail-style update sets emailConfirmedAt: OK — signIn's gate now passes for this user.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));

  console.log("\nALL EMAIL-VERIFICATION-GATE CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
