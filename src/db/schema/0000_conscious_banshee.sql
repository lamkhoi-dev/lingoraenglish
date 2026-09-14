-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE TYPE "public"."app_role" AS ENUM('admin', 'student');--> statement-breakpoint
CREATE TYPE "public"."cefr_level" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2');--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"encrypted_password" text NOT NULL,
	"email_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "pronunciation_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sound" text NOT NULL,
	"score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pronunciation_scores_user_id_sound_key" UNIQUE("user_id","sound")
);
--> statement-breakpoint
ALTER TABLE "pronunciation_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "conversation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic" text DEFAULT 'Free Conversation' NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"feedback" text DEFAULT '' NOT NULL,
	"performance" numeric(3, 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"capability" text NOT NULL,
	"provider" text DEFAULT 'lovable' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"units" integer DEFAULT 1 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ielts_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"part" integer DEFAULT 1 NOT NULL,
	"question_text" text DEFAULT '' NOT NULL,
	"transcript" text DEFAULT '' NOT NULL,
	"fluency_coherence" numeric(3, 1),
	"lexical_resource" numeric(3, 1),
	"grammatical_range" numeric(3, 1),
	"pronunciation" numeric(3, 1),
	"estimated_band" numeric(3, 1),
	"feedback" text DEFAULT '' NOT NULL,
	"corrected_answer" text DEFAULT '' NOT NULL,
	"natural_answer" text DEFAULT '' NOT NULL,
	"band6_version" text DEFAULT '' NOT NULL,
	"band7_version" text DEFAULT '' NOT NULL,
	"band8_version" text DEFAULT '' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ielts_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vocabulary_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"word_id" uuid NOT NULL,
	"times_practiced" integer DEFAULT 0 NOT NULL,
	"mastered" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_progress_user_id_word_id_key" UNIQUE("user_id","word_id")
);
--> statement-breakpoint
ALTER TABLE "vocabulary_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "listening_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" uuid,
	"score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listening_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "daily_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_date" date DEFAULT CURRENT_DATE NOT NULL,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"insights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_plans_user_id_plan_date_key" UNIQUE("user_id","plan_date")
);
--> statement-breakpoint
ALTER TABLE "daily_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tts_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cache_key" text NOT NULL,
	"text_content" text NOT NULL,
	"voice" text DEFAULT 'default' NOT NULL,
	"audio_base64" text NOT NULL,
	"mime_type" text DEFAULT 'audio/mpeg' NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tts_cache_cache_key_key" UNIQUE("cache_key")
);
--> statement-breakpoint
ALTER TABLE "tts_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ui_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"locale" text NOT NULL,
	"translation_key" text NOT NULL,
	"value" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ui_translations_locale_translation_key_key" UNIQUE("locale","translation_key")
);
--> statement-breakpoint
ALTER TABLE "ui_translations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ui_languages" (
	"code" text PRIMARY KEY NOT NULL,
	"native_name" text NOT NULL,
	"english_name" text NOT NULL,
	"flag" text DEFAULT '' NOT NULL,
	"direction" text DEFAULT 'ltr' NOT NULL,
	"intl_tag" text DEFAULT 'en-US' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ui_languages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "app_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_key" UNIQUE("user_id","role")
);
--> statement-breakpoint
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vocabulary_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word" text NOT NULL,
	"ipa" text DEFAULT '' NOT NULL,
	"meaning_vi" text DEFAULT '' NOT NULL,
	"meaning_en" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'Daily English' NOT NULL,
	"level" "cefr_level" DEFAULT 'B1' NOT NULL,
	"example_sentence" text DEFAULT '' NOT NULL,
	"example_vi" text DEFAULT '' NOT NULL,
	"synonyms" text[] DEFAULT '{""}' NOT NULL,
	"antonyms" text[] DEFAULT '{""}' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"access_tier" text DEFAULT 'free' NOT NULL,
	CONSTRAINT "vocabulary_words_access_tier_check" CHECK (access_tier = ANY (ARRAY['free'::text, 'premium'::text, 'ielts_pro'::text]))
);
--> statement-breakpoint
ALTER TABLE "vocabulary_words" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "grammar_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"level" "cefr_level" DEFAULT 'B1' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"explanation_vi" text DEFAULT '' NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exercises" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"access_tier" text DEFAULT 'free' NOT NULL,
	CONSTRAINT "grammar_lessons_slug_key" UNIQUE("slug"),
	CONSTRAINT "grammar_lessons_access_tier_check" CHECK (access_tier = ANY (ARRAY['free'::text, 'premium'::text, 'ielts_pro'::text]))
);
--> statement-breakpoint
ALTER TABLE "grammar_lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "speaking_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt" text NOT NULL,
	"category" text DEFAULT 'Daily Life' NOT NULL,
	"level" "cefr_level" DEFAULT 'B1' NOT NULL,
	"part" text DEFAULT 'general' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "speaking_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "listening_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"level" "cefr_level" DEFAULT 'A2' NOT NULL,
	"activity_type" text DEFAULT 'listen_and_choose' NOT NULL,
	"transcript" text DEFAULT '' NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"access_tier" text DEFAULT 'free' NOT NULL,
	CONSTRAINT "listening_exercises_access_tier_check" CHECK (access_tier = ANY (ARRAY['free'::text, 'premium'::text, 'ielts_pro'::text]))
);
--> statement-breakpoint
ALTER TABLE "listening_exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ielts_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part" integer DEFAULT 1 NOT NULL,
	"topic" text DEFAULT 'General' NOT NULL,
	"prompt" text NOT NULL,
	"cue_points" text[] DEFAULT '{""}' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"access_tier" text DEFAULT 'ielts_pro' NOT NULL,
	CONSTRAINT "ielts_questions_access_tier_check" CHECK (access_tier = ANY (ARRAY['free'::text, 'premium'::text, 'ielts_pro'::text]))
);
--> statement-breakpoint
ALTER TABLE "ielts_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "speaking_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid,
	"question_text" text DEFAULT '' NOT NULL,
	"transcript" text DEFAULT '' NOT NULL,
	"fluency" numeric(3, 1),
	"grammar" numeric(3, 1),
	"vocabulary" numeric(3, 1),
	"pronunciation" numeric(3, 1),
	"overall" numeric(3, 1),
	"mistakes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"corrections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"better_vocabulary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"natural_answer" text DEFAULT '' NOT NULL,
	"feedback" text DEFAULT '' NOT NULL,
	"audio_path" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "speaking_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pronunciation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" text DEFAULT 'sound' NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"target_sound" text,
	"transcript" text DEFAULT '' NOT NULL,
	"accuracy" numeric(5, 2),
	"feedback" text DEFAULT '' NOT NULL,
	"feedback_vi" text DEFAULT '' NOT NULL,
	"audio_path" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pronunciation_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vocabulary_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"meaning" text DEFAULT '' NOT NULL,
	"example_translation" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_translations_word_id_locale_key" UNIQUE("word_id","locale")
);
--> statement-breakpoint
ALTER TABLE "vocabulary_translations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"paddle_subscription_id" text NOT NULL,
	"paddle_customer_id" text NOT NULL,
	"product_id" text NOT NULL,
	"price_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"billing_interval" text DEFAULT 'month' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"amount" integer,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"scheduled_change" text DEFAULT '' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"environment" text DEFAULT 'sandbox' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_paddle_subscription_id_key" UNIQUE("paddle_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "grammar_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grammar_translations_lesson_id_locale_key" UNIQUE("lesson_id","locale")
);
--> statement-breakpoint
ALTER TABLE "grammar_translations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_key" text NOT NULL,
	"tier" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"badge" text DEFAULT '' NOT NULL,
	"monthly_price_id" text DEFAULT '' NOT NULL,
	"yearly_price_id" text DEFAULT '' NOT NULL,
	"monthly_amount" integer DEFAULT 0 NOT NULL,
	"yearly_amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trial_enabled" boolean DEFAULT false NOT NULL,
	"trial_days" integer DEFAULT 7 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_plans_plan_key_key" UNIQUE("plan_key"),
	CONSTRAINT "billing_plans_tier_key" UNIQUE("tier")
);
--> statement-breakpoint
ALTER TABLE "billing_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event" text NOT NULL,
	"plan_key" text DEFAULT '' NOT NULL,
	"interval_key" text DEFAULT '' NOT NULL,
	"environment" text DEFAULT 'sandbox' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"period_start" date NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counters_user_id_capability_period_start_key" UNIQUE("user_id","capability","period_start")
);
--> statement-breakpoint
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "complimentary_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tier" text NOT NULL,
	"expires_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	"granted_by" uuid,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "complimentary_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"target_user_id" uuid,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_speaking_memory" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"level" text DEFAULT 'B1' NOT NULL,
	"weak_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"focus_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"vocabulary_to_review" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_speaking_memory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"english_level" "cefr_level" DEFAULT 'B1' NOT NULL,
	"target_level" "cefr_level" DEFAULT 'C1' NOT NULL,
	"learning_goal" text DEFAULT '' NOT NULL,
	"ui_language" text DEFAULT 'en' NOT NULL,
	"streak_days" integer DEFAULT 0 NOT NULL,
	"last_practice_on" date,
	"practice_minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"interface_language" text DEFAULT 'en' NOT NULL,
	"native_language" text DEFAULT '' NOT NULL,
	"daily_goal_minutes" integer DEFAULT 10 NOT NULL,
	"english_only_mode" boolean DEFAULT false NOT NULL,
	"accent_preference" text DEFAULT 'us' NOT NULL,
	"voice_preference" text DEFAULT 'shimmer' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"onboarded_at" timestamp with time zone,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"age_range" text DEFAULT '' NOT NULL,
	"terms_accepted_at" timestamp with time zone,
	"privacy_accepted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shadowing_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"topic_group" text DEFAULT 'Everyday English' NOT NULL,
	"blurb" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shadowing_topics_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "shadowing_topics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_speaking_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic" text DEFAULT 'free_conversation' NOT NULL,
	"level" text DEFAULT 'B1' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"avatar_provider" text DEFAULT 'none' NOT NULL,
	"voice_provider" text DEFAULT 'openai_realtime' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"counted_seconds" integer DEFAULT 0 NOT NULL,
	"minutes_allowed" integer DEFAULT 0 NOT NULL,
	"overall_score" integer,
	"grammar_score" integer,
	"vocabulary_score" integer,
	"pronunciation_score" integer,
	"fluency_score" integer,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_speaking_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_speaking_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"avatar_id" text DEFAULT 'Ann_Therapist_public' NOT NULL,
	"avatar_quality" text DEFAULT 'high' NOT NULL,
	"voice_id" text DEFAULT '' NOT NULL,
	"fallback_voice" text DEFAULT 'shimmer' NOT NULL,
	"speech_rate" numeric DEFAULT '1.0' NOT NULL,
	"correction_frequency" text DEFAULT 'balanced' NOT NULL,
	"max_session_minutes" integer DEFAULT 15 NOT NULL,
	"free_minutes" integer DEFAULT 15 NOT NULL,
	"premium_minutes" integer DEFAULT 60 NOT NULL,
	"pro_minutes" integer DEFAULT 200 NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_speaking_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_speaking_mistakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"category" text DEFAULT 'grammar' NOT NULL,
	"said" text NOT NULL,
	"correction" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_speaking_mistakes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shadowing_sentences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"subcategory" text DEFAULT '' NOT NULL,
	"level" text DEFAULT 'beginner' NOT NULL,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"sentence_type" text DEFAULT 'statement' NOT NULL,
	"sentence" text NOT NULL,
	"natural_form" text DEFAULT '' NOT NULL,
	"translation" text DEFAULT '' NOT NULL,
	"audio_url" text DEFAULT '' NOT NULL,
	"accent" text DEFAULT 'american' NOT NULL,
	"pronunciation_focus" text DEFAULT '' NOT NULL,
	"stress_focus" text DEFAULT '' NOT NULL,
	"intonation_focus" text DEFAULT '' NOT NULL,
	"connected_speech_focus" text DEFAULT '' NOT NULL,
	"vocabulary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"grammar_focus" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{""}' NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shadowing_sentences_unique_order" UNIQUE("topic_id","sort_order"),
	CONSTRAINT "shadowing_sentences_level_check" CHECK (level = ANY (ARRAY['beginner'::text, 'elementary'::text, 'intermediate'::text, 'advanced'::text])),
	CONSTRAINT "shadowing_sentences_accent_check" CHECK (accent = ANY (ARRAY['american'::text, 'british'::text]))
);
--> statement-breakpoint
ALTER TABLE "shadowing_sentences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shadowing_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sentence_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"clear_attempts" integer DEFAULT 0 NOT NULL,
	"best_accuracy" numeric,
	"last_accuracy" numeric,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"seconds_practised" integer DEFAULT 0 NOT NULL,
	"last_practised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shadowing_progress_unique" UNIQUE("user_id","sentence_id"),
	CONSTRAINT "shadowing_progress_status_check" CHECK (status = ANY (ARRAY['in_progress'::text, 'needs_practice'::text, 'strong'::text, 'mastered'::text]))
);
--> statement-breakpoint
ALTER TABLE "shadowing_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"free_turn_limit" integer DEFAULT 4 NOT NULL,
	"premium_monthly_turns" integer DEFAULT 0 NOT NULL,
	"pro_monthly_turns" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"level" text DEFAULT 'B1' NOT NULL,
	"access_tier" text DEFAULT 'free' NOT NULL,
	"ai_role" text DEFAULT '' NOT NULL,
	"user_role" text DEFAULT '' NOT NULL,
	"situation" text DEFAULT '' NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"opening_message" text DEFAULT '' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"follow_up_directions" text[] DEFAULT '{""}' NOT NULL,
	"vocabulary_focus" text DEFAULT '' NOT NULL,
	"grammar_focus" text DEFAULT '' NOT NULL,
	"interview_type" text DEFAULT '' NOT NULL,
	"challenge_prompt" text DEFAULT '' NOT NULL,
	"evaluation_criteria" text DEFAULT '' NOT NULL,
	"time_limit_seconds" integer DEFAULT 0 NOT NULL,
	"estimated_minutes" integer DEFAULT 5 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_topics_slug_key" UNIQUE("slug"),
	CONSTRAINT "coach_topics_category_check" CHECK (category = ANY (ARRAY['free'::text, 'daily'::text, 'roleplay'::text, 'interview'::text, 'challenge'::text])),
	CONSTRAINT "coach_topics_level_check" CHECK (level = ANY (ARRAY['A1'::text, 'A2'::text, 'B1'::text, 'B2'::text, 'C1'::text])),
	CONSTRAINT "coach_topics_access_tier_check" CHECK (access_tier = ANY (ARRAY['free'::text, 'premium'::text, 'ielts_pro'::text]))
);
--> statement-breakpoint
ALTER TABLE "coach_topics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic_id" uuid,
	"category" text NOT NULL,
	"topic_title" text DEFAULT '' NOT NULL,
	"level" text DEFAULT 'B1' NOT NULL,
	"tier_at_start" text DEFAULT 'free' NOT NULL,
	"user_turns" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"turn_number" integer DEFAULT 0 NOT NULL,
	"user_text" text DEFAULT '' NOT NULL,
	"coach_text" text DEFAULT '' NOT NULL,
	"counted_free" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_turns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "listening_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"level" text DEFAULT 'A1' NOT NULL,
	"category" text DEFAULT 'Everyday Life' NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"duration_seconds" integer DEFAULT 30 NOT NULL,
	"accent" text DEFAULT 'american' NOT NULL,
	"script" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dictation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"connected_speech" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listening_lessons_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "listening_lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "listening_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"comprehension_score" integer,
	"dictation_score" integer,
	"overall_score" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"seconds_listened" integer DEFAULT 0 NOT NULL,
	"weak_areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listening_progress_user_id_lesson_id_key" UNIQUE("user_id","lesson_id")
);
--> statement-breakpoint
ALTER TABLE "listening_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "speaking_test_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_band" numeric,
	"best_band" numeric,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "speaking_test_progress_user_id_test_id_key" UNIQUE("user_id","test_id")
);
--> statement-breakpoint
ALTER TABLE "speaking_test_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "speaking_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam" text DEFAULT 'ielts' NOT NULL,
	"part" integer NOT NULL,
	"slug" text NOT NULL,
	"topic" text NOT NULL,
	"difficulty" text DEFAULT 'Intermediate' NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cue_card" text DEFAULT '' NOT NULL,
	"cue_points" text[] DEFAULT '{""}' NOT NULL,
	"preparation_time" integer DEFAULT 0 NOT NULL,
	"speaking_time" integer DEFAULT 300 NOT NULL,
	"test_number" integer DEFAULT 0 NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"task_type" text DEFAULT '' NOT NULL,
	"task_label" text DEFAULT '' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	CONSTRAINT "speaking_tests_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "speaking_tests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pronunciation_scores" ADD CONSTRAINT "pronunciation_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."conversation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ielts_attempts" ADD CONSTRAINT "ielts_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_progress" ADD CONSTRAINT "vocabulary_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_progress" ADD CONSTRAINT "vocabulary_progress_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."vocabulary_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_attempts" ADD CONSTRAINT "listening_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_attempts" ADD CONSTRAINT "listening_attempts_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."listening_exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_translations" ADD CONSTRAINT "ui_translations_locale_fkey" FOREIGN KEY ("locale") REFERENCES "public"."ui_languages"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_translations" ADD CONSTRAINT "ui_translations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_attempts" ADD CONSTRAINT "speaking_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_attempts" ADD CONSTRAINT "speaking_attempts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."speaking_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pronunciation_attempts" ADD CONSTRAINT "pronunciation_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_translations" ADD CONSTRAINT "vocabulary_translations_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."vocabulary_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_translations" ADD CONSTRAINT "vocabulary_translations_locale_fkey" FOREIGN KEY ("locale") REFERENCES "public"."ui_languages"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_translations" ADD CONSTRAINT "grammar_translations_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."grammar_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_translations" ADD CONSTRAINT "grammar_translations_locale_fkey" FOREIGN KEY ("locale") REFERENCES "public"."ui_languages"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complimentary_access" ADD CONSTRAINT "complimentary_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complimentary_access" ADD CONSTRAINT "complimentary_access_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_speaking_memory" ADD CONSTRAINT "ai_speaking_memory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_speaking_sessions" ADD CONSTRAINT "ai_speaking_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_speaking_mistakes" ADD CONSTRAINT "ai_speaking_mistakes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_speaking_mistakes" ADD CONSTRAINT "ai_speaking_mistakes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ai_speaking_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadowing_sentences" ADD CONSTRAINT "shadowing_sentences_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."shadowing_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadowing_progress" ADD CONSTRAINT "shadowing_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadowing_progress" ADD CONSTRAINT "shadowing_progress_sentence_id_fkey" FOREIGN KEY ("sentence_id") REFERENCES "public"."shadowing_sentences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_sessions" ADD CONSTRAINT "coach_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_sessions" ADD CONSTRAINT "coach_sessions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."coach_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_turns" ADD CONSTRAINT "coach_turns_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."coach_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_turns" ADD CONSTRAINT "coach_turns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_progress" ADD CONSTRAINT "listening_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_progress" ADD CONSTRAINT "listening_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."listening_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_test_progress" ADD CONSTRAINT "speaking_test_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_test_progress" ADD CONSTRAINT "speaking_test_progress_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "public"."speaking_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ui_translations_locale_idx" ON "ui_translations" USING btree ("locale" text_ops);--> statement-breakpoint
