CREATE TABLE public.speaking_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam text NOT NULL DEFAULT 'ielts',
  part integer NOT NULL,
  slug text NOT NULL UNIQUE,
  topic text NOT NULL,
  difficulty text NOT NULL DEFAULT 'Intermediate',
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  cue_card text NOT NULL DEFAULT '',
  cue_points text[] NOT NULL DEFAULT '{}',
  preparation_time integer NOT NULL DEFAULT 0,
  speaking_time integer NOT NULL DEFAULT 300,
  test_number integer NOT NULL DEFAULT 0,
  is_free boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.speaking_tests TO anon;
GRANT SELECT ON public.speaking_tests TO authenticated;
GRANT ALL ON public.speaking_tests TO service_role;

ALTER TABLE public.speaking_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published speaking tests are readable"
  ON public.speaking_tests FOR SELECT
  USING (status = 'published');

CREATE POLICY "Admins manage speaking tests"
  ON public.speaking_tests FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX speaking_tests_part_idx ON public.speaking_tests (part, sort_order);
CREATE INDEX speaking_tests_number_idx ON public.speaking_tests (test_number);

CREATE TRIGGER speaking_tests_touch
  BEFORE UPDATE ON public.speaking_tests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.speaking_test_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES public.speaking_tests(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  last_band numeric,
  best_band numeric,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, test_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.speaking_test_progress TO authenticated;
GRANT ALL ON public.speaking_test_progress TO service_role;

ALTER TABLE public.speaking_test_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Learners manage their own speaking test progress"
  ON public.speaking_test_progress FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX speaking_test_progress_user_idx ON public.speaking_test_progress (user_id);

CREATE TRIGGER speaking_test_progress_touch
  BEFORE UPDATE ON public.speaking_test_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.speaking_test_catalogue()
RETURNS TABLE(
  id uuid, exam text, part integer, slug text, topic text, difficulty text,
  questions jsonb, cue_card text, cue_points text[],
  preparation_time integer, speaking_time integer,
  test_number integer, is_free boolean, sort_order integer, unlocked boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.id, t.exam, t.part, t.slug, t.topic, t.difficulty,
    CASE WHEN t.is_free OR public.can_access_tier('premium') THEN t.questions ELSE '[]'::jsonb END,
    CASE WHEN t.is_free OR public.can_access_tier('premium') THEN t.cue_card ELSE '' END,
    CASE WHEN t.is_free OR public.can_access_tier('premium') THEN t.cue_points ELSE '{}'::text[] END,
    t.preparation_time, t.speaking_time, t.test_number, t.is_free, t.sort_order,
    (t.is_free OR public.can_access_tier('premium'))
  FROM public.speaking_tests t
  WHERE t.status = 'published'
  ORDER BY t.test_number, t.sort_order
$$;