/**
 * Frequency limits for the authentication endpoints (mục 3.1, "giới hạn tần
 * suất gọi để chống lạm dụng"). The AI endpoints have their own cap in
 * lily.functions.ts; this covers sign-in guessing and the two endpoints that
 * send email, which could otherwise be fired in a loop at someone's inbox.
 *
 * Counting happens inside Postgres (auth_rate_take, migration 0009) in a single
 * atomic statement, so requests arriving together cannot each read a stale
 * count and all slip through.
 */
import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";
import { createServerOnlyFn } from "@tanstack/react-start";

import { withAdmin } from "@/db";

/** Same generic wording for every limit — never reveals whether an account exists. */
export const RATE_LIMITED_MESSAGE = "Too many attempts. Please wait a few minutes and try again.";

/**
 * Emails are hashed, not stored: a bucket key is derived from whatever the
 * caller typed, which includes addresses that were never registered.
 */
function bucketKey(kind: string, value: string): string {
  const digest = createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
  return `${kind}:${digest}`;
}

/**
 * Fails OPEN, not closed: this check protects sign-in from guessing, but it
 * must never become a second way to take sign-in down. The 2026-09-17
 * incident was exactly this — a grant bug in auth_rate_take() made every
 * call throw, and the raw Postgres error propagated uncaught all the way to
 * the login button, blocking every real login and leaking internals (bucket
 * hash, limit, window) onto the screen. Any infrastructure failure here is
 * logged and treated as "allowed" — the password check right after this
 * still fully applies, so failing open here does not skip authentication,
 * only the extra guess-rate guard.
 */
const take = createServerOnlyFn(
  async (bucket: string, limit: number, windowSeconds: number): Promise<boolean> => {
    try {
      const rows = await withAdmin((db) =>
        db.execute(sql`select auth_rate_take(${bucket}, ${limit}, ${windowSeconds}) as allowed`),
      );
      return (rows as unknown as { allowed: boolean }[])[0]?.allowed !== false;
    } catch (error) {
      console.error("Rate limit check failed — allowing the attempt through", error);
      return true;
    }
  },
);

/**
 * Consumes one attempt against every given bucket and throws when any is over
 * its limit. An empty identifier (no IP resolved, for instance) is skipped
 * rather than lumping unrelated callers into one shared bucket.
 */
export const enforceRateLimit = createServerOnlyFn(
  async (
    limits: { kind: string; value: string; limit: number; windowSeconds: number }[],
  ): Promise<void> => {
    for (const entry of limits) {
      if (!entry.value) continue;
      const allowed = await take(
        bucketKey(entry.kind, entry.value),
        entry.limit,
        entry.windowSeconds,
      );
      if (!allowed) throw new Error(RATE_LIMITED_MESSAGE);
    }
  },
);

/** Clears a bucket after a legitimate success, so normal use never accumulates. */
export const clearRateLimit = createServerOnlyFn(
  async (kind: string, value: string): Promise<void> => {
    if (!value) return;
    await withAdmin((db) =>
      db.execute(sql`delete from auth_rate_limits where bucket = ${bucketKey(kind, value)}`),
    );
  },
);
