begin;

alter table public.workflow_stages
  add column requires_design_image boolean not null default false;

create unique index workflow_stages_single_design_image_requirement_idx
  on public.workflow_stages (requires_design_image)
  where requires_design_image;

do $$
declare
  molderia_stage_count integer;
  unique_molderia_stage_id uuid;
begin
  select count(*), min(id::text)::uuid
  into molderia_stage_count, unique_molderia_stage_id
  from public.workflow_stages
  where lower(btrim(name)) in ('moldería', 'molderia');

  if molderia_stage_count = 1 then
    update public.workflow_stages
    set requires_design_image = true,
        updated_at = now()
    where id = unique_molderia_stage_id;
    raise notice 'Moldería image requirement bound to the uniquely named stage ID %.', unique_molderia_stage_id;
  elsif molderia_stage_count = 0 then
    raise warning 'Moldería image requirement is not bound: no existing stage matched. Local seed will create a local stage; staging requires explicit provisioning and production requires a reviewed stage ID via scripts/configure-molderia.mjs. No stage was created by this migration.';
  else
    raise warning 'Moldería image requirement is not bound: found % stages named Moldería/Molderia. Review the intended stage ID and configure it explicitly with scripts/configure-molderia.mjs; no stage was created by this migration.', molderia_stage_count;
  end if;
end;
$$;

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

  if destination_stage.requires_design_image and not exists (
    select 1 from public.order_design_images image where image.order_id = target_order.id
  ) then
    raise exception 'El pedido necesita al menos una imagen de diseño vigente para ingresar a Moldería.';
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

