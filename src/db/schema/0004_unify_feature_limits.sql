-- Yêu cầu 9 (Hệ thống gói trả phí dùng chung): trước migration này, "bao
-- nhiêu là free" cho mỗi tính năng nằm rải rác ở 6-7 chỗ khác nhau — bảng
-- coach_settings riêng, hằng số FREE_SOUND_COUNT hard-code trong
-- pronunciation-content.ts, và 3 admin action gần như copy-paste nhau
-- (adminSetShadowFreeCount/adminSetPronunciationFreeCount/
-- adminSetVocabularyFreeCount) — không có "một cơ chế duy nhất, cấu hình
-- tập trung" như khách yêu cầu. Từ nay billing_plans.limits (đã tồn tại sẵn,
-- đã có UI admin chung ở tab "Plans" — xem plan-admin.functions.ts) là nơi
-- DUY NHẤT chứa các con số này; entitlements.server.ts đọc từ đây và mọi
-- tính năng gọi qua đó thay vì tự giữ ngưỡng riêng.
--
-- coach_free_turns_lifetime/coach_monthly_turns migrate nguyên giá trị đang
-- chạy thật từ coach_settings (không đoán số — nếu admin chưa từng đổi,
-- coach_settings vẫn ở giá trị mặc định nên phép self-migrate này luôn đúng).
-- Các số còn lại lấy đúng theo audit khách hàng 2026-09-14 (xem CLAUDE.md):
-- shadowing 4/level/topic, pronunciation lessons 5/skill, 44-sound 3, vocabulary
-- 10/category, listening 6/7 category, speaking tests 1/part (3 đề, dàn đều
-- Part 1/2/3). Bảng coach_settings CHƯA bị xoá ở migration này — giữ lại làm
-- lưới an toàn, dự kiến DROP ở một migration sau khi xác nhận ổn trên production.

UPDATE "billing_plans"
SET "limits" = "limits" || jsonb_build_object(
  'coach_free_turns_lifetime', COALESCE((SELECT "free_turn_limit" FROM "coach_settings" WHERE "id" = 'default'), 3),
  'shadowing_free_per_topic_level', 4,
  'pronunciation_lessons_free_per_skill', 5,
  'pronunciation_sounds_free_count', 3,
  'vocabulary_free_per_category', 10,
  'listening_free_categories', 6,
  'speaking_tests_free_per_part', 1
)
WHERE "tier" = 'free';--> statement-breakpoint

UPDATE "billing_plans"
SET "limits" = "limits" || jsonb_build_object(
  'coach_monthly_turns', COALESCE((SELECT "premium_monthly_turns" FROM "coach_settings" WHERE "id" = 'default'), 0)
)
WHERE "tier" = 'premium';--> statement-breakpoint

UPDATE "billing_plans"
SET "limits" = "limits" || jsonb_build_object(
  'coach_monthly_turns', COALESCE((SELECT "pro_monthly_turns" FROM "coach_settings" WHERE "id" = 'default'), 0)
)
WHERE "tier" = 'ielts_pro';
