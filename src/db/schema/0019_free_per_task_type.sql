-- Customer request 2026-09-30: TOEFL and PTE free tests are now counted per
-- TASK TYPE (3 free for each of Listen & Repeat / Take an Interview /
-- Independent Speaking / Integrated Summary, and for each PTE task), not 3
-- per exam. Same re-rank resyncContentFreeRanks() now does (partition by
-- exam, task_type). Idempotent.
UPDATE "speaking_tests" t
SET "is_free" = (ranked.rn <= 3)
FROM (
  SELECT id, row_number() OVER (PARTITION BY exam, task_type ORDER BY sort_order, created_at) AS rn
  FROM "speaking_tests"
  WHERE status = 'published' AND exam <> 'ielts'
) ranked
WHERE t.id = ranked.id AND t."is_free" IS DISTINCT FROM (ranked.rn <= 3);
