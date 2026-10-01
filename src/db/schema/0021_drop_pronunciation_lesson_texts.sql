-- 0020 added a dedicated table for lesson translations; the customer chose
-- to use the standard i18n store (ui_translations, keys "pronlesson.<id>|...")
-- instead, so the table is dropped (it never held data). Idempotent.
DROP TABLE IF EXISTS "public"."pronunciation_lesson_texts";
