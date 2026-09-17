-- Yêu cầu 10 (Hệ thống hạn mức sử dụng) — the database half of the fixes.
-- The app half is in entitlements.server.ts (reserveUsage), coach.functions.ts
-- (coachReply scores the turn itself) and lily.functions.ts (every AI scoring
-- call is bound to one practice item the server checks).

-- 1. coach_reserve_turn(): count used turns the same way the app does, under
--    the same per-learner advisory lock, for BOTH allowances.
--    * A reservation whose AI call never completed (process restarted
--      mid-call, or the refund delete itself failed) stops counting after 5
--      minutes instead of costing the learner a turn forever.
--    * A paid plan's monthly allowance is now checked inside the lock too —
--      before, only the free lifetime allowance was, so concurrent requests
--      could overshoot a monthly cap.
--    The 4-argument version is new; the 3-argument one (called by the build
--    that is still running while this migration is applied) now just
--    forwards to it with no monthly cap, and can be dropped later.
CREATE OR REPLACE FUNCTION public.coach_reserve_turn(_session_id uuid, _limit integer, _count_free boolean, _monthly_limit integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  owner uuid;
  used integer;
  next_turn integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  SELECT user_id INTO owner FROM public.coach_sessions WHERE id = _session_id;
  IF owner IS NULL OR owner <> uid THEN RAISE EXCEPTION 'Session not found'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(uid::text));

  IF _count_free THEN
    SELECT count(*) INTO used FROM public.coach_turns
    WHERE user_id = uid AND counted_free
      AND (coach_text <> '' OR created_at > now() - interval '5 minutes');
    IF _limit > 0 AND used >= _limit THEN RAISE EXCEPTION 'turn_limit_reached'; END IF;
  ELSIF _monthly_limit > 0 THEN
    SELECT count(*) INTO used FROM public.coach_turns
    WHERE user_id = uid AND turn_number > 0
      AND created_at >= (date_trunc('month', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc')
      AND (coach_text <> '' OR created_at > now() - interval '5 minutes');
    IF used >= _monthly_limit THEN RAISE EXCEPTION 'turn_limit_reached'; END IF;
  END IF;

  SELECT coalesce(max(turn_number), 0) + 1 INTO next_turn
  FROM public.coach_turns WHERE session_id = _session_id;

  INSERT INTO public.coach_turns (session_id, user_id, turn_number, user_text, coach_text, counted_free)
  VALUES (_session_id, uid, next_turn, '', '', _count_free);

  UPDATE public.coach_sessions SET user_turns = next_turn WHERE id = _session_id;
  RETURN next_turn;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.coach_reserve_turn(uuid, integer, boolean, integer) FROM public, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.coach_reserve_turn(uuid, integer, boolean, integer) TO authenticated;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.coach_reserve_turn(_session_id uuid, _limit integer, _count_free boolean)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.coach_reserve_turn(_session_id, _limit, _count_free, 0) $$;--> statement-breakpoint

-- 2. Speaking Tests: 3 free tests in total (Yêu cầu 4 + 10, confirmed with the
--    customer 2026-09-16) — one per IELTS part, TOEFL/PTE fully Premium. The
--    count lives in billing_plans.limits like every other allowance, and the
--    rows are set to match right away so production is correct without
--    waiting for an admin to save the Plans tab.
UPDATE "billing_plans"
SET "limits" = "limits" || jsonb_build_object('speaking_tests_free_toefl_pte', 0)
WHERE "tier" = 'free';--> statement-breakpoint

UPDATE "speaking_tests" SET "is_free" = false WHERE "exam" <> 'ielts' AND "is_free";--> statement-breakpoint

-- 3. vocabulary_translations was readable for every word (`USING (true)`), so
--    a locked word's meaning came back to anyone who sent its id. The policy
--    now only exposes translations of words the caller can read under
--    vocabulary_words' own tier-aware policy (the app also joins on it).
DROP POLICY IF EXISTS "public read vocabulary_translations" ON "vocabulary_translations";--> statement-breakpoint
CREATE POLICY "public read vocabulary_translations" ON "vocabulary_translations"
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.vocabulary_words w WHERE w.id = word_id));--> statement-breakpoint

-- 4. Second layer only (every app read of these tables already goes through
--    withAdmin + its own gate, or a SECURITY DEFINER catalogue that redacts):
--    the row policies themselves stop exposing locked rows.
ALTER POLICY "pronunciation_lessons_read_free" ON "pronunciation_lessons"
  USING (status = 'published' AND is_free);--> statement-breakpoint
ALTER POLICY "pronunciation_lessons_read_premium" ON "pronunciation_lessons"
  USING (status = 'published' AND public.can_access_tier('premium'));--> statement-breakpoint
ALTER POLICY "Published speaking tests are readable" ON "speaking_tests"
  USING (status = 'published' AND (is_free OR public.can_access_tier('premium')));
