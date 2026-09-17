-- Mục 3.2 "Theo dõi và kiểm soát chi phí".
--
-- ai_usage_log already recorded which feature called, when, and how many
-- tokens — but not what it cost, so none of "chi phí ước tính", "ngưỡng cảnh
-- báo" or "giới hạn chi phí theo ngày" could be answered. Cost is stored per
-- row (not derived at read time) because model prices change: a row must keep
-- the price that applied when the call was made.
--
-- Stored in micro-USD as an integer. Money must not be summed as floating
-- point, and a single call can cost a tiny fraction of a cent — micro-USD
-- keeps whole numbers for both.
ALTER TABLE "ai_usage_log"
  ADD COLUMN IF NOT EXISTS "estimated_cost_micro_usd" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

-- Daily spend is read on every AI call (the cap) and by the admin report, so
-- it gets its own index rather than scanning the whole log each time.
CREATE INDEX IF NOT EXISTS "idx_ai_usage_log_created"
  ON "ai_usage_log" ("created_at" DESC);
--> statement-breakpoint

-- One row, edited by an admin — the same "one place for every number" rule
-- Yêu cầu 9 applies to plan limits. Nulls mean "no limit configured".
CREATE TABLE IF NOT EXISTS "ai_cost_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"daily_budget_micro_usd" integer,
	"alert_threshold_percent" integer DEFAULT 80 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_cost_settings_single_row" CHECK (id)
);
--> statement-breakpoint
ALTER TABLE "ai_cost_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- drizzle-kit never emits GRANTs — see db/0005_pronunciation_lessons_grants.sql.
GRANT ALL ON TABLE "public"."ai_cost_settings" TO "lingora";--> statement-breakpoint
GRANT ALL ON TABLE "public"."ai_cost_settings" TO "service_role";--> statement-breakpoint

-- Seeded with no budget so deploying this changes no behaviour: the cap only
-- starts applying once an admin sets a real number (same approach as
-- grace_period_days in 0007 — ship the mechanism, let the customer pick it).
INSERT INTO "ai_cost_settings" ("id", "daily_budget_micro_usd", "alert_threshold_percent")
VALUES (true, NULL, 80)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

-- Mục 3.5: "Ghi nhật ký các sự kiện quan trọng: đăng ký, đăng nhập..."
-- Payments/upgrades/cancellations already land in billing_events and admin
-- actions in admin_audit_log; sign-up and sign-in had no trail of their own
-- (only an auth.sessions row, which says nothing about attempts that failed).
-- Failed and rate-limited attempts are the useful half for spotting an attack,
-- so they are recorded too.
--
-- No email column: the address is hashed into the rate-limit bucket and the
-- user_id is here when the account is known, which is enough to trace an
-- incident without turning the log itself into a list of customer addresses.
CREATE TABLE IF NOT EXISTS "auth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event" text NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

GRANT ALL ON TABLE "public"."auth_events" TO "lingora";--> statement-breakpoint
GRANT ALL ON TABLE "public"."auth_events" TO "service_role";--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_auth_events_created" ON "auth_events" ("created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auth_events_user" ON "auth_events" ("user_id","created_at" DESC);
