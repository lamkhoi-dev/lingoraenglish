create unique index if not exists coach_turns_session_turn_uq on public.coach_turns (session_id, turn_number);

create or replace function public.coach_reserve_turn(_session_id uuid, _limit integer, _count_free boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
  used integer;
  next_turn integer;
begin
  if uid is null then raise exception 'Not signed in'; end if;

  select user_id into owner from public.coach_sessions where id = _session_id;
  if owner is null or owner <> uid then raise exception 'Session not found'; end if;

  perform pg_advisory_xact_lock(hashtext(uid::text));

  if _count_free then
    select count(*) into used from public.coach_turns where user_id = uid and counted_free;
    if _limit > 0 and used >= _limit then raise exception 'turn_limit_reached'; end if;
  end if;

  select coalesce(max(turn_number), 0) + 1 into next_turn
  from public.coach_turns where session_id = _session_id;

  insert into public.coach_turns (session_id, user_id, turn_number, user_text, coach_text, counted_free)
  values (_session_id, uid, next_turn, '', '', _count_free);

  update public.coach_sessions set user_turns = next_turn where id = _session_id;
  return next_turn;
end;
$$;

revoke all on function public.coach_reserve_turn(uuid, integer, boolean) from public, anon;
grant execute on function public.coach_reserve_turn(uuid, integer, boolean) to authenticated;