create or replace function public.reverse_order_payment(
  p_order_id uuid,
  p_payment_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text,
  p_reason text default null
)
returns table (
  order_id uuid,
  payment_id uuid,
  reversal_cash_movement_id uuid,
  event_id uuid,
  from_stage_id uuid,
  to_stage_id uuid,
  stage_code text,
  updated_at timestamptz,
  amount numeric(14, 2)
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  payment public.order_payments%rowtype;
  original public.cash_movements%rowtype;
  day public.cash_days%rowtype;
  financials public.order_financials%rowtype;
  paid_stage public.workflow_stages%rowtype;
  restored_stage public.workflow_stages%rowtype;
  confirmed_event public.order_payment_events%rowtype;
  existing_event public.order_payment_events%rowtype;
  normalized_key text;
  normalized_reason text;
  fingerprint text;
  event_time timestamptz;
  reversal_id uuid;
  reversal_event_id uuid;
  restored_stage_id uuid;
  reversal_day_id uuid;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para revertir pagos.';
  end if;
  normalized_key := btrim(coalesce(p_idempotency_key, ''));
  normalized_reason := nullif(regexp_replace(lower(btrim(coalesce(p_reason, ''))), '\s+', ' ', 'g'), '');
  if p_order_id is null or p_payment_id is null or p_expected_updated_at is null or char_length(normalized_key) not between 1 and 200 then
    raise exception 'La reversión de pago no es válida.';
  end if;
  if normalized_reason is not null and char_length(normalized_reason) > 500 then
    raise exception 'El motivo de reversión no puede superar los 500 caracteres.';
  end if;
  fingerprint := public.m12_reversal_fingerprint(p_order_id, p_payment_id, p_expected_updated_at, normalized_reason);
  perform pg_advisory_xact_lock(hashtext('digraf:reversal-actor:' || actor.id::text || ':' || normalized_key));
  select * into existing_event from public.order_payment_events event where event.actor_id = actor.id and event.idempotency_key = normalized_key and event.event_type = 'reversed';
  if found then
    if existing_event.fingerprint <> fingerprint then raise exception 'La clave de idempotencia ya fue utilizada para otra reversión.'; end if;
    return query select replay_payment.order_id, replay_payment.id, replay_payment.reversal_cash_movement_id, existing_event.id,
      (confirmed_event_row.order_snapshot ->> 'to_stage_id')::uuid, (confirmed_event_row.order_snapshot ->> 'from_stage_id')::uuid,
      existing_event.stage, (existing_event.order_snapshot ->> 'updated_at')::timestamptz, replay_payment.amount
    from public.order_payments replay_payment
    join public.order_payment_events confirmed_event_row on confirmed_event_row.order_payment_id = replay_payment.id and confirmed_event_row.event_type = 'confirmed'
    where replay_payment.id = existing_event.order_payment_id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('digraf:cash-rollover'));
  select movement.cash_day_id into reversal_day_id
  from public.order_payments payment_for_lock
  join public.cash_movements movement on movement.id = payment_for_lock.cash_movement_id
  where payment_for_lock.id = p_payment_id and payment_for_lock.amount > 0;
  if reversal_day_id is not null then
    select * into day from public.cash_days where id = reversal_day_id for update;
  end if;
  select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  select payment_row.* into payment from public.order_payments payment_row where payment_row.id = p_payment_id and payment_row.order_id = p_order_id for update;
  if not found then raise exception 'El pago seleccionado no existe.'; end if;
  select * into confirmed_event from public.order_payment_events event where event.order_payment_id = payment.id and event.event_type = 'confirmed' order by event.occurred_at limit 1;
  if not found or confirmed_event.order_snapshot ->> 'from_stage_id' is null then raise exception 'El pago no tiene etapa previa registrada.'; end if;
  restored_stage_id := (confirmed_event.order_snapshot ->> 'from_stage_id')::uuid;
  select * into restored_stage from public.workflow_stages where id = restored_stage_id for key share;
  if not found then raise exception 'La etapa previa del pago no está disponible.'; end if;
  select * into paid_stage from public.workflow_stages where code = 'paid' and is_active for key share;
  if not found then raise exception 'La etapa Pagado no está disponible.'; end if;
  if payment.reversed_at is not null then raise exception 'El pago ya fue revertido.'; end if;
  if target_order.updated_at <> p_expected_updated_at then raise exception 'El pedido cambió en otra sesión. Actualizá el tablero e intentá nuevamente.'; end if;
  if target_order.current_stage_id <> paid_stage.id then raise exception 'El pedido no está en la etapa Pagado.'; end if;
  select * into financials from public.order_financials financial_row where financial_row.order_id = target_order.id for update;
  if not found or payment.amount <> financials.total_amount then raise exception 'El importe del pago no coincide con el pedido.'; end if;
  if restored_stage.requires_design_image and not exists (
    select 1 from public.order_design_images image where image.order_id = target_order.id
  ) then
    raise exception 'El pedido necesita al menos una imagen de diseño vigente para ingresar a Moldería.';
  end if;
  if payment.amount > 0 then
    select * into original from public.cash_movements where id = payment.cash_movement_id for key share;
    if not found or original.direction <> 'income' or day.id <> original.cash_day_id or day.closed_at is not null then raise exception 'La caja está cerrada y no admite reversiones.'; end if;
    event_time := clock_timestamp();
    reversal_id := gen_random_uuid();
    insert into public.cash_movements (id, cash_day_id, direction, amount, description, actor_id, created_at, idempotency_key, idempotency_fingerprint, is_payment_reversal)
    values (reversal_id, original.cash_day_id, 'expense', payment.amount, 'Reversión PED-' || lpad(target_order.public_number::text, 6, '0'), actor.id, event_time, 'payment-reversal:' || payment.id::text, fingerprint, true);
  else
    event_time := clock_timestamp();
  end if;
  update public.order_payments set reversal_cash_movement_id = reversal_id, reversed_at = event_time where id = payment.id returning public.order_payments.* into payment;
  update public.orders set current_stage_id = restored_stage.id, updated_at = event_time where id = target_order.id returning * into target_order;
  insert into public.order_stage_events(order_id, from_stage_id, to_stage_id, actor_id, created_at, idempotency_key, idempotency_fingerprint)
  values(target_order.id, paid_stage.id, restored_stage.id, actor.id, event_time, 'payment-reversal:' || payment.id::text, fingerprint);
  insert into public.order_payment_events(order_payment_id, event_type, order_snapshot, payment_snapshot, stage, actor_id, occurred_at, idempotency_key, fingerprint)
  values(payment.id, 'reversed', jsonb_build_object('id', target_order.id, 'public_number', target_order.public_number, 'from_stage_id', paid_stage.id, 'to_stage_id', restored_stage.id, 'updated_at', target_order.updated_at), jsonb_build_object('id', payment.id, 'amount', payment.amount, 'cash_movement_id', payment.cash_movement_id, 'reversal_cash_movement_id', payment.reversal_cash_movement_id, 'reversed_at', event_time), restored_stage.code, actor.id, event_time, normalized_key, fingerprint)
  returning id into reversal_event_id;
  return query select target_order.id, payment.id, payment.reversal_cash_movement_id, reversal_event_id, paid_stage.id, restored_stage.id, restored_stage.code, target_order.updated_at, payment.amount;
end;
$$;

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
  target_stage public.workflow_stages%rowtype;
  existing_event public.order_lifecycle_events%rowtype;
  normalized_key text;
  request_fingerprint text;
  event_time timestamptz;
  new_event_id uuid;
  result_snapshot jsonb;
  restore_reason text;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then
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

  select * into target_stage
  from public.workflow_stages
  where id = target_order.current_stage_id
  for key share;

  if target_stage.requires_design_image and not exists (
    select 1 from public.order_design_images image where image.order_id = target_order.id
  ) then
    raise exception 'El pedido necesita al menos una imagen de diseño vigente para ingresar a Moldería.';
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

revoke all on function public.move_order(uuid, uuid, uuid, timestamptz, text) from public;
grant execute on function public.move_order(uuid, uuid, uuid, timestamptz, text) to authenticated;
revoke all on function public.reverse_order_payment(uuid, uuid, timestamptz, text, text) from public, anon;
grant execute on function public.reverse_order_payment(uuid, uuid, timestamptz, text, text) to authenticated;
revoke all on function public.restore_order(uuid, timestamptz, text) from public, anon;
grant execute on function public.restore_order(uuid, timestamptz, text) to authenticated;

commit;
