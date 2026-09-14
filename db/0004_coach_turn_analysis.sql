-- Persists each AI Speaking Coach turn's scoring (fluency/grammar/vocabulary/
-- overall/mistakes/corrections/better_vocabulary/natural_answer/feedback) so
-- reloading the page restores the feedback panel for past turns, not just the
-- plain transcript. Previously this analysis only ever lived in speaking_attempts,
-- which has no link back to the coach_turns row it came from.
-- Existing rows are untouched (analysis stays null = "no stored analysis",
-- exactly what a pre-migration turn looks like).

alter table public.coach_turns
  add column if not exists analysis jsonb;
