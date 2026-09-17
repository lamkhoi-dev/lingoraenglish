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
--
-- Only rows still sitting on the column default (0) are numbered, and they
-- are numbered AFTER whatever the category already uses. The first version of
-- this migration renumbered every row unconditionally, which on a database
-- where the columns and the constraint had already been added by hand (i.e.
-- production) did two bad things: it failed outright, because renumbering
-- row by row collides with the rows that still hold the target numbers under
-- the non-deferrable unique constraint — and had it succeeded it would have
-- reordered all 1.900+ real words by created_at, silently changing which ten
-- words of each topic are the free ones (sort_order is what the free rank is
-- computed from). Guarded like this the statement is a no-op on a database
-- that is already correct, and still does the bootstrap job on a fresh one.
UPDATE "vocabulary_words" v
SET "sort_order" = ranked.rn + coalesce(ranked.max_taken, 0)
FROM (
  SELECT
    w.id,
    row_number() OVER (PARTITION BY w.category ORDER BY w.created_at) AS rn,
    taken.max_taken
  FROM "vocabulary_words" w
  LEFT JOIN (
    SELECT category, max(sort_order) AS max_taken
    FROM "vocabulary_words"
    WHERE sort_order > 0
    GROUP BY category
  ) taken ON taken.category = w.category
  WHERE w.sort_order = 0
) ranked
WHERE v.id = ranked.id;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vocabulary_words_category_sort_order_key') THEN
    ALTER TABLE "vocabulary_words" ADD CONSTRAINT "vocabulary_words_category_sort_order_key" UNIQUE ("category", "sort_order");
  END IF;
END $$;--> statement-breakpoint

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
