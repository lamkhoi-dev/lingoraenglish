-- drizzle-kit generate produced a much larger diff here (auth tables,
-- shadowing dialogue columns, coach_turns.analysis) because those were
-- applied by hand via db/0001-0004_*.sql, outside drizzle-kit's own
-- snapshot tracking — this repo's journal/snapshot files are now caught up
-- to schema.ts (good for future `generate` runs), but the .sql below has
-- been trimmed by hand to only the two columns that are actually new on
-- production: pronunciation_scores.clear_runs / .mastered (Pronunciation
-- "Mastered" step, previously only a client-side counter that reset on
-- every remount — see CLAUDE.md).
ALTER TABLE "pronunciation_scores" ADD COLUMN IF NOT EXISTS "clear_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pronunciation_scores" ADD COLUMN IF NOT EXISTS "mastered" boolean DEFAULT false NOT NULL;
