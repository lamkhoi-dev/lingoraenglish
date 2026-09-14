/**
 * One-off validation script — NOT part of the app. Exercises the
 * security-critical parts of src/lib/auth-server.ts directly (password
 * hashing, session lifecycle, token hashing) without going through the
 * server-function/cookie layer, which needs a real HTTP request context
 * (getCookie/setCookie require TanStack Start's AsyncLocalStorage-backed
 * H3Event) that a standalone script doesn't have. Full end-to-end
 * signUp/signIn/signOut testing happens once these are wired into an
 * actual route (Giai đoạn 3).
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import {
  createSession,
  destroyAllUserSessions,
  destroySession,
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword,
  verifySession,
} from "../src/lib/session.server";
import { rawSql, withAdmin } from "../src/db";
import { sessionsInAuth, usersInAuth } from "../src/db/schema/schema";

async function main() {
  // 1. Password hashing round-trip.
  const plain = "correct horse battery staple";
  const hash = await hashPassword(plain);
  if (hash === plain) throw new Error("FAIL: password was not hashed");
  if (!(await verifyPassword(plain, hash))) throw new Error("FAIL: correct password rejected");
  if (await verifyPassword("wrong password", hash)) throw new Error("FAIL: wrong password accepted");
  console.log("Password hashing: correct password verifies, wrong password rejected. OK.");

  // 2. Token generation + hashing — must be deterministic per token, unguessable, and never store the raw token.
  const token = generateToken();
  const tokenHash1 = hashToken(token);
  const tokenHash2 = hashToken(token);
  if (tokenHash1 !== tokenHash2) throw new Error("FAIL: hashToken not deterministic");
  if (tokenHash1 === token) throw new Error("FAIL: hashToken returned the raw token");
  if (token.length < 32) throw new Error("FAIL: token too short / low entropy");
  console.log(`Token generation: ${token.length}-char token, deterministic hash. OK.`);

  // 3. Session lifecycle — create, verify, expire, destroy.
  const email = `test-${randomUUID()}@test.local`;
  const userId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email, encryptedPassword: hash })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  const session = await createSession(userId, { userAgent: "test-agent", ip: "127.0.0.1" });
  const verified = await verifySession(session.id);
  if (!verified || verified.userId !== userId) throw new Error("FAIL: fresh session did not verify");
  console.log("Session create + verify: OK.");

  const bogus = await verifySession(randomUUID());
  if (bogus !== null) throw new Error("FAIL: random session id verified as valid");
  console.log("Session verify rejects unknown id: OK.");

  await destroySession(session.id);
  const afterDestroy = await verifySession(session.id);
  if (afterDestroy !== null) throw new Error("FAIL: session still valid after destroySession");
  console.log("Session destroy: OK.");

  // 4. Multi-session revocation (password-change scenario).
  const s1 = await createSession(userId, {});
  const s2 = await createSession(userId, {});
  const s3 = await createSession(userId, {});
  if (!(await verifySession(s1.id)) || !(await verifySession(s2.id)) || !(await verifySession(s3.id))) {
    throw new Error("FAIL: sessions not created correctly before revocation");
  }
  await destroyAllUserSessions(userId);
  const remaining = await Promise.all([verifySession(s1.id), verifySession(s2.id), verifySession(s3.id)]);
  if (remaining.some((r) => r !== null)) throw new Error("FAIL: destroyAllUserSessions left a session valid");
  console.log("destroyAllUserSessions revokes every session for the user: OK.");

  // 5. Expired session is rejected (simulate by inserting one already in the past).
  const expiredId = await withAdmin(async (db) => {
    const rows = await db
      .insert(sessionsInAuth)
      .values({ userId, expiresAt: new Date(Date.now() - 1000).toISOString() })
      .returning({ id: sessionsInAuth.id });
    return rows[0]!.id;
  });
  const expiredCheck = await verifySession(expiredId);
  if (expiredCheck !== null) throw new Error("FAIL: expired session verified as valid");
  console.log("Expired session rejected: OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));

  console.log("\nALL AUTH-CORE CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
