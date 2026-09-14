import { createHash, randomBytes } from "node:crypto";

import { createServerOnlyFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

import { withAdmin } from "@/db";
import { sessionsInAuth } from "@/db/schema/schema";

const SESSION_TTL_DAYS = 30;
const BCRYPT_ROUNDS = 12;

// Every export here is wrapped in createServerOnlyFn — not optional bookkeeping:
// `require-auth.ts` imports this file, and the compiler keeps that import in the
// CLIENT stub of every `*.functions.ts` that passes `requireAuth` to
// `.middleware([...])`. Anything left unwrapped keeps its real body in the browser
// bundle and drags `node:crypto` / the Postgres driver along with it, which then
// throws at runtime in the browser (`node:crypto externalized`, `Buffer is not
// defined`). Wrapped bodies become throw-stubs and their imports get stripped.
export const hashPassword = createServerOnlyFn(
  async (password: string): Promise<string> => bcrypt.hash(password, BCRYPT_ROUNDS),
);

export const verifyPassword = createServerOnlyFn(
  async (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash),
);

/** For one-time tokens (email verify, password reset) — high-entropy already, no need for bcrypt's slow hash. */
export const generateToken = createServerOnlyFn((): string => randomBytes(32).toString("hex"));

export const hashToken = createServerOnlyFn((token: string): string =>
  createHash("sha256").update(token).digest("hex"),
);

export const createSession = createServerOnlyFn(
  async (
    userId: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<{ id: string; expiresAt: string }> => {
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const rows = await withAdmin((db) =>
      db
        .insert(sessionsInAuth)
        .values({
          userId,
          expiresAt,
          userAgent: meta.userAgent ?? "",
          ip: meta.ip ?? "",
        })
        .returning({ id: sessionsInAuth.id, expiresAt: sessionsInAuth.expiresAt }),
    );
    const row = rows[0];
    if (!row) throw new Error("Failed to create session");
    return row;
  },
);

export const verifySession = createServerOnlyFn(
  async (sessionId: string): Promise<{ userId: string } | null> => {
    const rows = await withAdmin((db) =>
      db
        .select({ userId: sessionsInAuth.userId, expiresAt: sessionsInAuth.expiresAt })
        .from(sessionsInAuth)
        .where(eq(sessionsInAuth.id, sessionId))
        .limit(1),
    );
    const row = rows[0];
    if (!row) return null;
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      await destroySession(sessionId);
      return null;
    }
    return { userId: row.userId };
  },
);

export const destroySession = createServerOnlyFn(async (sessionId: string): Promise<void> => {
  await withAdmin((db) => db.delete(sessionsInAuth).where(eq(sessionsInAuth.id, sessionId)));
});

/** Used on password change / account lock — matches "thu hồi session ngay" design goal. */
export const destroyAllUserSessions = createServerOnlyFn(async (userId: string): Promise<void> => {
  await withAdmin((db) => db.delete(sessionsInAuth).where(eq(sessionsInAuth.userId, userId)));
});
