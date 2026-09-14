ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS age_range text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  fn text := coalesce(meta->>'first_name', '');
  ln text := coalesce(meta->>'last_name', '');
  full_n text := coalesce(nullif(meta->>'full_name', ''), nullif(trim(fn || ' ' || ln), ''), '');
begin
  insert into public.profiles (
    id, email, full_name, first_name, last_name, country, age_range,
    terms_accepted_at, privacy_accepted_at, interface_language, ui_language
  )
  values (
    new.id,
    coalesce(new.email, ''),
    full_n,
    fn,
    ln,
    coalesce(meta->>'country', ''),
    coalesce(meta->>'age_range', ''),
    case when coalesce(meta->>'accepted_terms', '') = 'true' then now() else null end,
    case when coalesce(meta->>'accepted_privacy', '') = 'true' then now() else null end,
    coalesce(nullif(meta->>'interface_language', ''), 'en'),
    coalesce(nullif(meta->>'interface_language', ''), 'en')
  )
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'student') on conflict do nothing;
  return new;
end; $function$;