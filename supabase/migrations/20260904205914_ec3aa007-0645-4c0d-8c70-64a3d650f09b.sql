create table public.shadowing_topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  topic_group text not null default 'Everyday English',
  blurb text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.shadowing_topics to anon;
grant select on public.shadowing_topics to authenticated;
grant all on public.shadowing_topics to service_role;

alter table public.shadowing_topics enable row level security;

create policy "shadowing_topics_read" on public.shadowing_topics
  for select using (is_active or public.has_role(auth.uid(), 'admin'));

create policy "shadowing_topics_admin_write" on public.shadowing_topics
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create trigger shadowing_topics_touch before update on public.shadowing_topics
  for each row execute function public.touch_updated_at();

create table public.shadowing_sentences (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.shadowing_topics(id) on delete cascade,
  subcategory text not null default '',
  level text not null default 'beginner',
  difficulty integer not null default 1,
  sentence_type text not null default 'statement',
  sentence text not null,
  natural_form text not null default '',
  translation text not null default '',
  audio_url text not null default '',
  accent text not null default 'american',
  pronunciation_focus text not null default '',
  stress_focus text not null default '',
  intonation_focus text not null default '',
  connected_speech_focus text not null default '',
  vocabulary jsonb not null default '[]'::jsonb,
  grammar_focus text not null default '',
  tags text[] not null default '{}',
  is_free boolean not null default false,
  sort_order integer not null default 0,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shadowing_sentences_level_check check (level in ('beginner','elementary','intermediate','advanced')),
  constraint shadowing_sentences_accent_check check (accent in ('american','british')),
  constraint shadowing_sentences_unique_order unique (topic_id, sort_order)
);

create index idx_shadowing_sentences_topic on public.shadowing_sentences(topic_id, sort_order);
create index idx_shadowing_sentences_level on public.shadowing_sentences(level);

grant select on public.shadowing_sentences to anon;
grant select on public.shadowing_sentences to authenticated;
grant all on public.shadowing_sentences to service_role;

alter table public.shadowing_sentences enable row level security;

create policy "shadowing_sentences_read_free" on public.shadowing_sentences
  for select using (status = 'published' and is_free);

create policy "shadowing_sentences_read_premium" on public.shadowing_sentences
  for select to authenticated
  using (status = 'published' and public.can_access_tier('premium'));

create policy "shadowing_sentences_admin" on public.shadowing_sentences
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create trigger shadowing_sentences_touch before update on public.shadowing_sentences
  for each row execute function public.touch_updated_at();

create table public.shadowing_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sentence_id uuid not null references public.shadowing_sentences(id) on delete cascade,
  attempts integer not null default 0,
  clear_attempts integer not null default 0,
  best_accuracy numeric,
  last_accuracy numeric,
  status text not null default 'in_progress',
  seconds_practised integer not null default 0,
  last_practised_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shadowing_progress_status_check check (status in ('in_progress','needs_practice','strong','mastered')),
  constraint shadowing_progress_unique unique (user_id, sentence_id)
);

create index idx_shadowing_progress_user on public.shadowing_progress(user_id, last_practised_at desc);

grant select, insert, update, delete on public.shadowing_progress to authenticated;
grant all on public.shadowing_progress to service_role;

alter table public.shadowing_progress enable row level security;

create policy "shadowing_progress_own" on public.shadowing_progress
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger shadowing_progress_touch before update on public.shadowing_progress
  for each row execute function public.touch_updated_at();

create or replace function public.shadowing_topic_sentences(_topic_slug text)
returns table (
  id uuid,
  sort_order integer,
  level text,
  difficulty integer,
  sentence_type text,
  sentence text,
  natural_form text,
  accent text,
  pronunciation_focus text,
  stress_focus text,
  intonation_focus text,
  connected_speech_focus text,
  vocabulary jsonb,
  grammar_focus text,
  tags text[],
  is_free boolean,
  unlocked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.sort_order, s.level, s.difficulty, s.sentence_type,
    case when s.is_free or public.can_access_tier('premium') then s.sentence else '' end,
    case when s.is_free or public.can_access_tier('premium') then s.natural_form else '' end,
    s.accent,
    case when s.is_free or public.can_access_tier('premium') then s.pronunciation_focus else '' end,
    case when s.is_free or public.can_access_tier('premium') then s.stress_focus else '' end,
    case when s.is_free or public.can_access_tier('premium') then s.intonation_focus else '' end,
    case when s.is_free or public.can_access_tier('premium') then s.connected_speech_focus else '' end,
    case when s.is_free or public.can_access_tier('premium') then s.vocabulary else '[]'::jsonb end,
    case when s.is_free or public.can_access_tier('premium') then s.grammar_focus else '' end,
    s.tags,
    s.is_free,
    (s.is_free or public.can_access_tier('premium'))
  from public.shadowing_sentences s
  join public.shadowing_topics t on t.id = s.topic_id
  where t.slug = _topic_slug and s.status = 'published' and t.is_active
  order by s.sort_order
$$;

grant execute on function public.shadowing_topic_sentences(text) to anon, authenticated;

create or replace function public.shadowing_topic_overview()
returns table (
  slug text,
  name text,
  topic_group text,
  blurb text,
  sort_order integer,
  total_sentences integer,
  free_sentences integer
)
language sql
stable
security definer
set search_path = public
as $$
  select t.slug, t.name, t.topic_group, t.blurb, t.sort_order,
    count(s.id)::int,
    count(s.id) filter (where s.is_free)::int
  from public.shadowing_topics t
  left join public.shadowing_sentences s on s.topic_id = t.id and s.status = 'published'
  where t.is_active
  group by t.slug, t.name, t.topic_group, t.blurb, t.sort_order
  order by t.sort_order, t.name
$$;

grant execute on function public.shadowing_topic_overview() to anon, authenticated;