CREATE INDEX "idx_subscriptions_paddle_id" ON "subscriptions" USING btree ("paddle_subscription_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_subscriptions_user_id" ON "subscriptions" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_billing_events_event" ON "billing_events" USING btree ("event" text_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_usage_counters_user" ON "usage_counters" USING btree ("user_id" date_ops,"period_start" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_comp_access_user" ON "complimentary_access" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_admin_audit_created" ON "admin_audit_log" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ai_speaking_sessions_active_idx" ON "ai_speaking_sessions" USING btree ("user_id" uuid_ops) WHERE (status = 'active'::text);--> statement-breakpoint
CREATE INDEX "ai_speaking_sessions_user_idx" ON "ai_speaking_sessions" USING btree ("user_id" timestamptz_ops,"started_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ai_speaking_mistakes_user_idx" ON "ai_speaking_mistakes" USING btree ("user_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_shadowing_sentences_level" ON "shadowing_sentences" USING btree ("level" text_ops);--> statement-breakpoint
CREATE INDEX "idx_shadowing_sentences_topic" ON "shadowing_sentences" USING btree ("topic_id" int4_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_shadowing_progress_user" ON "shadowing_progress" USING btree ("user_id" timestamptz_ops,"last_practised_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "coach_topics_category_idx" ON "coach_topics" USING btree ("category" int4_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "coach_sessions_user_idx" ON "coach_sessions" USING btree ("user_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "coach_turns_session_idx" ON "coach_turns" USING btree ("session_id" int4_ops,"turn_number" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "coach_turns_session_turn_uq" ON "coach_turns" USING btree ("session_id" int4_ops,"turn_number" uuid_ops);--> statement-breakpoint
CREATE INDEX "coach_turns_user_free_idx" ON "coach_turns" USING btree ("user_id" uuid_ops,"counted_free" bool_ops);--> statement-breakpoint
CREATE INDEX "listening_lessons_category_idx" ON "listening_lessons" USING btree ("category" text_ops);--> statement-breakpoint
CREATE INDEX "listening_lessons_level_idx" ON "listening_lessons" USING btree ("level" text_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "speaking_test_progress_user_idx" ON "speaking_test_progress" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "speaking_tests_number_idx" ON "speaking_tests" USING btree ("test_number" int4_ops);--> statement-breakpoint
CREATE INDEX "speaking_tests_part_idx" ON "speaking_tests" USING btree ("part" int4_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE POLICY "admin read pronunciation_scores" ON "pronunciation_scores" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "own rows pronunciation_scores" ON "pronunciation_scores" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "admin read conversation_sessions" ON "conversation_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "own rows conversation_sessions" ON "conversation_sessions" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "admin read conversation_messages" ON "conversation_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "own rows conversation_messages" ON "conversation_messages" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "own usage insert" ON "ai_usage_log" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "own usage read" ON "ai_usage_log" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "admin read ielts_attempts" ON "ielts_attempts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "own rows ielts_attempts" ON "ielts_attempts" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "admin read vocabulary_progress" ON "vocabulary_progress" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "own rows vocabulary_progress" ON "vocabulary_progress" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "admin read listening_attempts" ON "listening_attempts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "own rows listening_attempts" ON "listening_attempts" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "admin read daily_plans" ON "daily_plans" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "own rows daily_plans" ON "daily_plans" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "cache readable" ON "tts_cache" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "admin write ui_translations" ON "ui_translations" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "public read ui_translations" ON "ui_translations" AS PERMISSIVE FOR SELECT TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "admin write ui_languages" ON "ui_languages" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "public read ui_languages" ON "ui_languages" AS PERMISSIVE FOR SELECT TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "admins manage roles" ON "user_roles" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "own roles read" ON "user_roles" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "read entitled vocabulary_words" ON "vocabulary_words" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((((status = 'published'::text) AND can_access_tier(access_tier)) OR has_role(auth.uid(), 'admin'::app_role)));--> statement-breakpoint
CREATE POLICY "admin write vocabulary_words" ON "vocabulary_words" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "read entitled grammar_lessons" ON "grammar_lessons" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((((status = 'published'::text) AND can_access_tier(access_tier)) OR has_role(auth.uid(), 'admin'::app_role)));--> statement-breakpoint
CREATE POLICY "admin write grammar_lessons" ON "grammar_lessons" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "admin write speaking_questions" ON "speaking_questions" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "public read speaking_questions" ON "speaking_questions" AS PERMISSIVE FOR SELECT TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "read entitled listening_exercises" ON "listening_exercises" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((((status = 'published'::text) AND can_access_tier(access_tier)) OR has_role(auth.uid(), 'admin'::app_role)));--> statement-breakpoint
CREATE POLICY "admin write listening_exercises" ON "listening_exercises" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "read entitled ielts_questions" ON "ielts_questions" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((((status = 'published'::text) AND can_access_tier(access_tier)) OR has_role(auth.uid(), 'admin'::app_role)));--> statement-breakpoint
CREATE POLICY "admin write ielts_questions" ON "ielts_questions" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "admin read speaking_attempts" ON "speaking_attempts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "own rows speaking_attempts" ON "speaking_attempts" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "admin read pronunciation_attempts" ON "pronunciation_attempts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "own rows pronunciation_attempts" ON "pronunciation_attempts" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "admin write vocabulary_translations" ON "vocabulary_translations" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "public read vocabulary_translations" ON "vocabulary_translations" AS PERMISSIVE FOR SELECT TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "Users read own subscription" ON "subscriptions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));--> statement-breakpoint
CREATE POLICY "admin write grammar_translations" ON "grammar_translations" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "public read grammar_translations" ON "grammar_translations" AS PERMISSIVE FOR SELECT TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "Admins manage plans" ON "billing_plans" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "Anyone can read active plans" ON "billing_plans" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Admins read billing events" ON "billing_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "Users read own usage" ON "usage_counters" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));--> statement-breakpoint
CREATE POLICY "Admins manage complimentary access" ON "complimentary_access" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "Users read own complimentary access" ON "complimentary_access" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Admins read audit log" ON "admin_audit_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "own memory manageable" ON "ai_speaking_memory" AS PERMISSIVE FOR ALL TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "own profile update" ON "profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));--> statement-breakpoint
CREATE POLICY "own profile insert" ON "profiles" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "own profile read" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "shadowing_topics_admin_write" ON "shadowing_topics" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "shadowing_topics_read" ON "shadowing_topics" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "own sessions updatable" ON "ai_speaking_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "own sessions insertable" ON "ai_speaking_sessions" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "own sessions readable" ON "ai_speaking_sessions" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "settings admin writable" ON "ai_speaking_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "settings readable" ON "ai_speaking_settings" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "own mistakes insertable" ON "ai_speaking_mistakes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "own mistakes readable" ON "ai_speaking_mistakes" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "shadowing_sentences_admin" ON "shadowing_sentences" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "shadowing_sentences_read_premium" ON "shadowing_sentences" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "shadowing_sentences_read_free" ON "shadowing_sentences" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "shadowing_progress_own" ON "shadowing_progress" AS PERMISSIVE FOR ALL TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));--> statement-breakpoint
CREATE POLICY "Admins manage coach settings" ON "coach_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "Signed-in learners read coach settings" ON "coach_settings" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Admins manage coach topics" ON "coach_topics" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "Anyone can browse active coach topics" ON "coach_topics" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Learners read own coach sessions" ON "coach_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));--> statement-breakpoint
CREATE POLICY "Learners read own coach turns" ON "coach_turns" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));--> statement-breakpoint
CREATE POLICY "Admins manage listening lessons" ON "listening_lessons" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "Published listening lessons readable when unlocked" ON "listening_lessons" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Learners manage their own listening progress" ON "listening_progress" AS PERMISSIVE FOR ALL TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));--> statement-breakpoint
CREATE POLICY "Learners manage their own speaking test progress" ON "speaking_test_progress" AS PERMISSIVE FOR ALL TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));--> statement-breakpoint
CREATE POLICY "Admins manage speaking tests" ON "speaking_tests" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));--> statement-breakpoint
CREATE POLICY "Published speaking tests are readable" ON "speaking_tests" AS PERMISSIVE FOR SELECT TO public;
*/