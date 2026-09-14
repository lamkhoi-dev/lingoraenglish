alter table public.vocabulary_words add column if not exists access_tier text not null default 'free';
alter table public.grammar_lessons add column if not exists access_tier text not null default 'free';
alter table public.listening_exercises add column if not exists access_tier text not null default 'free';
alter table public.ielts_questions add column if not exists access_tier text not null default 'ielts_pro';

alter table public.vocabulary_words add constraint vocabulary_words_access_tier_check check (access_tier in ('free','premium','ielts_pro'));
alter table public.grammar_lessons add constraint grammar_lessons_access_tier_check check (access_tier in ('free','premium','ielts_pro'));
alter table public.listening_exercises add constraint listening_exercises_access_tier_check check (access_tier in ('free','premium','ielts_pro'));
alter table public.ielts_questions add constraint ielts_questions_access_tier_check check (access_tier in ('free','premium','ielts_pro'));

update public.vocabulary_words set access_tier = 'premium' where level in ('B2','C1','C2');
update public.listening_exercises set access_tier = 'premium' where level in ('B2','C1','C2');
update public.grammar_lessons set access_tier = 'premium' where sort_order > 6;
update public.ielts_questions set access_tier = 'ielts_pro';

create or replace function public.tier_rank(_tier text)
returns integer
language sql
immutable
as $$ select case _tier when 'ielts_pro' then 2 when 'premium' then 1 else 0 end $$;

create or replace function public.can_access_tier(_tier text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tier_rank(_tier) = 0
    or (auth.uid() is not null
        and public.tier_rank(public.effective_tier(auth.uid(), 'live')) >= public.tier_rank(_tier))
    or (auth.uid() is not null
        and public.tier_rank(public.effective_tier(auth.uid(), 'sandbox')) >= public.tier_rank(_tier))
$$;

drop policy if exists "public read vocabulary_words" on public.vocabulary_words;
create policy "read entitled vocabulary_words" on public.vocabulary_words for select to anon, authenticated
using (((status = 'published') and public.can_access_tier(access_tier)) or public.has_role(auth.uid(), 'admin'));

drop policy if exists "public read grammar_lessons" on public.grammar_lessons;
create policy "read entitled grammar_lessons" on public.grammar_lessons for select to anon, authenticated
using (((status = 'published') and public.can_access_tier(access_tier)) or public.has_role(auth.uid(), 'admin'));

drop policy if exists "public read listening_exercises" on public.listening_exercises;
create policy "read entitled listening_exercises" on public.listening_exercises for select to anon, authenticated
using (((status = 'published') and public.can_access_tier(access_tier)) or public.has_role(auth.uid(), 'admin'));

drop policy if exists "public read ielts_questions" on public.ielts_questions;
create policy "read entitled ielts_questions" on public.ielts_questions for select to anon, authenticated
using (((status = 'published') and public.can_access_tier(access_tier)) or public.has_role(auth.uid(), 'admin'));

create or replace function public.content_catalogue(_kind text)
returns table (id uuid, title text, level text, category text, access_tier text, unlocked boolean)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.word as title, w.level::text, w.category, w.access_tier, public.can_access_tier(w.access_tier)
  from public.vocabulary_words w
  where _kind = 'vocabulary' and w.status = 'published'
  union all
  select g.id, g.title, g.level::text, ''::text, g.access_tier, public.can_access_tier(g.access_tier)
  from public.grammar_lessons g
  where _kind = 'grammar' and g.status = 'published'
  union all
  select l.id, l.title, l.level::text, l.activity_type, l.access_tier, public.can_access_tier(l.access_tier)
  from public.listening_exercises l
  where _kind = 'listening' and l.status = 'published'
$$;

grant execute on function public.content_catalogue(text) to anon, authenticated;
grant execute on function public.can_access_tier(text) to anon, authenticated;
grant execute on function public.tier_rank(text) to anon, authenticated;