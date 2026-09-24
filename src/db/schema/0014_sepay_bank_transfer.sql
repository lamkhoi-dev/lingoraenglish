-- SePay bank transfer as a second payment method alongside Stripe (2026-09-22).
--
-- A paid bank_transfer_orders row does NOT get its own access-control logic: once the SePay
-- webhook (or an admin's manual confirm) marks it paid, the same handler upserts an ordinary
-- row into `subscriptions` (provider_subscription_id = "sepay_<order id>", provider_customer_id
-- = "sepay_user_<user id>") — every existing function (has_active_subscription, effective_tier,
-- the billing pages) keeps working completely unchanged, exactly like the Paddle → Stripe move.
--
-- VND has no live price feed here: monthly_amount_vnd/yearly_amount_vnd are plain, admin-editable
-- integers (VND has no decimals) seeded below from a rough ~25,500 VND/USD rate, rounded to a
-- normal-looking Vietnamese price. Confirm/adjust the real numbers before taking real transfers.
--
-- Written to be safe to run more than once.

ALTER TABLE "public"."billing_plans"
  ADD COLUMN IF NOT EXISTS "monthly_amount_vnd" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "yearly_amount_vnd" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

UPDATE "public"."billing_plans" SET "monthly_amount_vnd" = 250000, "yearly_amount_vnd" = 2040000
  WHERE "plan_key" = 'premium' AND "monthly_amount_vnd" = 0;
--> statement-breakpoint

UPDATE "public"."billing_plans" SET "monthly_amount_vnd" = 510000, "yearly_amount_vnd" = 4080000
  WHERE "plan_key" = 'ielts_pro' AND "monthly_amount_vnd" = 0;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "public"."bank_transfer_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "plan_key" text NOT NULL,
  "price_id" text NOT NULL,
  "product_id" text NOT NULL,
  "billing_interval" text NOT NULL,
  "amount_vnd" integer NOT NULL,
  -- Shown to the customer and put in the transfer content; SePay's "code" field (parsed from the
  -- bank's free-text transfer content) is matched against this to know which order got paid.
  "reference_code" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "sepay_transaction_id" text,
  "paid_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bank_transfer_orders_status_check" CHECK (status IN ('pending','paid','expired','cancelled')),
  CONSTRAINT "bank_transfer_orders_reference_code_key" UNIQUE ("reference_code")
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transfer_orders_user_id_fkey') THEN
    ALTER TABLE "public"."bank_transfer_orders"
      ADD CONSTRAINT "bank_transfer_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_bank_transfer_orders_user_id" ON "public"."bank_transfer_orders" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bank_transfer_orders_status" ON "public"."bank_transfer_orders" USING btree ("status");
--> statement-breakpoint

ALTER TABLE "public"."bank_transfer_orders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "own bank transfer orders" ON "public"."bank_transfer_orders";
--> statement-breakpoint
CREATE POLICY "own bank transfer orders" ON "public"."bank_transfer_orders" AS PERMISSIVE FOR SELECT TO "authenticated"
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));
--> statement-breakpoint

DROP POLICY IF EXISTS "admin manage bank transfer orders" ON "public"."bank_transfer_orders";
--> statement-breakpoint
CREATE POLICY "admin manage bank transfer orders" ON "public"."bank_transfer_orders" AS PERMISSIVE FOR ALL TO "authenticated"
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
