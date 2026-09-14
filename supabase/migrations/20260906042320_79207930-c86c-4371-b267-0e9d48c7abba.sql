CREATE TABLE public.listening_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  level text NOT NULL DEFAULT 'A1',
  category text NOT NULL DEFAULT 'Everyday Life',
  topic text NOT NULL DEFAULT '',
  difficulty integer NOT NULL DEFAULT 1,
  duration_seconds integer NOT NULL DEFAULT 30,
  accent text NOT NULL DEFAULT 'american',
  script jsonb NOT NULL DEFAULT '[]'::jsonb,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  dictation jsonb NOT NULL DEFAULT '[]'::jsonb,
  connected_speech jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_free boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.listening_lessons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listening_lessons TO authenticated;
GRANT ALL ON public.listening_lessons TO service_role;

ALTER TABLE public.listening_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published listening lessons readable when unlocked"
ON public.listening_lessons FOR SELECT
USING (status = 'published' AND (is_free OR public.can_access_tier('premium')));

CREATE POLICY "Admins manage listening lessons"
ON public.listening_lessons FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX listening_lessons_level_idx ON public.listening_lessons (level, sort_order);
CREATE INDEX listening_lessons_category_idx ON public.listening_lessons (category);

CREATE TRIGGER listening_lessons_touch
BEFORE UPDATE ON public.listening_lessons
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.listening_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.listening_lessons(id) ON DELETE CASCADE,
  comprehension_score integer,
  dictation_score integer,
  overall_score integer,
  attempts integer NOT NULL DEFAULT 0,
  seconds_listened integer NOT NULL DEFAULT 0,
  weak_areas jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listening_progress TO authenticated;
GRANT ALL ON public.listening_progress TO service_role;

ALTER TABLE public.listening_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Learners manage their own listening progress"
ON public.listening_progress FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER listening_progress_touch
BEFORE UPDATE ON public.listening_progress
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.listening_catalogue()
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  level text,
  category text,
  topic text,
  difficulty integer,
  duration_seconds integer,
  accent text,
  question_count integer,
  dictation_count integer,
  is_free boolean,
  sort_order integer,
  unlocked boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.slug, l.title, l.level, l.category, l.topic, l.difficulty,
         l.duration_seconds, l.accent,
         jsonb_array_length(l.questions)::int,
         jsonb_array_length(l.dictation)::int,
         l.is_free, l.sort_order,
         (l.is_free OR public.can_access_tier('premium')) AS unlocked
  FROM public.listening_lessons l
  WHERE l.status = 'published'
  ORDER BY l.sort_order, l.slug
$$;

GRANT EXECUTE ON FUNCTION public.listening_catalogue() TO anon, authenticated;