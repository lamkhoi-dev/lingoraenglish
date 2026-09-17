-- Yêu cầu 11 (Thanh toán) — the two acceptance criteria the code did not meet.
--
-- 1. "Gửi lại cùng một thông báo thanh toán nhiều lần không làm sai dữ liệu."
--    Paddle redelivers an event whenever the endpoint times out or answers
--    non-2xx — and webhook.ts answers 400 on any handler error, so retries are
--    part of this endpoint's own contract. Nothing deduplicated them: every
--    delivery ran logBillingEvent(), an unconditional INSERT, and
--    adminBillingOverview() derives totalRevenue / recentPayments /
--    failedPayments by summing exactly those rows — so a single retry inflated
--    the admin revenue figures. The webhook now claims each provider event_id
--    here before running any handler, and drops the delivery if the claim
--    fails. A handler that throws releases its claim again so Paddle's retry
--    can still get through.
--
-- 2. "Lịch sử thanh toán vẫn xem được cả khi cổng thanh toán tạm thời gián
--    đoạn." listMyPayments() read the provider live and returned an empty list
--    when that call failed, which /billing renders identically to "never paid
--    anything". The webhook now also stores each payment's display fields in
--    billing_events.metadata so the page can fall back to them; the index below
--    keeps that per-learner lookup off a sequential scan.

CREATE TABLE IF NOT EXISTS "processed_webhook_events" (
	"event_id" text NOT NULL,
	"environment" text DEFAULT 'sandbox' NOT NULL,
	"event_type" text DEFAULT '' NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("event_id","environment")
);
--> statement-breakpoint
ALTER TABLE "processed_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- drizzle-kit models pgPolicy but never GRANT — a brand-new table inherits
-- nothing, and Postgres checks table GRANTs before RLS policies even run. See
-- db/0005_pronunciation_lessons_grants.sql for the production outage that
-- caused last time. Only the webhook touches this table, through withAdmin()
-- (= service_role), so no anon/authenticated grant and no policy is needed.
GRANT ALL ON TABLE "public"."processed_webhook_events" TO "lingora";--> statement-breakpoint
GRANT ALL ON TABLE "public"."processed_webhook_events" TO "service_role";--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_billing_events_user_event" ON "billing_events" USING btree ("user_id","event","created_at" DESC);
--> statement-breakpoint

-- 3. "Có chính sách xử lý khi thanh toán thất bại, bao gồm thời gian ân hạn NẾU
--    CÓ" (Yêu cầu 11). Vấn đề 4 of the spec deliberately leaves the number to
--    the customer, and KE_HOACH_BAN_GIAO_TASKS.md's rule is "không đoán thay
--    khách hàng" — so this adds the mechanism, not a policy: grace_period_days
--    is seeded at 0, which reproduces today's behaviour exactly (access ends
--    when the paid period ends). Once the customer answers VĐ#4 it is one
--    number in /admin → Plans, no code change and no deploy.
--
--    Why it has to exist at all: the old rule granted access while status was
--    past_due AND current_period_end was still in the future. Whether Paddle
--    leaves current_period_end in the future during dunning is an undocumented
--    detail, so how many days of grace a learner actually got was accidental
--    and unverifiable. Now the window is stated in one place.
CREATE OR REPLACE FUNCTION public.grace_days(_limits jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  -- Regex-guarded: limits is admin-editable free text, and a bad cast inside a
  -- function this widely used (can_access_tier -> every RLS content policy)
  -- would take content reads down app-wide.
  SELECT CASE WHEN _limits->>'grace_period_days' ~ '^[0-9]+$'
              THEN least((_limits->>'grace_period_days')::int, 365)
              ELSE 0 END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.effective_tier(_user_id uuid, check_env text DEFAULT 'live')
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
declare
  rank_paid integer := 0;
  rank_comp integer := 0;
  paid_tier text;
  comp_tier text;
begin
  select p.tier into paid_tier
  from public.subscriptions s
  join public.billing_plans p
    on p.monthly_price_id = s.price_id or p.yearly_price_id = s.price_id
  where s.user_id = _user_id
    and s.environment = check_env
    and (
      -- Paddle's own guidance is that active/trialing/past_due all keep access;
      -- past_due means it is still retrying the card, not that the learner left.
      (s.status in ('active', 'trialing', 'past_due')
        and (s.current_period_end is null
             or s.current_period_end + make_interval(days => public.grace_days(p.limits)) > now()))
      -- Cancelled keeps exactly what was paid for, never the grace window.
      or (s.status = 'canceled' and s.current_period_end > now())
    )
  order by case p.tier when 'ielts_pro' then 2 when 'premium' then 1 else 0 end desc
  limit 1;

  select c.tier into comp_tier
  from public.complimentary_access c
  where c.user_id = _user_id
    and not c.revoked
    and (c.expires_at is null or c.expires_at > now())
  order by case c.tier when 'ielts_pro' then 2 when 'premium' then 1 else 0 end desc
  limit 1;

  rank_paid := case paid_tier when 'ielts_pro' then 2 when 'premium' then 1 else 0 end;
  rank_comp := case comp_tier when 'ielts_pro' then 2 when 'premium' then 1 else 0 end;

  if rank_comp > rank_paid then
    return coalesce(comp_tier, 'free');
  end if;
  return coalesce(paid_tier, 'free');
end;
$$;--> statement-breakpoint

-- Same rule, one definition apart: this is what billing.functions.ts now calls
-- for "did the purchase land", replacing a fourth hand-written copy of it.
-- LEFT JOIN so a subscription whose price no longer maps to a plan still counts
-- (with no grace) instead of silently dropping out.
CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid uuid, check_env text DEFAULT 'live')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select exists (
    select 1
    from public.subscriptions s
    left join public.billing_plans p
      on p.monthly_price_id = s.price_id or p.yearly_price_id = s.price_id
    where s.user_id = user_uuid
      and s.environment = check_env
      and (
        (s.status in ('active', 'trialing', 'past_due')
          and (s.current_period_end is null
               or s.current_period_end + make_interval(days => public.grace_days(p.limits)) > now()))
        or (s.status = 'canceled' and s.current_period_end > now())
      )
  );
$$;--> statement-breakpoint

-- 0 = today's behaviour. The admin Plans tab picks the key up from LIMIT_KEYS.
UPDATE "billing_plans"
SET "limits" = jsonb_build_object('grace_period_days', 0) || "limits"
WHERE NOT ("limits" ? 'grace_period_days');--> statement-breakpoint

-- 4. /checkout/success polls verifyCheckout and logs subscription_activated on
--    every confirmed poll, so one refresh of that page added another row and
--    skewed adminBillingOverview's funnel. One activation per subscription.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_billing_events_activation_once"
  ON "billing_events" ("user_id", ("metadata"->>'subscriptionId'))
  WHERE "event" = 'subscription_activated';
