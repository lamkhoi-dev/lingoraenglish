-- Translations of the Pronunciation advanced-skill lesson texts (explain,
-- bullet points, caution, per-item notes) for every interface language.
-- One row per (locale, text_key); text_key = "<lesson id>|explain",
-- "<lesson id>|point|<n>", "<lesson id>|caution" or "<lesson id>|note|<n>".
-- English stays in pronunciation_lessons itself and is the fallback when a
-- row is missing. Lesson titles and the practice sentences are NOT
-- translated (they are the English being taught).
-- GRANTs are explicit: drizzle-kit never emits them (see CLAUDE.md,
-- pronunciation_lessons permission-denied incident).
CREATE TABLE IF NOT EXISTS "public"."pronunciation_lesson_texts" (
  "locale" text NOT NULL,
  "text_key" text NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("locale", "text_key")
);
--> statement-breakpoint
GRANT ALL ON TABLE "public"."pronunciation_lesson_texts" TO "lingora";
--> statement-breakpoint
GRANT ALL ON TABLE "public"."pronunciation_lesson_texts" TO "service_role";
--> statement-breakpoint
GRANT SELECT ON TABLE "public"."pronunciation_lesson_texts" TO "authenticated";
--> statement-breakpoint
GRANT SELECT ON TABLE "public"."pronunciation_lesson_texts" TO "anon";
