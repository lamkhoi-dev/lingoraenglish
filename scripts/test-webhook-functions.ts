/**
 * One-off validation script — NOT part of the app. Exercises the DB logic
 * behind the Paddle webhook handlers (webhook.ts) — signature verification
 * itself is external Paddle SDK code, untouched by this migration, so this
 * only replicates what each handler does to `subscriptions`/`billing_events`
 * once a verified event is in hand. Specific risk: handleSubscriptionUpdated's
 * PARTIAL update (only touches fields Paddle actually sent — a plain
 * `.set({...always all fields...})` would silently null out priceId/currency
 * on updates that don't carry a price change).
 */
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { rawSql, withAdmin } from "../src/db";
import { billingEvents, subscriptions, usersInAuth } from "../src/db/schema/schema";

async function main() {
  const userId = await withAdmin(async (db) => {
    const rows = await db.insert(usersInAuth).values({ email: `test-webhook-${randomUUID()}@test.local`, encryptedPassword: "x" }).returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  const paddleSubId = `sub_${randomUUID()}`;

  // handleSubscriptionCreated-style: insert.
  const createdRow = {
    userId,
    paddleSubscriptionId: paddleSubId,
    paddleCustomerId: "cus_test",
    productId: "pro_test",
    priceId: "pri_monthly",
    status: "active",
    billingInterval: "month",
    currency: "USD",
    amount: 999,
    environment: "sandbox" as const,
    updatedAt: new Date().toISOString(),
  };
  await withAdmin((db) => db.insert(subscriptions).values(createdRow).onConflictDoUpdate({ target: subscriptions.paddleSubscriptionId, set: createdRow }));
  await withAdmin((db) => db.insert(billingEvents).values({ userId, event: "subscription_created", environment: "sandbox", metadata: { subscriptionId: paddleSubId } }));
  let row = (await withAdmin((db) => db.select().from(subscriptions).where(eq(subscriptions.paddleSubscriptionId, paddleSubId)))).at(0)!;
  if (row.status !== "active" || row.priceId !== "pri_monthly") throw new Error(`FAIL: handleSubscriptionCreated-style insert wrong — ${JSON.stringify(row)}`);
  console.log("handleSubscriptionCreated-style insert + billing_events log: OK.");

  // handleSubscriptionUpdated-style: PARTIAL update — status changes, but this
  // particular Paddle payload carries no price/billing-cycle info, so
  // priceId/billingInterval/currency/amount must stay exactly as they were.
  await withAdmin((db) =>
    db
      .update(subscriptions)
      .set({
        status: "past_due",
        // no priceId/billingInterval/currency/amount spread in — simulates a
        // Paddle payload without a price change, matching handleSubscriptionUpdated's
        // conditional spread logic.
        currentPeriodEnd: "2027-01-01T00:00:00Z",
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(subscriptions.paddleSubscriptionId, paddleSubId), eq(subscriptions.environment, "sandbox"))),
  );
  row = (await withAdmin((db) => db.select().from(subscriptions).where(eq(subscriptions.paddleSubscriptionId, paddleSubId)))).at(0)!;
  if (row.status !== "past_due") throw new Error("FAIL: status did not update");
  if (row.priceId !== "pri_monthly" || row.currency !== "USD" || row.amount !== 999) {
    throw new Error(`FAIL: partial update clobbered fields it shouldn't have touched — ${JSON.stringify(row)}`);
  }
  console.log("handleSubscriptionUpdated-style partial update: status changes, untouched fields (priceId/currency/amount) survive. OK.");

  // handleSubscriptionCanceled-style: status -> canceled, scoped by (paddle_subscription_id, environment).
  await withAdmin((db) =>
    db
      .update(subscriptions)
      .set({ status: "canceled", updatedAt: new Date().toISOString() })
      .where(and(eq(subscriptions.paddleSubscriptionId, paddleSubId), eq(subscriptions.environment, "sandbox"))),
  );
  row = (await withAdmin((db) => db.select().from(subscriptions).where(eq(subscriptions.paddleSubscriptionId, paddleSubId)))).at(0)!;
  if (row.status !== "canceled") throw new Error("FAIL: handleSubscriptionCanceled-style update did not land");
  console.log("handleSubscriptionCanceled-style update: OK.");

  // Environment scoping: an update for the SAME paddle_subscription_id but a
  // different environment must not match (sandbox vs live are separate rows
  // in practice, but this checks the WHERE clause itself is scoped correctly).
  const liveUpdateResult = await withAdmin((db) =>
    db
      .update(subscriptions)
      .set({ status: "should_not_apply" })
      .where(and(eq(subscriptions.paddleSubscriptionId, paddleSubId), eq(subscriptions.environment, "live")))
      .returning({ id: subscriptions.id }),
  );
  if (liveUpdateResult.length !== 0) throw new Error("FAIL: environment-scoped update matched a row in the wrong environment");
  console.log("Environment-scoped WHERE clause: an update for environment='live' does not touch the sandbox row. OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));

  console.log("\nALL WEBHOOK-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
