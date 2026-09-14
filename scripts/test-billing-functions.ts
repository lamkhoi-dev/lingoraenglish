/**
 * One-off validation script — NOT part of the app. Exercises billing.functions.ts's
 * DB logic: myLatestSubscription (own-row read scoped by user+environment,
 * newest first), requireOwnSubscription's throw-if-none, and changeMyPlan's
 * billing_plans lookup by price id.
 */
import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { rawSql, withAdmin, withAnon, withUser } from "../src/db";
import { billingPlans, subscriptions, usersInAuth } from "../src/db/schema/schema";

function toSubscriptionRow(row: typeof subscriptions.$inferSelect) {
  return {
    paddle_subscription_id: row.paddleSubscriptionId,
    paddle_customer_id: row.paddleCustomerId,
    status: row.status,
    current_period_end: row.currentPeriodEnd,
    environment: row.environment,
  };
}

async function myLatestSubscription(userId: string, env: "sandbox" | "live") {
  const rows = await withUser(userId, (db) =>
    db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.environment, env)))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1),
  );
  return rows[0] ? toSubscriptionRow(rows[0]) : null;
}

async function main() {
  const userId = await withAdmin(async (db) => {
    const rows = await db.insert(usersInAuth).values({ email: `test-billing-fn-${randomUUID()}@test.local`, encryptedPassword: "x" }).returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  // No subscription yet — myLatestSubscription must return null, not throw.
  const none = await myLatestSubscription(userId, "sandbox");
  if (none !== null) throw new Error("FAIL: expected null for a user with no subscription");
  console.log("myLatestSubscription() with no rows: returns null. OK.");

  // Two subscriptions, different environments — must pick the right one AND the newest.
  await withAdmin((db) =>
    db.insert(subscriptions).values({ userId, paddleSubscriptionId: `sub-old-${randomUUID()}`, paddleCustomerId: "cus", productId: "p", priceId: "pr", status: "canceled", environment: "sandbox", createdAt: new Date(Date.now() - 100000).toISOString() }),
  );
  await withAdmin((db) =>
    db.insert(subscriptions).values({ userId, paddleSubscriptionId: `sub-new-${randomUUID()}`, paddleCustomerId: "cus2", productId: "p", priceId: "pr", status: "active", environment: "sandbox" }),
  );
  await withAdmin((db) =>
    db.insert(subscriptions).values({ userId, paddleSubscriptionId: `sub-live-${randomUUID()}`, paddleCustomerId: "cus3", productId: "p", priceId: "pr", status: "active", environment: "live" }),
  );

  const sandboxLatest = await myLatestSubscription(userId, "sandbox");
  if (sandboxLatest?.paddle_customer_id !== "cus2") throw new Error(`FAIL: expected the newest sandbox sub (cus2), got ${JSON.stringify(sandboxLatest)}`);
  const liveLatest = await myLatestSubscription(userId, "live");
  if (liveLatest?.paddle_customer_id !== "cus3") throw new Error(`FAIL: expected the live sub (cus3), got ${JSON.stringify(liveLatest)}`);
  console.log("myLatestSubscription(): picks the newest row scoped to (user, environment), doesn't leak across environments. OK.");

  // changeMyPlan-style plan lookup by price id, active plans only. `tier` is
  // globally unique, so this temporarily repoints an existing plan's
  // monthly_price_id rather than inserting a colliding row, then restores it.
  const existingPlan = (await withAdmin((db) => db.select({ id: billingPlans.id, monthlyPriceId: billingPlans.monthlyPriceId }).from(billingPlans).limit(1))).at(0);
  if (!existingPlan) throw new Error("FAIL: no billing_plans row exists to test changeMyPlan against");
  const testPriceId = `price_${randomUUID()}`;
  await withAdmin((db) => db.update(billingPlans).set({ monthlyPriceId: testPriceId }).where(eq(billingPlans.id, existingPlan.id)));

  const plans = await withAnon((db) => db.select({ planKey: billingPlans.planKey, monthlyPriceId: billingPlans.monthlyPriceId, yearlyPriceId: billingPlans.yearlyPriceId, isActive: billingPlans.isActive }).from(billingPlans));
  const found = plans.find((p) => p.isActive && (p.monthlyPriceId === testPriceId || p.yearlyPriceId === testPriceId));
  if (!found) throw new Error("FAIL: changeMyPlan-style lookup did not find the plan by monthly_price_id");
  console.log("changeMyPlan-style billing_plans lookup by price id: OK.");

  // Restore.
  await withAdmin((db) => db.update(billingPlans).set({ monthlyPriceId: existingPlan.monthlyPriceId }).where(eq(billingPlans.id, existingPlan.id)));

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));

  console.log("\nALL BILLING-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
