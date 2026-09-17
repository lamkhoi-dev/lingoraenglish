-- HOTFIX — 0009 broke login in production.
--
-- 0009 ended with:
--   REVOKE ALL ON FUNCTION public.auth_rate_take(...) FROM public, anon, authenticated;
--
-- "public" there is the PUBLIC pseudo-role — meaning *every* role, not "the
-- public schema". A freshly created function grants EXECUTE to PUBLIC by
-- default, so revoking from PUBLIC removes it for every role including
-- service_role, and 0009 never granted it back to anyone. Result:
-- rate-limit.server.ts calls this function through withAdmin() (role =
-- service_role), and every call — including signIn — started failing with
-- "permission denied for function auth_rate_take", taking sign-in down
-- entirely. The table grants a few lines above in 0009 were fine (GRANT ALL
-- ... TO lingora/service_role was explicit there); only the function was
-- missed. Confirmed by reading Postgres's REVOKE/GRANT semantics directly —
-- this is deterministic language behavior, not something to re-derive by
-- trial and error against production.
GRANT EXECUTE ON FUNCTION public.auth_rate_take(text, integer, integer) TO service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.auth_rate_take(text, integer, integer) TO lingora;
