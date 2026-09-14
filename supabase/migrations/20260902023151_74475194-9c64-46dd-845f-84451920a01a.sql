-- =============================== billing_plans
create table public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null unique,
  tier text not null unique,
  name text not null,
  tagline text not null default '',
  badge text not null default '',
  monthly_price_id text not null default '',
  yearly_price_id text not null default '',
  monthly_amount integer not null default 0,
  yearly_amount integer not null default 0,
  currency text not null default 'USD',
  features jsonb not null default '[]'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  trial_enabled boolean not null default false,
  trial_days integer not null default 7,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.billing_plans to anon;
grant select, insert, update, delete on public.billing_plans to authenticated;
grant all on public.billing_plans to service_role;
alter table public.billing_plans enable row level security;

create policy "Anyone can read active plans" on public.billing_plans
  for select using (is_active or public.has_role(auth.uid(), 'admin'));
create policy "Admins manage plans" on public.billing_plans
  for all to authenticated using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create trigger billing_plans_touch before update on public.billing_plans
  for each row execute function public.touch_updated_at();

-- =============================== subscriptions
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paddle_subscription_id text not null unique,
  paddle_customer_id text not null,
  product_id text not null,
  price_id text not null,
  status text not null default 'active',
  billing_interval text not null default 'month',
  currency text not null default 'USD',
  amount integer,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  scheduled_change text not null default '',
  trial_ends_at timestamptz,
  environment text not null default 'sandbox',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_subscriptions_user_id on public.subscriptions(user_id);
create index idx_subscriptions_paddle_id on public.subscriptions(paddle_subscription_id);

grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;

create policy "Users read own subscription" on public.subscriptions
  for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- =============================== complimentary_access
create table public.complimentary_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null,
  expires_at timestamptz,
  note text not null default '',
  granted_by uuid references auth.users(id) on delete set null,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_comp_access_user on public.complimentary_access(user_id);

grant select, insert, update, delete on public.complimentary_access to authenticated;
grant all on public.complimentary_access to service_role;
alter table public.complimentary_access enable row level security;

create policy "Users read own complimentary access" on public.complimentary_access
  for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "Admins manage complimentary access" on public.complimentary_access
  for all to authenticated using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create trigger complimentary_access_touch before update on public.complimentary_access
  for each row execute function public.touch_updated_at();

-- =============================== usage_counters
create table public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  period_start date not null,
  units integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, capability, period_start)
);

create index idx_usage_counters_user on public.usage_counters(user_id, period_start);

grant select on public.usage_counters to authenticated;
grant all on public.usage_counters to service_role;
alter table public.usage_counters enable row level security;

create policy "Users read own usage" on public.usage_counters
  for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create trigger usage_counters_touch before update on public.usage_counters
  for each row execute function public.touch_updated_at();

-- =============================== billing_events
create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  plan_key text not null default '',
  interval_key text not null default '',
  environment text not null default 'sandbox',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_billing_events_event on public.billing_events(event, created_at desc);

grant select on public.billing_events to authenticated;
grant all on public.billing_events to service_role;
alter table public.billing_events enable row level security;

create policy "Admins read billing events" on public.billing_events
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- =============================== admin_audit_log
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_admin_audit_created on public.admin_audit_log(created_at desc);

grant select on public.admin_audit_log to authenticated;
grant all on public.admin_audit_log to service_role;
alter table public.admin_audit_log enable row level security;

create policy "Admins read audit log" on public.admin_audit_log
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- =============================== helper functions
create or replace function public.has_active_subscription(user_uuid uuid, check_env text default 'live')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = user_uuid
      and environment = check_env
      and (
        (status in ('active', 'trialing', 'past_due')
          and (current_period_end is null or current_period_end > now()))
        or (status = 'canceled' and current_period_end > now())
      )
  );
$$;

create or replace function public.effective_tier(_user_id uuid, check_env text default 'live')
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
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
      (s.status in ('active', 'trialing', 'past_due')
        and (s.current_period_end is null or s.current_period_end > now()))
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
$$;

-- =============================== seed plans
insert into public.billing_plans
  (plan_key, tier, name, tagline, badge, monthly_price_id, yearly_price_id, monthly_amount, yearly_amount, features, limits, trial_enabled, trial_days, sort_order)
values
  ('free', 'free', 'Free', 'Start learning English with LiLy today.', '', '', '', 0, 0,
   '["Limited vocabulary","Limited grammar","Limited listening","Limited AI speaking","Limited AI conversation","Limited pronunciation practice","Basic progress tracking"]'::jsonb,
   '{"speaking_minutes":10,"conversations":10,"pronunciation":20,"ielts_analyses":0,"stt_requests":40,"tts_requests":100}'::jsonb,
   false, 0, 1),
  ('premium', 'premium', 'LiLy AI Premium', 'Everything you need for confident everyday English.', 'MOST POPULAR',
   'lily_premium_monthly', 'lily_premium_yearly', 999, 7999,
   '["Expanded AI speaking","AI conversation with LiLy","Pronunciation coach","Full vocabulary library","Grammar coach","Listening practice","Personalised AI learning plan","Speaking history","Progress tracking","More AI practice minutes","Advanced feedback"]'::jsonb,
   '{"speaking_minutes":300,"conversations":200,"pronunciation":300,"ielts_analyses":0,"stt_requests":1200,"tts_requests":3000}'::jsonb,
   true, 7, 2),
  ('ielts_pro', 'ielts_pro', 'LiLy AI IELTS Pro', 'Everything in Premium plus the AI IELTS examiner.', 'BEST FOR IELTS',
   'lily_ielts_monthly', 'lily_ielts_yearly', 1999, 15999,
   '["Everything in Premium","IELTS Speaking Part 1","IELTS Speaking Part 2","IELTS Speaking Part 3","AI IELTS practice examiner","AI-estimated band score","Detailed IELTS feedback","Band 6 to 7 improvement","Band 7 to 8 improvement","IELTS speaking history","Personalised IELTS learning plan"]'::jsonb,
   '{"speaking_minutes":500,"conversations":400,"pronunciation":500,"ielts_analyses":200,"stt_requests":2000,"tts_requests":5000}'::jsonb,
   true, 7, 3);