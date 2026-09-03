begin;

drop function public.set_order_label(uuid, public.order_label, timestamptz, text);

create function public.set_order_label(
  p_order_id uuid,
  p_label public.order_label,
  p_expected_updated_at timestamptz
)
returns table (
  order_id uuid,
  label public.order_label,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
begin
  actor := public.pr1a_assert_actor(array['super_admin', 'admin', 'attention', 'employee']::public.app_role[]);

  if p_order_id is null or p_expected_updated_at is null then
    raise exception 'La etiqueta del pedido no es válida.';
  end if;

  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'El pedido seleccionado no existe.';
  end if;

  if target_order.lifecycle_state <> 'active' then
    raise exception 'Solo se pueden etiquetar pedidos activos.';
  end if;

  if target_order.updated_at <> p_expected_updated_at then
    raise exception 'El pedido cambió en otra sesión. Actualizá el tablero e intentá nuevamente.';
  end if;

  if target_order.label is not distinct from p_label then
    raise exception 'El pedido ya tiene esa etiqueta.';
  end if;

  update public.orders as order_row
  set label = p_label,
      updated_at = now()
  where order_row.id = target_order.id
  returning order_row.id, order_row.label, order_row.updated_at into order_id, label, updated_at;

  return next;
end;
$$;

revoke all on function public.set_order_label(uuid, public.order_label, timestamptz) from public, anon, authenticated;
grant execute on function public.set_order_label(uuid, public.order_label, timestamptz) to authenticated;

commit;
