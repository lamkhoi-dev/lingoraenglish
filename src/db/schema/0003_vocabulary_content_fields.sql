-- Yêu cầu 7 (Vocabulary): adds the two columns the spec's per-word fields
-- need that vocabulary_words didn't have yet — sort_order (explicit
-- easy → hard ranking within a category, also what "first 10 free" is
-- computed from by the loader) and usage_context (the "ngữ cảnh sử dụng"
-- field). GRANTs already exist on this table from its original migration
-- (unlike the brand-new pronunciation_lessons table that hit the missing-
-- GRANT bug — see roadmap.md), so plain ALTER TABLE is enough here.
ALTER TABLE "vocabulary_words" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vocabulary_words" ADD COLUMN IF NOT EXISTS "usage_context" text DEFAULT '' NOT NULL;--> statement-breakpoint

-- Backfill sort_order for whatever rows already exist (the 18 placeholder
-- demo words) so the unique constraint below can be added safely.
UPDATE "vocabulary_words" v
SET "sort_order" = ranked.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY category ORDER BY created_at) AS rn
  FROM "vocabulary_words"
) ranked
WHERE v.id = ranked.id;--> statement-breakpoint

ALTER TABLE "vocabulary_words" ADD CONSTRAINT "vocabulary_words_category_sort_order_key" UNIQUE ("category", "sort_order");--> statement-breakpoint

-- The 18 old placeholder rows use category values ("Daily English", the
-- column default) that don't match the canonical VOCAB_CATEGORIES spelling
-- (src/lib/ipa-data.ts) the new 100-word-per-category content uses, so they
-- won't be reached/updated by the loader's ON CONFLICT (category,
-- sort_order) upsert. Retiring them as drafts here avoids leaving stray,
-- unfilterable rows behind once real content lands (they stay in the table
-- for reference, just out of the published list — the codebase's normal
-- "soft delete" convention, see shadowing/pronunciation admin). Scoped to
-- non-canonical categories (rather than every published row) so re-running
-- this migration after real content has loaded is a no-op, not a regression.
UPDATE "vocabulary_words" SET "status" = 'draft'
WHERE "status" = 'published' AND "category" NOT IN (
  'Everyday English', 'Family', 'Food & Drinks', 'Shopping', 'Travel',
  'Work & Office', 'School', 'Health', 'Business English', 'Customer Service',
  'Technology', 'Relationships', 'Hobbies', 'Phrasal Verbs', 'Idioms',
  'Commonly Confused Words', 'IELTS Vocabulary', 'TOEIC Vocabulary'
);
