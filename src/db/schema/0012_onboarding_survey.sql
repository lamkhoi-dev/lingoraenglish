-- Redesign of the post-signup onboarding survey (2026-09-18): replaces the
-- old hard-coded 4-step wizard (interface language / native language / CEFR
-- level+target / goal+minutes) with a 5-question flow the customer supplied
-- after reviewing competitor onboarding flows. Interface language is dropped
-- from onboarding entirely — it's already selectable from the header/footer
-- LanguageSelector and from /account, so onboarding is not its only home.

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "focus_areas" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "onboarding_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_key" text NOT NULL,
	"option_value" text NOT NULL,
	"label_en" text DEFAULT '' NOT NULL,
	"label_vi" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_options_unique" UNIQUE("question_key","option_value"),
	CONSTRAINT "onboarding_options_question_key_check" CHECK (question_key = ANY (ARRAY['goal'::text, 'focus_areas'::text, 'minutes'::text, 'level'::text, 'instruction_language'::text]))
);
--> statement-breakpoint
ALTER TABLE "onboarding_options" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "onboarding_options_admin" ON "onboarding_options" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
--> statement-breakpoint
-- Explicit USING (true) is required here, not stylistic: a SELECT policy
-- with no USING clause defaults to denying every row (verified empirically
-- on a scratch Postgres 16 — CREATE POLICY without USING stores polqual as
-- NULL, which RLS treats as deny-all, not allow-all). getOnboardingOptions
-- calls this via withAnon(), which genuinely enforces RLS (unlike the
-- withAdmin()-based catalogue reads elsewhere in this codebase, which
-- bypass RLS entirely) — so this one has to be right or the survey never
-- loads any options for anyone.
CREATE POLICY "onboarding_options_read" ON "onboarding_options" AS PERMISSIVE FOR SELECT TO public USING (true);
--> statement-breakpoint

-- GRANT block up front this time, not as a follow-up patch — drizzle-kit
-- only models pgPolicy, never table-level GRANT, and a brand-new table via
-- drizzle-kit does not inherit the GRANTs the original Supabase dump gave
-- every pre-existing table. Skipping this is exactly what broke
-- pronunciation_lessons in production on 2026-09-14 ("permission denied for
-- table", checked before RLS even runs) — see db/0005_pronunciation_lessons_grants.sql.
grant all on table public.onboarding_options to lingora;
grant select on table public.onboarding_options to anon;
grant select on table public.onboarding_options to authenticated;
grant all on table public.onboarding_options to service_role;
--> statement-breakpoint

-- Seed the 5 questions' initial options (English + Vietnamese labels — the
-- other 52 interface languages fall back to English for this screen only,
-- same graceful-degradation convention as elsewhere; see CLAUDE.md).
-- ON CONFLICT DO NOTHING so this migration stays safe to re-run.
INSERT INTO "onboarding_options" ("question_key", "option_value", "label_en", "label_vi", "sort_order") VALUES
	('goal', 'everyday', 'Improve everyday English', 'Cải thiện tiếng Anh hằng ngày', 1),
	('goal', 'confidence', 'Speak English more confidently', 'Nói tiếng Anh tự tin hơn', 2),
	('goal', 'pronunciation', 'Improve pronunciation', 'Cải thiện phát âm', 3),
	('goal', 'ielts', 'Prepare for IELTS', 'Luyện thi IELTS', 4),
	('goal', 'toefl', 'Prepare for TOEFL', 'Luyện thi TOEFL', 5),
	('goal', 'pte', 'Prepare for PTE', 'Luyện thi PTE', 6),
	('goal', 'work', 'Improve English for work', 'Cải thiện tiếng Anh cho công việc', 7),
	('goal', 'other', 'Other', 'Khác', 8),

	('focus_areas', 'speaking', 'Speaking', 'Nói', 1),
	('focus_areas', 'listening', 'Listening', 'Nghe', 2),
	('focus_areas', 'pronunciation', 'Pronunciation', 'Phát âm', 3),
	('focus_areas', 'vocabulary', 'Vocabulary', 'Từ vựng', 4),
	('focus_areas', 'grammar', 'Grammar', 'Ngữ pháp', 5),
	('focus_areas', 'fluency', 'Fluency', 'Sự trôi chảy', 6),

	('minutes', '10', '10 minutes/day', '10 phút/ngày', 1),
	('minutes', '20', '20 minutes/day', '20 phút/ngày', 2),
	('minutes', '30', '30 minutes/day', '30 phút/ngày', 3),
	('minutes', '60', '1 hour/day', '1 giờ/ngày', 4),

	-- option_value here maps to profiles.english_level (CEFR enum) except
	-- 'unsure', which onboarding.tsx substitutes with 'B1' (the column's own
	-- default) before submitting — kept as a distinct row/value rather than
	-- literally 'B1' twice, since (question_key, option_value) is unique.
	('level', 'A1', 'Beginner', 'Mới bắt đầu', 1),
	('level', 'A2', 'Elementary', 'Sơ cấp', 2),
	('level', 'B1', 'Intermediate', 'Trung cấp', 3),
	('level', 'B2', 'Upper-intermediate', 'Trung cấp cao', 4),
	('level', 'C1', 'Advanced', 'Nâng cao', 5),
	('level', 'unsure', 'I''m not sure', 'Tôi không chắc', 6),

	-- Drives englishOnlyMode + interfaceLanguage together, not a stored
	-- column of its own — see completeOnboarding in account.functions.ts.
	('instruction_language', 'en', 'English', 'Tiếng Anh', 1),
	('instruction_language', 'vi', 'Vietnamese', 'Tiếng Việt', 2)
ON CONFLICT ("question_key", "option_value") DO NOTHING;
