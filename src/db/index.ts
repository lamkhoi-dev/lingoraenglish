import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/schema";
import * as relations from "./schema/relations";

/**
 * Security model: every one of the 78 RLS policies ported from Supabase
 * (see db/0000_auth_compat_shim.sql) is written `for ... to authenticated`
 * / `to anon` / `to service_role`, and checks `auth.uid()`. Postgres RLS
 * only sees those roles and that function — it has no idea who our own
 * session/JWT layer thinks the caller is. So each of the three helpers
 * below runs its callback inside a **single dedicated connection**
 * (`sql.begin()` — postgres.js hands the callback one physical connection
 * for the whole transaction, not a pooled one that could be reused by
 * another concurrent request in between) and sets the Postgres role +
 * `app.user_id` session var *inside that same transaction* before handing
 * back a scoped Drizzle instance. That combination is what makes RLS
 * actually apply per-request instead of leaking across requests sharing
 * the pool.
 *
 * NEVER query through `rawSql`/`rawDb` directly from route code — always
 * go through one of these three so RLS is guaranteed to be active.
 */

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is not set");

export const rawSql = postgres(connectionString, { max: 10 });
export const rawDb = drizzle(rawSql, { schema: { ...schema, ...relations } });

type ScopedDb = Parameters<Parameters<typeof rawDb.transaction>[0]>[0];

/** Runs `fn` as the given authenticated user — every "own rows" RLS policy applies. */
export async function withUser<T>(userId: string, fn: (db: ScopedDb) => Promise<T>): Promise<T> {
  return rawDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/** Runs `fn` as an unauthenticated visitor — only "public read" RLS policies apply. */
export async function withAnon<T>(fn: (db: ScopedDb) => Promise<T>): Promise<T> {
  return rawDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'anon', true)`);
    return fn(tx);
  });
}

/**
 * Runs `fn` as service_role — bypasses RLS entirely (matches Supabase's
 * service_role, which has BYPASSRLS). Only for trusted server code that
 * already enforces its own authorization (admin checks, webhooks, cron) —
 * never expose this path to a request without an explicit admin check first.
 */
export async function withAdmin<T>(fn: (db: ScopedDb) => Promise<T>): Promise<T> {
  return rawDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'service_role', true)`);
    return fn(tx);
  });
}

export * from "./schema/schema";
