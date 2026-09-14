ALTER TABLE public.speaking_tests
  ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS task_label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS instructions text NOT NULL DEFAULT '';

DROP FUNCTION IF EXISTS public.speaking_test_catalogue();
DROP FUNCTION IF EXISTS public.speaking_test_catalogue(text);

CREATE OR REPLACE FUNCTION public.speaking_test_catalogue(_exam text DEFAULT 'ielts')
RETURNS TABLE(
  id uuid,
  exam text,
  part integer,
  slug text,
  topic text,
  difficulty text,
  task_type text,
  task_label text,
  instructions text,
  questions jsonb,
  cue_card text,
  cue_points text[],
  preparation_time integer,
  speaking_time integer,
  test_number integer,
  is_free boolean,
  sort_order integer,
  unlocked boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.exam,
    t.part,
    t.slug,
    t.topic,
    t.difficulty,
    t.task_type,
    t.task_label,
    t.instructions,
    CASE WHEN t.is_free OR public.can_access_tier('premium') THEN t.questions ELSE '[]'::jsonb END,
    CASE WHEN t.is_free OR public.can_access_tier('premium') THEN t.cue_card ELSE '' END,
    CASE WHEN t.is_free OR public.can_access_tier('premium') THEN t.cue_points ELSE '{}'::text[] END,
    t.preparation_time,
    t.speaking_time,
    t.test_number,
    t.is_free,
    t.sort_order,
    (t.is_free OR public.can_access_tier('premium')) AS unlocked
  FROM public.speaking_tests t
  WHERE t.status = 'published' AND t.exam = _exam
  ORDER BY t.test_number, t.sort_order, t.slug
$$;

GRANT EXECUTE ON FUNCTION public.speaking_test_catalogue(text) TO anon, authenticated, service_role;