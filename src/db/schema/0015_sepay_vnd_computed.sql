-- The customer wants a single maintained price (USD, billing_plans.monthly_amount/yearly_amount)
-- rather than a separate VND price list — a bank-transfer order now converts that USD amount at
-- checkout time (see usdCentsToVnd in sepay.server.ts) instead of reading a stored VND column.
-- Drops the columns 0014 added, since nothing reads them any more.
--
-- Written to be safe to run more than once.

ALTER TABLE "public"."billing_plans"
  DROP COLUMN IF EXISTS "monthly_amount_vnd",
  DROP COLUMN IF EXISTS "yearly_amount_vnd";
