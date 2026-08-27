begin;

create or replace function public.move_order(
  p_order_id uuid,
  p_from_stage_id uuid,
  p_to_stage_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns table (
  order_id uuid,
  public_number bigint,
  from_stage_id uuid,
  to_stage_id uuid,
  stage_code text,
  updated_at timestamptz,
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  source_stage public.workflow_stages%rowtype;
  destination_stage public.workflow_stages%rowtype;
  existing_event public.order_stage_events%rowtype;
  request_fingerprint text;
  new_event_id uuid;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role not in ('super_admin', 'admin', 'attention', 'employee') then
    raise exception 'No tenés permiso para mover pedidos.';
  end if;

  if p_order_id is null
    or p_from_stage_id is null
    or p_to_stage_id is null
    or p_expected_updated_at is null then
    raise exception 'La solicitud de movimiento no es válida.';
  end if;

  if p_from_stage_id = p_to_stage_id then
    raise exception 'El pedido ya está en la etapa seleccionada.';
  end if;

  if char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'La solicitud de movimiento no es válida.';
  end if;

  request_fingerprint := md5(concat_ws(
    '|',
    p_order_id::text,
    p_from_stage_id::text,
    p_to_stage_id::text,
    p_expected_updated_at::text
  ));

  select * into existing_event
  from public.order_stage_events
  where actor_id = actor.id
    and idempotency_key = p_idempotency_key;

  if found then
    if existing_event.idempotency_fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otro movimiento.';
    end if;

    return query
    select
      persisted_order.id,
      persisted_order.public_number,
      existing_event.from_stage_id,
      existing_event.to_stage_id,
      persisted_destination_stage.code,
      existing_event.created_at,
      existing_event.id
    from public.orders persisted_order
    join public.workflow_stages persisted_destination_stage on persisted_destination_stage.id = existing_event.to_stage_id
    where persisted_order.id = existing_event.order_id;
    return;
  end if;

  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'El pedido seleccionado no existe.';
  end if;

  if target_order.current_stage_id <> p_from_stage_id
    or target_order.updated_at <> p_expected_updated_at then
    raise exception 'El pedido cambió en otra sesión. Actualizá el tablero e intentá nuevamente.';
  end if;

  select * into source_stage
  from public.workflow_stages
  where id = p_from_stage_id
  for key share;

  select * into destination_stage
  from public.workflow_stages
  where id = p_to_stage_id
    and is_active
  for key share;

  if not found then
    raise exception 'La etapa de destino no está disponible.';
  end if;

  if destination_stage.code = 'paid' then
    raise exception 'Los movimientos hacia Pagado requieren confirmar el cobro.';
  end if;

  if source_stage.code = 'paid' and destination_stage.code <> 'delivered' then
    raise exception 'Solo se permite entregar un pedido pagado.';
  end if;

  if source_stage.code = 'paid' and actor.role = 'employee' then
    raise exception 'No tenés permiso para entregar pedidos pagados.';
  end if;

  update public.orders
  set current_stage_id = destination_stage.id,
      updated_at = now()
  where id = target_order.id
  returning * into target_order;

  insert into public.order_stage_events (
    order_id,
    from_stage_id,
    to_stage_id,
    actor_id,
    idempotency_key,
    idempotency_fingerprint
  )
  values (
    target_order.id,
    source_stage.id,
    destination_stage.id,
    actor.id,
    p_idempotency_key,
    request_fingerprint
  )
  returning id into new_event_id;

  return query
  select
    target_order.id,
    target_order.public_number,
    source_stage.id,
    destination_stage.id,
    destination_stage.code,
    target_order.updated_at,
    new_event_id;
end;
$$;

revoke all on function public.move_order(uuid, uuid, uuid, timestamptz, text) from public;
grant execute on function public.move_order(uuid, uuid, uuid, timestamptz, text) to authenticated;

commit;
