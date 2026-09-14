create or replace function public.tier_rank(_tier text)
returns integer
language sql
immutable
set search_path = public
as $$ select case _tier when 'ielts_pro' then 2 when 'premium' then 1 else 0 end $$;