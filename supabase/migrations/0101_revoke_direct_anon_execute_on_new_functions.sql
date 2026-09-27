-- Supabase's default privileges grant EXECUTE directly to anon and
-- authenticated when a function is created. REVOKE FROM public in 0100
-- did not remove those direct grants. Keep only the intended callers.

revoke execute on function public.clear_own_must_change_password()
  from public, anon;
grant execute on function public.clear_own_must_change_password()
  to authenticated;

revoke execute on function public.rate_limit_try_reserve(text, text, int, int)
  from public, anon, authenticated;
revoke execute on function public.rate_limit_record_failure(text, text, int, int)
  from public, anon, authenticated;
grant execute on function public.rate_limit_try_reserve(text, text, int, int)
  to service_role;
grant execute on function public.rate_limit_record_failure(text, text, int, int)
  to service_role;
