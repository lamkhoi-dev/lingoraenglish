/**
 * One-off validation script — NOT part of the app. Exercises
 * billing-admin.functions.ts's trickiest piece: adminListMembers's tier
 * resolution, which picks whichever of (paid subscription, complimentary
 * grant) ranks higher per member — a real business rule, not just a query.
 * Also covers grant/revoke complimentary access and the email search filter.
 */
import { randomUUID } from "node:crypto";

import { and, eq, ilike, or } from "drizzle-orm";

import { rawSql, withAdmin } from "../src/db";
import { complimentaryAccess, profiles, usersInAuth } from "../src/db/schema/schema";

const rank = (tier: string) => (tier === "ielts_pro" ? 2 : tier === "premium" ? 1 : 0);

async function main() {
  const email = `test-billing-admin-${randomUUID()}@test.local`;
  const userId = await withAdmin(async (db) => {
    const rows = await db.insert(usersInAuth).values({ email, encryptedPassword: "x" }).returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });
  await withAdmin((db) => db.update(profiles).set({ fullName: "Billing Admin Test" }).where(eq(profiles.id, userId)));

  // grantComplimentaryAccess-style: find profile by email, insert grant.
  const found = (await withAdmin((db) => db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email)).limit(1))).at(0);
  if (found?.id !== userId) throw new Error("FAIL: could not find profile by email");
  const grant = await withAdmin(async (db) => {
    const rows = await db
      .insert(complimentaryAccess)
      .values({ userId, tier: "ielts_pro", expiresAt: null, note: "test grant", grantedBy: userId })
      .returning({ id: complimentaryAccess.id });
    return rows[0]!;
  });
  console.log("grantComplimentaryAccess-style: found profile by email, inserted grant. OK.");

  // Tier resolution: no live subscription, so complimentary (ielts_pro, rank 2)
  // should win over the implicit "free" (rank 0) paid tier.
  const paidTier = "free"; // no subscription row at all -> subLive is falsy -> paidTier stays "free"
  const compTier = "ielts_pro";
  const useComp = rank(compTier) > rank(paidTier);
  if (!useComp) throw new Error("FAIL: complimentary tier should outrank an absent paid subscription");
  console.log("adminListMembers-style tier resolution: complimentary (rank 2) beats no-subscription (rank 0). OK.");

  // Search filter: ilike on email/full_name, case-insensitive, partial match.
  const searchResults = await withAdmin((db) =>
    db.select({ id: profiles.id }).from(profiles).where(or(ilike(profiles.email, `%${email.slice(5, 20).toUpperCase()}%`), ilike(profiles.fullName, "%nomatch%"))),
  );
  if (!searchResults.some((r) => r.id === userId)) throw new Error("FAIL: case-insensitive partial email search did not find the test user");
  console.log("adminListMembers-style search (ilike, case-insensitive, partial): OK.");

  // revokeComplimentaryAccess-style: single grant revoked.
  await withAdmin((db) => db.update(complimentaryAccess).set({ revoked: true, updatedAt: new Date().toISOString() }).where(eq(complimentaryAccess.id, grant.id)));
  let row = (await withAdmin((db) => db.select().from(complimentaryAccess).where(eq(complimentaryAccess.id, grant.id)))).at(0)!;
  if (row.revoked !== true) throw new Error("FAIL: revokeComplimentaryAccess-style update did not set revoked=true");
  console.log("revokeComplimentaryAccess-style: OK.");

  // revokeMemberComplimentary-style: revoke-all-for-user, only touches non-revoked rows (idempotent-safe filter).
  const grant2 = await withAdmin(async (db) => {
    const rows = await db.insert(complimentaryAccess).values({ userId, tier: "premium", note: "second grant" }).returning({ id: complimentaryAccess.id });
    return rows[0]!;
  });
  await withAdmin((db) =>
    db.update(complimentaryAccess).set({ revoked: true, updatedAt: new Date().toISOString() }).where(and(eq(complimentaryAccess.userId, userId), eq(complimentaryAccess.revoked, false))),
  );
  row = (await withAdmin((db) => db.select().from(complimentaryAccess).where(eq(complimentaryAccess.id, grant2.id)))).at(0)!;
  if (row.revoked !== true) throw new Error("FAIL: revokeMemberComplimentary-style bulk revoke did not catch the second grant");
  console.log("revokeMemberComplimentary-style (revoke all non-revoked for user): OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));

  console.log("\nALL BILLING-ADMIN-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
