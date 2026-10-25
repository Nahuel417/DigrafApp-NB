begin;
set local search_path = '';

create or replace function public.cancel_order(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
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
  normalized_reason text;
  request_fingerprint text;
  event_time timestamptz;
  new_event_id uuid;
  result_snapshot jsonb;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para anular pedidos.';
  end if;

  normalized_key := btrim(coalesce(p_idempotency_key, ''));
  normalized_reason := regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g');
  if p_order_id is null or p_expected_updated_at is null or char_length(normalized_key) not between 1 and 200 or char_length(normalized_reason) not between 2 and 500 then
    raise exception 'El motivo de anulación debe tener entre 2 y 500 caracteres.';
  end if;

  request_fingerprint := public.m15_cancel_fingerprint(p_order_id, p_expected_updated_at, normalized_reason);
  perform pg_advisory_xact_lock(hashtext('digraf:m15:actor:' || actor.id::text || ':' || normalized_key));
  select * into existing_event
  from public.order_lifecycle_events event
  where event.actor_id = actor.id and event.idempotency_key = normalized_key;
  if found then
    if existing_event.fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra anulación.';
    end if;
    return query select
      (existing_event.result_snapshot->>'order_id')::uuid,
      (existing_event.result_snapshot->>'public_number')::bigint,
      existing_event.result_snapshot->>'lifecycle_state',
      (existing_event.result_snapshot->>'current_stage_id')::uuid,
      (existing_event.result_snapshot->>'cancelled_at')::timestamptz,
      (existing_event.result_snapshot->>'updated_at')::timestamptz,
      existing_event.id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('digraf:m15:order:' || p_order_id::text));
  select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  if target_order.updated_at <> p_expected_updated_at then
    raise exception 'El pedido cambió en otra sesión. Actualizá el tablero e intentá nuevamente.';
  end if;
  if target_order.lifecycle_state = 'cancelled' then
    raise exception 'El pedido ya está anulado.';
  end if;
  if exists (select 1 from public.order_payments payment where payment.order_id = target_order.id and payment.reversed_at is null for update) then
    raise exception 'El pedido tiene un pago activo. Revertí el pago mediante M12 antes de anularlo.';
  end if;
  if exists (
    select 1 from public.workflow_stages stage
    where stage.id = target_order.current_stage_id and stage.code = 'paid'
  ) then
    raise exception 'El pedido está en Pagado. Revertí el pago mediante M12 antes de anularlo.';
  end if;
  if exists (
    select 1 from public.workflow_stages stage
    where stage.id = target_order.current_stage_id and stage.code = 'delivered'
  ) then
    raise exception 'El pedido está en Entregado. Movelo a otra etapa antes de anularlo.';
  end if;

  event_time := clock_timestamp();
  update public.orders
  set lifecycle_state = 'cancelled', cancelled_at = event_time, cancelled_by = actor.id, cancellation_reason = normalized_reason, updated_at = event_time
  where id = target_order.id
  returning * into target_order;

  result_snapshot := jsonb_build_object(
    'order_id', target_order.id,
    'public_number', target_order.public_number,
    'lifecycle_state', target_order.lifecycle_state,
    'current_stage_id', target_order.current_stage_id,
    'cancelled_at', target_order.cancelled_at,
    'updated_at', target_order.updated_at
  );
  insert into public.order_lifecycle_events (order_id, actor_id, event_type, from_state, to_state, reason, occurred_at, idempotency_key, fingerprint, result_snapshot)
  values (target_order.id, actor.id, 'cancelled', 'active', 'cancelled', normalized_reason, event_time, normalized_key, request_fingerprint, result_snapshot)
  returning id into new_event_id;

  return query select target_order.id, target_order.public_number, target_order.lifecycle_state, target_order.current_stage_id, target_order.cancelled_at, target_order.updated_at, new_event_id;
end;
$$;

commit;
