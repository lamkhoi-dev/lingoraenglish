-- Global platform: localisation preferences + admin-editable interface translations

alter table public.profiles
  add column if not exists interface_language text not null default 'en',
  add column if not exists native_language text not null default '',
  add column if not exists daily_goal_minutes integer not null default 10,
  add column if not exists english_only_mode boolean not null default false,
  add column if not exists accent_preference text not null default 'us',
  add column if not exists voice_preference text not null default 'shimmer',
  add column if not exists timezone text not null default 'UTC',
  add column if not exists onboarded_at timestamptz;

-- Admin-managed interface language registry
create table if not exists public.ui_languages (
  code text primary key,
  native_name text not null,
  english_name text not null,
  flag text not null default '',
  direction text not null default 'ltr',
  intl_tag text not null default 'en-US',
  enabled boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.ui_languages to anon, authenticated;
grant insert, update, delete on public.ui_languages to authenticated;
grant all on public.ui_languages to service_role;
alter table public.ui_languages enable row level security;

create policy "public read ui_languages" on public.ui_languages
  for select to anon, authenticated using (true);
create policy "admin write ui_languages" on public.ui_languages
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create trigger ui_languages_touch before update on public.ui_languages
  for each row execute function public.touch_updated_at();

-- Admin overrides for individual interface strings (applied over bundled locales)
create table if not exists public.ui_translations (
  id uuid primary key default gen_random_uuid(),
  locale text not null references public.ui_languages(code) on delete cascade,
  translation_key text not null,
  value text not null,
  updated_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (locale, translation_key)
);

grant select on public.ui_translations to anon, authenticated;
grant insert, update, delete on public.ui_translations to authenticated;
grant all on public.ui_translations to service_role;
alter table public.ui_translations enable row level security;

create policy "public read ui_translations" on public.ui_translations
  for select to anon, authenticated using (true);
create policy "admin write ui_translations" on public.ui_translations
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create trigger ui_translations_touch before update on public.ui_translations
  for each row execute function public.touch_updated_at();

create index if not exists ui_translations_locale_idx on public.ui_translations (locale);

-- Localised meaning of an English vocabulary word, per interface language.
create table if not exists public.vocabulary_translations (
  id uuid primary key default gen_random_uuid(),
  word_id uuid not null references public.vocabulary_words on delete cascade,
  locale text not null references public.ui_languages(code) on delete cascade,
  meaning text not null default '',
  example_translation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (word_id, locale)
);

grant select on public.vocabulary_translations to anon, authenticated;
grant insert, update, delete on public.vocabulary_translations to authenticated;
grant all on public.vocabulary_translations to service_role;
alter table public.vocabulary_translations enable row level security;

create policy "public read vocabulary_translations" on public.vocabulary_translations
  for select to anon, authenticated using (true);
create policy "admin write vocabulary_translations" on public.vocabulary_translations
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create trigger vocabulary_translations_touch before update on public.vocabulary_translations
  for each row execute function public.touch_updated_at();

-- Localised explanation of an English grammar lesson, per interface language.
create table if not exists public.grammar_translations (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.grammar_lessons on delete cascade,
  locale text not null references public.ui_languages(code) on delete cascade,
  explanation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, locale)
);

grant select on public.grammar_translations to anon, authenticated;
grant insert, update, delete on public.grammar_translations to authenticated;
grant all on public.grammar_translations to service_role;
alter table public.grammar_translations enable row level security;

create policy "public read grammar_translations" on public.grammar_translations
  for select to anon, authenticated using (true);
create policy "admin write grammar_translations" on public.grammar_translations
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create trigger grammar_translations_touch before update on public.grammar_translations
  for each row execute function public.touch_updated_at();

-- Seed the 16 launch interface languages
insert into public.ui_languages (code, native_name, english_name, flag, direction, intl_tag, is_default, sort_order)
values
  ('en', 'English', 'English', '🇺🇸', 'ltr', 'en-US', true, 0),
  ('vi', 'Tiếng Việt', 'Vietnamese', '🇻🇳', 'ltr', 'vi-VN', false, 1),
  ('es', 'Español', 'Spanish', '🇪🇸', 'ltr', 'es-ES', false, 2),
  ('pt', 'Português', 'Portuguese', '🇧🇷', 'ltr', 'pt-BR', false, 3),
  ('fr', 'Français', 'French', '🇫🇷', 'ltr', 'fr-FR', false, 4),
  ('de', 'Deutsch', 'German', '🇩🇪', 'ltr', 'de-DE', false, 5),
  ('it', 'Italiano', 'Italian', '🇮🇹', 'ltr', 'it-IT', false, 6),
  ('ja', '日本語', 'Japanese', '🇯🇵', 'ltr', 'ja-JP', false, 7),
  ('ko', '한국어', 'Korean', '🇰🇷', 'ltr', 'ko-KR', false, 8),
  ('zh-CN', '简体中文', 'Simplified Chinese', '🇨🇳', 'ltr', 'zh-CN', false, 9),
  ('zh-TW', '繁體中文', 'Traditional Chinese', '🇹🇼', 'ltr', 'zh-TW', false, 10),
  ('hi', 'हिन्दी', 'Hindi', '🇮🇳', 'ltr', 'hi-IN', false, 11),
  ('id', 'Bahasa Indonesia', 'Indonesian', '🇮🇩', 'ltr', 'id-ID', false, 12),
  ('tr', 'Türkçe', 'Turkish', '🇹🇷', 'ltr', 'tr-TR', false, 13),
  ('ru', 'Русский', 'Russian', '🇷🇺', 'ltr', 'ru-RU', false, 14),
  ('ar', 'العربية', 'Arabic', '🇸🇦', 'rtl', 'ar-SA', false, 15)
on conflict (code) do nothing;