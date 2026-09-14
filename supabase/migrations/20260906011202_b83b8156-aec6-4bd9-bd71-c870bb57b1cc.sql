create table public.coach_topics (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('free','daily','roleplay','interview','challenge')),
  slug text not null unique,
  title text not null,
  description text not null default '',
  level text not null default 'B1' check (level in ('A1','A2','B1','B2','C1')),
  access_tier text not null default 'free' check (access_tier in ('free','premium','ielts_pro')),
  ai_role text not null default '',
  user_role text not null default '',
  situation text not null default '',
  objective text not null default '',
  opening_message text not null default '',
  instructions text not null default '',
  follow_up_directions text[] not null default '{}',
  vocabulary_focus text not null default '',
  grammar_focus text not null default '',
  interview_type text not null default '',
  challenge_prompt text not null default '',
  evaluation_criteria text not null default '',
  time_limit_seconds integer not null default 0,
  estimated_minutes integer not null default 5,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coach_topics_category_idx on public.coach_topics (category, sort_order);
grant select on public.coach_topics to anon;
grant select on public.coach_topics to authenticated;
grant all on public.coach_topics to service_role;
alter table public.coach_topics enable row level security;
create policy "Anyone can browse active coach topics" on public.coach_topics for select using (is_active or public.has_role(auth.uid(), 'admin'));
create policy "Admins manage coach topics" on public.coach_topics for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create trigger coach_topics_touch before update on public.coach_topics for each row execute function public.touch_updated_at();

create table public.coach_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.coach_topics(id) on delete set null,
  category text not null,
  topic_title text not null default '',
  level text not null default 'B1',
  tier_at_start text not null default 'free',
  user_turns integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coach_sessions_user_idx on public.coach_sessions (user_id, created_at desc);
grant select on public.coach_sessions to authenticated;
grant all on public.coach_sessions to service_role;
alter table public.coach_sessions enable row level security;
create policy "Learners read own coach sessions" on public.coach_sessions for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create trigger coach_sessions_touch before update on public.coach_sessions for each row execute function public.touch_updated_at();

create table public.coach_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coach_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  turn_number integer not null default 0,
  user_text text not null default '',
  coach_text text not null default '',
  counted_free boolean not null default false,
  created_at timestamptz not null default now()
);
create index coach_turns_session_idx on public.coach_turns (session_id, turn_number);
create index coach_turns_user_free_idx on public.coach_turns (user_id, counted_free);
grant select on public.coach_turns to authenticated;
grant all on public.coach_turns to service_role;
alter table public.coach_turns enable row level security;
create policy "Learners read own coach turns" on public.coach_turns for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create table public.coach_settings (
  id text primary key default 'default',
  free_turn_limit integer not null default 4,
  premium_monthly_turns integer not null default 0,
  pro_monthly_turns integer not null default 0,
  updated_at timestamptz not null default now()
);
grant select on public.coach_settings to authenticated;
grant all on public.coach_settings to service_role;
alter table public.coach_settings enable row level security;
create policy "Signed-in learners read coach settings" on public.coach_settings for select to authenticated using (true);
create policy "Admins manage coach settings" on public.coach_settings for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create trigger coach_settings_touch before update on public.coach_settings for each row execute function public.touch_updated_at();
insert into public.coach_settings (id) values ('default');

create or replace function public.coach_topic_catalogue(_category text default null)
returns table(
  id uuid, category text, slug text, title text, description text, level text,
  access_tier text, ai_role text, user_role text, situation text, objective text,
  interview_type text, challenge_prompt text, vocabulary_focus text, grammar_focus text,
  time_limit_seconds integer, estimated_minutes integer, sort_order integer, unlocked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.category, t.slug, t.title, t.description, t.level, t.access_tier,
    t.ai_role, t.user_role, t.situation, t.objective, t.interview_type, t.challenge_prompt,
    t.vocabulary_focus, t.grammar_focus, t.time_limit_seconds, t.estimated_minutes, t.sort_order,
    public.can_access_tier(t.access_tier)
  from public.coach_topics t
  where t.is_active and (_category is null or t.category = _category)
  order by t.category, t.sort_order, t.title
$$;
grant execute on function public.coach_topic_catalogue(text) to anon, authenticated;