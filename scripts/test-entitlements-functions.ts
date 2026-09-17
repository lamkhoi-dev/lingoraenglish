/**
 * One-off validation script — NOT part of the app. Exercises the converted
 * entitlements.server.ts. The specific risk here: effective_tier() is
 * revoked from anon/authenticated in the original migration and granted to
 * service_role ONLY — if this ever got called through withUser()/withAnon()
 * instead of withAdmin(), it would fail outright (a loud failure, not a
 * silent security gap, but still worth confirming explicitly since it's a
 * different grant pattern than every *_catalogue() function called so far
 * in this migration, which all allow anon/authenticated).
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import {
  assertAdmin,
  currentPeriodStart,
  getEntitlement,
  logAdminAction,
  logBillingEvent,
  reserveUsage,
  resolveTier,
} from "../src/lib/entitlements.server";
import { rawSql, withAdmin } from "../src/db";
import { adminAuditLog, billingEvents, usageCounters, userRoles, usersInAuth } from "../src/db/schema/schema";

async function main() {
  const userId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-entitle-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  // resolveTier via effective_tier() (service_role-only RPC) for a brand-new
  // user with no subscription/complimentary access — must resolve to "free"
  // without throwing a permission error.
  const tier = await resolveTier(userId, "sandbox");
  if (tier !== "free") throw new Error(`FAIL: expected "free" for a fresh user, got "${tier}"`);
  console.log("resolveTier() via effective_tier() (service_role-only RPC): resolves to 'free' for a fresh user, no permission error. OK.");

  const entitlement = await getEntitlement(userId, "sandbox");
  if (entitlement.tier !== "free" || entitlement.complimentary !== false) {
    throw new Error(`FAIL: unexpected entitlement shape: ${JSON.stringify(entitlement)}`);
  }
  console.log("getEntitlement(): free-tier defaults, no complimentary access. OK.");

  // reserveUsage: first claim inserts, second accumulates on the same row, and
  // the returned refund hands a claim back.
  await reserveUsage(userId, "conversation", 1);
  const refund = await reserveUsage(userId, "conversation", 2);
  const period = currentPeriodStart();
  const readUnits = async () => {
    const rows = await withAdmin((db) => db.select().from(usageCounters).where(eq(usageCounters.userId, userId)));
    return rows.find((r) => r.periodStart === period && r.capability === "conversations")?.units;
  };
  if ((await readUnits()) !== 3) throw new Error("FAIL: expected units=3 after claiming 1 + 2");
  await refund();
  if ((await readUnits()) !== 1) throw new Error("FAIL: expected units=1 after refunding the 2-unit claim");
  console.log("reserveUsage(): claims accumulate on one row per (user, capability, period), refund hands a claim back. OK.");

  // logBillingEvent / logAdminAction — plain inserts, confirm they land.
  await logBillingEvent("test_event", { userId, planKey: "premium" });
  const billingRows = await withAdmin((db) => db.select().from(billingEvents).where(eq(billingEvents.userId, userId)));
  if (!billingRows.some((r) => r.event === "test_event")) throw new Error("FAIL: logBillingEvent row not found");
  console.log("logBillingEvent(): row lands. OK.");

  await logAdminAction(userId, "test_action", null, { note: "test" });
  const auditRows = await withAdmin((db) => db.select().from(adminAuditLog).where(eq(adminAuditLog.actorId, userId)));
  if (!auditRows.some((r) => r.action === "test_action")) throw new Error("FAIL: logAdminAction row not found");
  console.log("logAdminAction(): row lands. OK.");

  // assertAdmin — new single-argument signature.
  let threw = false;
  try {
    await assertAdmin(userId);
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("FAIL: assertAdmin should have thrown for a non-admin user");
  await withAdmin((db) => db.insert(userRoles).values({ userId, role: "admin" }));
  await assertAdmin(userId); // should not throw now
  console.log("assertAdmin(userId): rejects non-admin, accepts admin. OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));

  console.log("\nALL ENTITLEMENTS-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
