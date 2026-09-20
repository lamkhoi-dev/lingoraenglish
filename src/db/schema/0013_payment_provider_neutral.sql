-- Payments moved from Paddle to Stripe (2026-09-20). Two things change in the database:
--
-- 1. subscriptions.paddle_subscription_id / paddle_customer_id are renamed to provider-neutral
--    names (the values are now Stripe's sub_… / cus_… ids), together with the index and unique
--    constraint that hang off them. Nothing else references these columns: the access-control
--    SQL functions (has_active_subscription, effective_tier…) only read status/period/price_id.
--
-- 2. Rows written while Paddle's sandbox was in use hold Paddle ids ("sub_01…"), which Stripe
--    cannot manage. They are moved out of the "sandbox" environment so they stop counting as
--    Stripe test subscriptions; the rows are kept, not deleted. Stripe subscription ids are
--    "sub_1…" so the two can never be confused. "live" rows are untouched (only the seeded
--    demo accounts exist there, with fake "demo_sub_…" ids).
--
-- Written to be safe to run more than once (see the migration lessons in CLAUDE.md).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'paddle_subscription_id') THEN
    ALTER TABLE "public"."subscriptions" RENAME COLUMN "paddle_subscription_id" TO "provider_subscription_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'paddle_customer_id') THEN
    ALTER TABLE "public"."subscriptions" RENAME COLUMN "paddle_customer_id" TO "provider_customer_id";
  END IF;
END $$;
--> statement-breakpoint

ALTER INDEX IF EXISTS "public"."idx_subscriptions_paddle_id" RENAME TO "idx_subscriptions_provider_id";
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_paddle_subscription_id_key') THEN
    ALTER TABLE "public"."subscriptions"
      RENAME CONSTRAINT "subscriptions_paddle_subscription_id_key" TO "subscriptions_provider_subscription_id_key";
  END IF;
END $$;
--> statement-breakpoint

UPDATE "public"."subscriptions"
SET "environment" = 'legacy_paddle_sandbox'
WHERE "environment" = 'sandbox' AND "provider_subscription_id" LIKE 'sub\_01%';
