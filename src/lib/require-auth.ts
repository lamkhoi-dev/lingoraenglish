import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";

import { withAdmin } from "@/db";
import { userRoles } from "@/db/schema/schema";
import { verifySession } from "./session.server";
import { readSessionCookie } from "./session-cookie.server";

/**
 * Replaces `src/integrations/supabase/auth-middleware.ts` (`requireSupabaseAuth`).
 * Same contract: throws on missing/invalid session, otherwise passes
 * `context.userId` to the handler — every existing `*.functions.ts` file
 * that destructures `context.userId` keeps working unchanged after
 * swapping the middleware import.
 */
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const sessionId = readSessionCookie();
  if (!sessionId) throw new Error("Unauthorized: no session");

  const session = await verifySession(sessionId);
  if (!session) throw new Error("Unauthorized: invalid or expired session");

  return next({ context: { userId: session.userId } });
});

/**
 * Same contract as requireAuth, plus a server-side check that the caller
 * actually holds the 'admin' role — the same query the ported has_role()
 * Postgres function runs, done directly with Drizzle instead of an RPC
 * call. Never trust a client-side `isAdmin` flag for this; the admin panel
 * UI hides itself based on that, but every privileged read/write must
 * re-verify here, since the UI check is only a convenience, not a boundary.
 */
const checkIsAdmin = createServerOnlyFn(async (userId: string): Promise<boolean> => {
  const rows = await withAdmin((db) =>
    db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.role, "admin")))
      .limit(1),
  );
  return rows.length > 0;
});

export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireAuth])
  .server(async ({ next, context }) => {
    const isAdmin = await checkIsAdmin(context.userId);
    if (!isAdmin) throw new Error("Forbidden");
    return next({ context: { userId: context.userId } });
  });

/** For content that's readable by visitors but entitlement-gated for logged-in
 * users (e.g. vocabulary_words' `can_access_tier(access_tier)` RLS policy,
 * which only sees a real tier once `auth.uid()` resolves) — returns the
 * caller's userId if they have a valid session, null otherwise, and never
 * throws. Pass the result to withUser()/withAnon() accordingly so RLS
 * evaluates their actual entitlement instead of always falling back to anon. */
export async function getOptionalUserId(): Promise<string | null> {
  const sessionId = readSessionCookie();
  if (!sessionId) return null;
  const session = await verifySession(sessionId);
  return session?.userId ?? null;
}
