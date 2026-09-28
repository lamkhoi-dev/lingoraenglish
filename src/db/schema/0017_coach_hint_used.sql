-- AI Speaking Coach — "hint" feature (Ideas / Sentence starters / Example
-- under each coach question). Free-tier learners get exactly 1 hint reveal
-- per topic session ("mỗi bài free thì cho 1 lượt thôi") — tracked per
-- session, not per turn, since the allowance is "1 help per topic", not "1
-- help per question within it". Paid tiers never check this column (see
-- getCoachHintIdeas in coach.functions.ts).
ALTER TABLE "coach_sessions" ADD COLUMN IF NOT EXISTS "hint_used" boolean NOT NULL DEFAULT false;
