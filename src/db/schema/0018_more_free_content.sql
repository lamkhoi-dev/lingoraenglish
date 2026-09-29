-- Customer request 2026-09-30: more free content.
--   * Speaking Tests: 3 free per IELTS part (was 1), 3 free each for TOEFL
--     and PTE (was 0).
--   * Pronunciation 44 Sounds: 5 free sounds (was 3), matching the 5 free
--     examples per skill the 8 advanced skills already had.
-- Numbers live in billing_plans.limits (single source of truth); the is_free
-- flags are then re-ranked exactly like entitlements.server.ts
-- resyncContentFreeRanks() does after an admin saves the Plans tab.
-- Idempotent: safe to re-run.
UPDATE "billing_plans"
SET "limits" = "limits" || jsonb_build_object(
  'speaking_tests_free_per_part', 3,
  'speaking_tests_free_toefl_pte', 3,
  'pronunciation_sounds_free_count', 5
)
WHERE "tier" = 'free';--> statement-breakpoint

UPDATE "speaking_tests" t
SET "is_free" = (ranked.rn <= 3)
FROM (
  SELECT id, row_number() OVER (PARTITION BY part ORDER BY sort_order, created_at) AS rn
  FROM "speaking_tests"
  WHERE status = 'published' AND exam = 'ielts'
) ranked
WHERE t.id = ranked.id AND t."is_free" IS DISTINCT FROM (ranked.rn <= 3);--> statement-breakpoint

UPDATE "speaking_tests" t
SET "is_free" = (ranked.rn <= 3)
FROM (
  SELECT id, row_number() OVER (PARTITION BY exam ORDER BY sort_order, created_at) AS rn
  FROM "speaking_tests"
  WHERE status = 'published' AND exam <> 'ielts'
) ranked
WHERE t.id = ranked.id AND t."is_free" IS DISTINCT FROM (ranked.rn <= 3);
