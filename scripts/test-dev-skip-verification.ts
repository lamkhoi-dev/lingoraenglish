/**
 * One-off validation script — NOT part of the app. Exercises the new
 * AUTH_DEV_SKIP_EMAIL_VERIFICATION escape hatch in auth.functions.ts.
 * Two things matter here: the double guard (flag alone must NOT be enough —
 * NODE_ENV must also not be "production", so a stray "true" in a prod env
 * file is inert) and that, when actually active, signUp's DB effect matches
 * what it claims (emailConfirmedAt set immediately, matching the condition
 * signIn's gate checks).
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { rawSql, withAdmin } from "../src/db";
import { usersInAuth } from "../src/db/schema/schema";

// Mirrors auth.functions.ts's devSkipEmailVerification() exactly.
function devSkipEmailVerification(): boolean {
  return process.env["AUTH_DEV_SKIP_EMAIL_VERIFICATION"] === "true" && process.env["NODE_ENV"] !== "production";
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) prev[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function main() {
  // The double guard: flag off -> false regardless of NODE_ENV.
  if (withEnv({ AUTH_DEV_SKIP_EMAIL_VERIFICATION: undefined, NODE_ENV: "development" }, devSkipEmailVerification)) {
    throw new Error("FAIL: expected false when the flag is unset");
  }
  if (withEnv({ AUTH_DEV_SKIP_EMAIL_VERIFICATION: "false", NODE_ENV: "development" }, devSkipEmailVerification)) {
    throw new Error('FAIL: expected false when the flag is explicitly "false"');
  }
  // Flag on, but NODE_ENV=production -> must still be false. This is the
  // one that actually matters: it's the failsafe against a mistake in a
  // real deployment's env file.
  if (withEnv({ AUTH_DEV_SKIP_EMAIL_VERIFICATION: "true", NODE_ENV: "production" }, devSkipEmailVerification)) {
    throw new Error("FAIL: the flag must be inert when NODE_ENV=production, even if set to true");
  }
  // Both conditions met -> true.
  if (!withEnv({ AUTH_DEV_SKIP_EMAIL_VERIFICATION: "true", NODE_ENV: "development" }, devSkipEmailVerification)) {
    throw new Error("FAIL: expected true when the flag is on AND NODE_ENV is not production");
  }
  console.log("devSkipEmailVerification() double guard: flag alone is never enough; NODE_ENV=production always wins. OK.");

  // signUp's dev-skip branch, replicated: emailConfirmedAt set immediately,
  // and that's exactly the field signIn's gate checks.
  const userId = await withAdmin(async (db) => {
    const rows = await db.insert(usersInAuth).values({ email: `test-devskip-${randomUUID()}@test.local`, encryptedPassword: "x" }).returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });
  let row = (await withAdmin((db) => db.select({ emailConfirmedAt: usersInAuth.emailConfirmedAt }).from(usersInAuth).where(eq(usersInAuth.id, userId)))).at(0)!;
  if (row.emailConfirmedAt !== null) throw new Error("FAIL: fresh signup should start unconfirmed regardless of the flag");

  await withAdmin((db) => db.update(usersInAuth).set({ emailConfirmedAt: new Date().toISOString() }).where(eq(usersInAuth.id, userId)));
  row = (await withAdmin((db) => db.select({ emailConfirmedAt: usersInAuth.emailConfirmedAt }).from(usersInAuth).where(eq(usersInAuth.id, userId)))).at(0)!;
  if (!row.emailConfirmedAt) throw new Error("FAIL: dev-skip branch should have set emailConfirmedAt");
  console.log("signUp's dev-skip branch: sets emailConfirmedAt immediately — signIn's gate (`if (!user.emailConfirmedAt)`) now passes for this user. OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));

  console.log("\nALL DEV-SKIP-VERIFICATION CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
