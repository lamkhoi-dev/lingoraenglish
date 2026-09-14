-- Our own auth tables (beyond auth.users from the shim). Only touched by
-- server code running as service_role (src/lib/auth-server.ts) — never
-- granted to authenticated/anon since sessions and tokens are managed
-- exclusively server-side, matching NFR 3.1 (server-side authorization
-- only) in the spec.

create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text not null default '',
  ip text not null default ''
);
create index if not exists sessions_user_id_idx on auth.sessions(user_id);

create table if not exists auth.oauth_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_account_id)
);
create index if not exists oauth_accounts_user_id_idx on auth.oauth_accounts(user_id);

-- Stores a hash of the token, never the token itself — matches "mật khẩu
-- lưu ở dạng băm" spirit from NFR 3.1 applied to reset/verify tokens too.
create table if not exists auth.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists auth.email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

grant all on auth.sessions, auth.oauth_accounts, auth.password_reset_tokens, auth.email_verification_tokens to service_role;
