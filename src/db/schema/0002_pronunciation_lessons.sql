CREATE TABLE "pronunciation_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill" text NOT NULL,
	"title" text NOT NULL,
	"level" text DEFAULT 'beginner' NOT NULL,
	"difficulty" text DEFAULT 'easy' NOT NULL,
	"accent" text DEFAULT 'us' NOT NULL,
	"explain" text DEFAULT '' NOT NULL,
	"points" text[] DEFAULT '{}' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"caution" text DEFAULT '' NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pronunciation_lessons_unique_order" UNIQUE("skill","sort_order"),
	CONSTRAINT "pronunciation_lessons_skill_check" CHECK (skill = ANY (ARRAY['word-stress'::text, 'sentence-stress'::text, 'intonation'::text, 'connected-speech'::text, 'reductions'::text, 'rhythm'::text, 'chunking'::text, 'fluency'::text])),
	CONSTRAINT "pronunciation_lessons_level_check" CHECK (level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])),
	CONSTRAINT "pronunciation_lessons_difficulty_check" CHECK (difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text])),
	CONSTRAINT "pronunciation_lessons_accent_check" CHECK (accent = ANY (ARRAY['us'::text, 'uk'::text]))
);
--> statement-breakpoint
ALTER TABLE "pronunciation_lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "idx_pronunciation_lessons_skill" ON "pronunciation_lessons" USING btree ("skill" text_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE POLICY "pronunciation_lessons_admin" ON "pronunciation_lessons" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "pronunciation_lessons_read_premium" ON "pronunciation_lessons" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "pronunciation_lessons_read_free" ON "pronunciation_lessons" AS PERMISSIVE FOR SELECT TO public;