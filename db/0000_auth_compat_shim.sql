-- Compatibility shim so the 19 original Supabase migrations
-- (supabase/migrations/*.sql) run VERBATIM, unmodified, against plain
-- Postgres. Run this file FIRST, before those files.
--
-- Recreates just the 3 things they reference that Supabase's managed
-- Postgres provides out of the box:
--   1. Roles: anon, authenticated, service_role (PostgREST's role model —
--      RLS policies are written "for ... to authenticated/anon/service_role")
--   2. Schema auth + table auth.users (FK target for every user_id column)
--   3. Function auth.uid() (what every RLS policy calls to get the current
--      user) — here it reads a session-local setting our own backend sets
--      per request via `SET LOCAL app.user_id = '<uuid>'` instead of
--      Supabase's JWT-derived claim.
--
-- This means the 58 RLS policies in the original migrations keep working
-- exactly as written — nothing about them needed to change.

-- 1. Roles ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- Our app's actual login role (see .env DATABASE_URL) switches into these
-- with `SET ROLE` per request. Granting to current_user (whatever role this
-- script runs as — "postgres" in local dev, a dedicated app role like
-- "lingora" in production) means this works unmodified in either place.
grant anon, authenticated, service_role to current_user;

-- 2. auth schema + users table -----------------------------------------
create schema if not exists auth;

-- Columns beyond `id` are exactly what the ported trigger functions read
-- off `new.*` on insert (grep "new\.[a-z_]+" across supabase/migrations —
-- only id, email, raw_user_meta_data, updated_at are ever touched) plus
-- what our own auth code needs to store.
-- Our own auth server code always runs as service_role (see src/db/index.ts
-- withAdmin) when touching auth.users directly — it owns this table.
grant usage on schema auth to service_role, authenticated, anon;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  -- null = Google-only account (no password set). See src/lib/auth.functions.ts
  -- signIn(), which rejects email/password login with a clear message when null,
  -- and the (future) "set a password" flow that lets such users add one later.
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant all on auth.users to service_role;
grant select (id) on auth.users to authenticated, anon; -- FK/auth.uid() joins only, never the password hash

-- 3. auth.uid() ----------------------------------------------------------
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;
