-- Adds multi-turn dialogue support to Shadowing (Yêu cầu 2: "Có hội thoại
-- thực tế, không chỉ câu đơn lẻ"). A dialogue is just several existing
-- shadowing_sentences rows sharing one dialogue_id, ordered by turn_number,
-- each tagged with who's speaking and which AI voice to use for that line.
-- Existing rows are untouched (dialogue_id stays null = standalone sentence,
-- exactly as before this migration).

alter table public.shadowing_sentences
  add column if not exists dialogue_id uuid,
  add column if not exists turn_number integer not null default 0,
  add column if not exists speaker_label text not null default '',
  add column if not exists speaker_voice text not null default '';

create index if not exists idx_shadowing_sentences_dialogue
  on public.shadowing_sentences (dialogue_id);

-- Same function as supabase/migrations/20260904205914_..., extended to also
-- return the 4 new columns. speaker_label is masked the same way every other
-- content field already is (blank when locked); dialogue_id/turn_number/
-- speaker_voice are structural, not paid content, so they're always returned
-- — same treatment as is_free/unlocked/accent today.
-- Adding columns to a RETURNS TABLE signature is a return-type change, which
-- Postgres refuses via CREATE OR REPLACE — must drop first.
drop function if exists public.shadowing_topic_sentences(text);

create function public.shadowing_topic_sentences(_topic_slug text)
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
  unlocked boolean,
  dialogue_id uuid,
  turn_number integer,
  speaker_label text,
  speaker_voice text
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
    (s.is_free or public.can_access_tier('premium')),
    s.dialogue_id,
    s.turn_number,
    case when s.is_free or public.can_access_tier('premium') then s.speaker_label else '' end,
    s.speaker_voice
  from public.shadowing_sentences s
  join public.shadowing_topics t on t.id = s.topic_id
  where t.slug = _topic_slug and s.status = 'published' and t.is_active
  order by s.sort_order
$$;

grant execute on function public.shadowing_topic_sentences(text) to anon, authenticated;
