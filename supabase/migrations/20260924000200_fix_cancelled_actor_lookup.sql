begin;
set local search_path = '';

create or replace function public.get_cancelled_order_actor_names(p_order_ids uuid[])
returns table (id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  select * into actor
  from public.profiles
  where public.profiles.id = (select auth.uid());

  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para consultar los actores del Archivo.';
  end if;

  return query
  select distinct profile.id as id, profile.display_name as display_name
  from public.orders target_order
  join public.profiles profile on profile.id = target_order.cancelled_by
  where target_order.lifecycle_state = 'cancelled'
    and target_order.id = any(coalesce(p_order_ids, array[]::uuid[]));
end;
$$;

revoke all on function public.get_cancelled_order_actor_names(uuid[]) from public, anon;
grant execute on function public.get_cancelled_order_actor_names(uuid[]) to authenticated;

commit;
