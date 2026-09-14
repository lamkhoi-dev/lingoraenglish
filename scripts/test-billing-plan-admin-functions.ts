/**
 * One-off validation script — NOT part of the app. Exercises:
 *   1. billing-sync.server.ts's upsert-on-conflict logic (subscriptions,
 *      unique on paddle_subscription_id) — insert then update via the same
 *      conflict target.
 *   2. plan-admin.functions.ts's adminUpdatePlan-style write (billing_plans.limits,
 *      a jsonb column round-tripping as a plain object, not a string).
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { rawSql, withAdmin } from "../src/db";
import { billingPlans, subscriptions, usersInAuth } from "../src/db/schema/schema";

async function main() {
  const userId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-billing-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  // syncSubscriptionFromProvider-style upsert.
  const paddleSubId = `sub_${randomUUID()}`;
  const row = {
    userId,
    paddleSubscriptionId: paddleSubId,
    paddleCustomerId: "cus_test",
    productId: "pro_test",
    priceId: "pri_test",
    status: "active",
    billingInterval: "month",
    currency: "USD",
    amount: 999,
    environment: "sandbox" as const,
    updatedAt: new Date().toISOString(),
  };
  await withAdmin((db) =>
    db.insert(subscriptions).values(row).onConflictDoUpdate({ target: subscriptions.paddleSubscriptionId, set: row }),
  );
  let subRows = await withAdmin((db) => db.select().from(subscriptions).where(eq(subscriptions.paddleSubscriptionId, paddleSubId)));
  if (subRows.length !== 1 || subRows[0]!.status !== "active") throw new Error(`FAIL: first upsert wrong — ${JSON.stringify(subRows)}`);
  console.log("syncSubscriptionFromProvider-style insert: OK.");

  const updatedRow = { ...row, status: "canceled", updatedAt: new Date().toISOString() };
  await withAdmin((db) =>
    db.insert(subscriptions).values(updatedRow).onConflictDoUpdate({ target: subscriptions.paddleSubscriptionId, set: updatedRow }),
  );
  subRows = await withAdmin((db) => db.select().from(subscriptions).where(eq(subscriptions.paddleSubscriptionId, paddleSubId)));
  if (subRows.length !== 1 || subRows[0]!.status !== "canceled") {
    throw new Error(`FAIL: second upsert should update the same row to status=canceled, got ${JSON.stringify(subRows)}`);
  }
  console.log("syncSubscriptionFromProvider-style upsert on conflict: updates the SAME row (still 1 row), status changes. OK.");

  // adminUpdatePlan-style write — limits is jsonb, must round-trip as an
  // object. `tier` is globally unique, so this updates whichever plan
  // already exists (seed data) rather than inserting a colliding one — the
  // thing under test is the write/round-trip, not the seed data itself.
  const existingPlan = (await withAdmin((db) => db.select({ id: billingPlans.id, planKey: billingPlans.planKey }).from(billingPlans).limit(1))).at(0);
  if (!existingPlan) throw new Error("FAIL: no billing_plans row exists to test adminUpdatePlan against");
  const before = (await withAdmin((db) => db.select().from(billingPlans).where(eq(billingPlans.id, existingPlan.id)))).at(0)!;

  await withAdmin((db) =>
    db
      .update(billingPlans)
      .set({ limits: { speaking_minutes: 50, conversations: 20 } })
      .where(eq(billingPlans.planKey, existingPlan.planKey)),
  );
  const planRow = (await withAdmin((db) => db.select().from(billingPlans).where(eq(billingPlans.id, existingPlan.id)))).at(0)!;
  const limits = planRow.limits as Record<string, number>;
  if (typeof limits !== "object" || limits.speaking_minutes !== 50 || limits.conversations !== 20) {
    throw new Error(`FAIL: limits did not round-trip as an object, got ${JSON.stringify(planRow.limits)}`);
  }
  console.log("adminUpdatePlan-style write: limits (jsonb) round-trips as a plain object. OK.");

  // Restore the seed row's original limits so this test is non-destructive.
  await withAdmin((db) => db.update(billingPlans).set({ limits: before.limits }).where(eq(billingPlans.id, existingPlan.id)));

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));

  console.log("\nALL BILLING-SYNC/PLAN-ADMIN CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
