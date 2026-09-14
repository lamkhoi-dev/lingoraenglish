CREATE TABLE public.ai_speaking_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  topic TEXT NOT NULL DEFAULT 'free_conversation',
  level TEXT NOT NULL DEFAULT 'B1',
  status TEXT NOT NULL DEFAULT 'active',
  avatar_provider TEXT NOT NULL DEFAULT 'none',
  voice_provider TEXT NOT NULL DEFAULT 'openai_realtime',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  counted_seconds INTEGER NOT NULL DEFAULT 0,
  minutes_allowed INTEGER NOT NULL DEFAULT 0,
  overall_score INTEGER,
  grammar_score INTEGER,
  vocabulary_score INTEGER,
  pronunciation_score INTEGER,
  fluency_score INTEGER,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  report JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_speaking_sessions_user_idx ON public.ai_speaking_sessions (user_id, started_at DESC);
CREATE INDEX ai_speaking_sessions_active_idx ON public.ai_speaking_sessions (user_id) WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE ON public.ai_speaking_sessions TO authenticated;
GRANT ALL ON public.ai_speaking_sessions TO service_role;
ALTER TABLE public.ai_speaking_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions readable" ON public.ai_speaking_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own sessions insertable" ON public.ai_speaking_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "own sessions updatable" ON public.ai_speaking_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.ai_speaking_mistakes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  session_id UUID REFERENCES public.ai_speaking_sessions ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'grammar',
  said TEXT NOT NULL,
  correction TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_speaking_mistakes_user_idx ON public.ai_speaking_mistakes (user_id, created_at DESC);
GRANT SELECT, INSERT ON public.ai_speaking_mistakes TO authenticated;
GRANT ALL ON public.ai_speaking_mistakes TO service_role;
ALTER TABLE public.ai_speaking_mistakes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own mistakes readable" ON public.ai_speaking_mistakes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own mistakes insertable" ON public.ai_speaking_mistakes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE TABLE public.ai_speaking_memory (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'B1',
  weak_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  focus_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  vocabulary_to_review JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ai_speaking_memory TO authenticated;
GRANT ALL ON public.ai_speaking_memory TO service_role;
ALTER TABLE public.ai_speaking_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memory manageable" ON public.ai_speaking_memory FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.ai_speaking_settings (
  id TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
  avatar_id TEXT NOT NULL DEFAULT 'Ann_Therapist_public',
  avatar_quality TEXT NOT NULL DEFAULT 'high',
  voice_id TEXT NOT NULL DEFAULT '',
  fallback_voice TEXT NOT NULL DEFAULT 'shimmer',
  speech_rate NUMERIC NOT NULL DEFAULT 1.0,
  correction_frequency TEXT NOT NULL DEFAULT 'balanced',
  max_session_minutes INTEGER NOT NULL DEFAULT 15,
  free_minutes INTEGER NOT NULL DEFAULT 15,
  premium_minutes INTEGER NOT NULL DEFAULT 60,
  pro_minutes INTEGER NOT NULL DEFAULT 200,
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_speaking_settings TO authenticated;
GRANT ALL ON public.ai_speaking_settings TO service_role;
ALTER TABLE public.ai_speaking_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable" ON public.ai_speaking_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings admin writable" ON public.ai_speaking_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.ai_speaking_settings (id, topics) VALUES ('default', '["daily_life","small_talk","travel","shopping","restaurant","family","friends","canadian_life","workplace","job_interview","business","school","university","healthcare","technology","news","free_conversation","ielts_speaking","toeic_speaking"]'::jsonb);

UPDATE public.billing_plans SET limits = limits || jsonb_build_object('realtime_minutes',
  CASE tier WHEN 'free' THEN 15 WHEN 'premium' THEN 60 ELSE 200 END);

CREATE TRIGGER ai_speaking_sessions_updated_at BEFORE UPDATE ON public.ai_speaking_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();