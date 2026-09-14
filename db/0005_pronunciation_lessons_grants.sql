-- pronunciation_lessons (added in src/db/schema/0002_pronunciation_lessons.sql,
-- applied via migrate.bat) was created with RLS policies but no table-level
-- GRANTs — drizzle-kit only models pgPolicy, not GRANT, so this step never
-- got generated automatically. Every pre-existing table (see shadowing_sentences)
-- has explicit GRANTs from the original Supabase dump; a brand-new table via
-- drizzle-kit does not inherit them. Without this, every query against the
-- table fails with "permission denied for table pronunciation_lessons"
-- (Postgres checks table-level GRANTs before RLS policies even run) — this
-- is exactly what broke /pronunciation's 8 advanced-skill tabs in production
-- on 2026-09-14 (all showed "0 shown" despite 372 rows existing and RLS
-- policies being correct). Matches shadowing_sentences' grant set exactly.

grant all on table public.pronunciation_lessons to lingora;
grant select on table public.pronunciation_lessons to anon;
grant select on table public.pronunciation_lessons to authenticated;
grant all on table public.pronunciation_lessons to service_role;
