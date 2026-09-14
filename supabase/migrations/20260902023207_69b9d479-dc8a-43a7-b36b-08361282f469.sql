revoke all on function public.has_active_subscription(uuid, text) from public, anon, authenticated;
revoke all on function public.effective_tier(uuid, text) from public, anon, authenticated;
grant execute on function public.has_active_subscription(uuid, text) to service_role;
grant execute on function public.effective_tier(uuid, text) to service_role;