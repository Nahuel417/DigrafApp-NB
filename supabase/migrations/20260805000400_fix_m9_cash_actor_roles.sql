create or replace function public.cash_current_actor_is_operational()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('super_admin', 'admin', 'attention')
      and is_active
      and not must_change_password
  );
$$;

revoke all on function public.cash_current_actor_is_operational() from public, anon, authenticated;
grant execute on function public.cash_current_actor_is_operational() to authenticated;
