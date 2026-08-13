create or replace function public.assert_paid_order_editable(
  p_order_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
  stage_code text;
begin
  select profile.role into actor_role
  from public.profiles profile
  where profile.id = p_actor_id
    and profile.is_active
    and not profile.must_change_password;

  if not found then
    raise exception 'No tenés permiso para editar pedidos pagados.';
  end if;

  select stage.code into stage_code
  from public.orders target_order
  join public.workflow_stages stage on stage.id = target_order.current_stage_id
  where target_order.id = p_order_id;

  if stage_code = 'paid' and actor_role not in ('super_admin', 'admin') then
    raise exception 'Los pedidos Pagados solo pueden ser editados por Administrador o Superadministrador.';
  end if;
end;
$$;

revoke all on function public.assert_paid_order_editable(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assert_paid_order_editable(uuid, uuid) to service_role;

create or replace function public.enforce_paid_order_edit_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid;
  actor_id uuid;
begin
  if tg_table_name = 'orders' then
    if tg_op = 'UPDATE' and exists (
      select 1
      from public.workflow_stages stage
      where stage.id = old.current_stage_id
        and stage.code = 'paid'
    ) then
      target_order_id := old.id;
      actor_id := (select auth.uid());
    end if;
  elsif tg_table_name = 'order_design_images' then
    target_order_id := new.order_id;
    actor_id := new.uploaded_by;
  end if;

  if target_order_id is not null then
    perform public.assert_paid_order_editable(target_order_id, actor_id);
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_paid_order_edit_lock() from public, anon, authenticated;
grant execute on function public.enforce_paid_order_edit_lock() to service_role;

create trigger enforce_paid_order_edit_lock_on_orders
before update on public.orders
for each row execute function public.enforce_paid_order_edit_lock();

create trigger enforce_paid_order_edit_lock_on_design_images
before insert or update on public.order_design_images
for each row execute function public.enforce_paid_order_edit_lock();
