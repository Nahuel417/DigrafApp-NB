begin;

set local search_path = '';

create or replace function public.restore_order(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns table (
  order_id uuid,
  public_number bigint,
  lifecycle_state text,
  current_stage_id uuid,
  cancelled_at timestamptz,
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
  existing_event public.order_lifecycle_events%rowtype;
  normalized_key text;
  request_fingerprint text;
  event_time timestamptz;
  new_event_id uuid;
  result_snapshot jsonb;
  restore_reason text;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para restaurar pedidos.';
  end if;

  normalized_key := btrim(coalesce(p_idempotency_key, ''));
  if p_order_id is null or p_expected_updated_at is null or char_length(normalized_key) not between 1 and 200 then
    raise exception 'La solicitud de restauración no es válida.';
  end if;
  request_fingerprint := public.m15_restore_fingerprint(p_order_id, p_expected_updated_at);
  perform pg_advisory_xact_lock(hashtext('digraf:m15:actor:' || actor.id::text || ':' || normalized_key));
  select * into existing_event
  from public.order_lifecycle_events event
  where event.actor_id = actor.id and event.idempotency_key = normalized_key;
  if found then
    if existing_event.fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra restauración.';
    end if;
    return query select
      (existing_event.result_snapshot->>'order_id')::uuid,
      (existing_event.result_snapshot->>'public_number')::bigint,
      existing_event.result_snapshot->>'lifecycle_state',
      (existing_event.result_snapshot->>'current_stage_id')::uuid,
      null::timestamptz,
      (existing_event.result_snapshot->>'updated_at')::timestamptz,
      existing_event.id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('digraf:m15:order:' || p_order_id::text));
  select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  if target_order.updated_at <> p_expected_updated_at then
    raise exception 'El pedido cambió en otra sesión. Actualizá el Archivo e intentá nuevamente.';
  end if;
  if target_order.lifecycle_state <> 'cancelled' then
    raise exception 'El pedido no está anulado.';
  end if;
  if clock_timestamp() >= target_order.cancelled_at + interval '30 days' then
    raise exception 'La ventana de restauración de 30 días ya venció.';
  end if;

  restore_reason := target_order.cancellation_reason;
  event_time := clock_timestamp();
  update public.orders
  set lifecycle_state = 'active', cancelled_at = null, cancelled_by = null, cancellation_reason = null, updated_at = event_time
  where id = target_order.id
  returning * into target_order;

  result_snapshot := jsonb_build_object(
    'order_id', target_order.id,
    'public_number', target_order.public_number,
    'lifecycle_state', target_order.lifecycle_state,
    'current_stage_id', target_order.current_stage_id,
    'updated_at', target_order.updated_at
  );
  insert into public.order_lifecycle_events (order_id, actor_id, event_type, from_state, to_state, reason, occurred_at, idempotency_key, fingerprint, result_snapshot)
  values (target_order.id, actor.id, 'restored', 'cancelled', 'active', coalesce(restore_reason, 'Restauración del pedido'), event_time, normalized_key, request_fingerprint, result_snapshot)
  returning id into new_event_id;

  return query select target_order.id, target_order.public_number, target_order.lifecycle_state, target_order.current_stage_id, target_order.cancelled_at, target_order.updated_at, new_event_id;
end;
$$;

revoke all on function public.restore_order(uuid, timestamptz, text) from public, anon;
grant execute on function public.restore_order(uuid, timestamptz, text) to authenticated;

commit;
