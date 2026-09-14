GRANT SELECT ON public.shadowing_topics TO anon, authenticated;
GRANT ALL ON public.shadowing_topics TO service_role;
GRANT SELECT ON public.shadowing_sentences TO anon, authenticated;
GRANT ALL ON public.shadowing_sentences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shadowing_progress TO authenticated;
GRANT ALL ON public.shadowing_progress TO service_role;