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

create or replace function public.archive_delivered_order(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  delivered_stage public.workflow_stages%rowtype;
  existing_event public.order_lifecycle_events%rowtype;
  normalized_key text := btrim(coalesce(p_idempotency_key, ''));
  request_fingerprint text;
  event_time timestamptz;
  result_snapshot jsonb;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para archivar pedidos entregados.';
  end if;
  if p_order_id is null or p_expected_updated_at is null or char_length(normalized_key) not between 1 and 200 then
    raise exception 'La solicitud de archivo no es válida.';
  end if;

  request_fingerprint := md5(concat_ws('|', 'm16-archive-delivered:v1', p_order_id::text, p_expected_updated_at::text));
  perform pg_advisory_xact_lock(hashtext('digraf:m16:actor:' || actor.id::text || ':' || normalized_key));
  select * into existing_event from public.order_lifecycle_events event where event.actor_id = actor.id and event.idempotency_key = normalized_key;
  if found then
    if existing_event.fingerprint <> request_fingerprint then raise exception 'La clave de idempotencia ya fue utilizada para otro archivo.'; end if;
    return existing_event.result_snapshot;
  end if;

  select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  if target_order.updated_at <> p_expected_updated_at then raise exception 'El pedido cambió en otra sesión. Actualizá el Archivo e intentá nuevamente.'; end if;
  if target_order.lifecycle_state <> 'active' then raise exception 'Solo se pueden archivar pedidos activos entregados.'; end if;
  select * into delivered_stage from public.workflow_stages where id = target_order.current_stage_id;
  if not found or delivered_stage.code <> 'delivered' then raise exception 'Solo se pueden archivar pedidos en Entregado.'; end if;

  event_time := clock_timestamp();
  update public.orders set lifecycle_state = 'archived_delivered', updated_at = event_time where id = target_order.id returning * into target_order;
  result_snapshot := jsonb_build_object('order_id', target_order.id, 'public_number', target_order.public_number, 'lifecycle_state', target_order.lifecycle_state, 'updated_at', target_order.updated_at);
  insert into public.order_lifecycle_events (order_id, actor_id, event_type, from_state, to_state, reason, occurred_at, idempotency_key, fingerprint, result_snapshot)
  values (target_order.id, actor.id, 'delivered_archived', 'active', 'archived_delivered', 'Archivo de pedido entregado', event_time, normalized_key, request_fingerprint, result_snapshot);
  return result_snapshot;
end;
$$;

create or replace function public.unarchive_delivered_order(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  delivered_stage public.workflow_stages%rowtype;
  existing_event public.order_lifecycle_events%rowtype;
  normalized_key text := btrim(coalesce(p_idempotency_key, ''));
  request_fingerprint text;
  event_time timestamptz;
  result_snapshot jsonb;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para retirar pedidos entregados del Archivo.';
  end if;
  if p_order_id is null or p_expected_updated_at is null or char_length(normalized_key) not between 1 and 200 then
    raise exception 'La solicitud de restauración del archivo no es válida.';
  end if;

  request_fingerprint := md5(concat_ws('|', 'm16-unarchive-delivered:v1', p_order_id::text, p_expected_updated_at::text));
  perform pg_advisory_xact_lock(hashtext('digraf:m16:actor:' || actor.id::text || ':' || normalized_key));
  select * into existing_event from public.order_lifecycle_events event where event.actor_id = actor.id and event.idempotency_key = normalized_key;
  if found then
    if existing_event.fingerprint <> request_fingerprint then raise exception 'La clave de idempotencia ya fue utilizada para otra restauración.'; end if;
    return existing_event.result_snapshot;
  end if;

  select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  if target_order.updated_at <> p_expected_updated_at then raise exception 'El pedido cambió en otra sesión. Actualizá el Archivo e intentá nuevamente.'; end if;
  if target_order.lifecycle_state <> 'archived_delivered' then raise exception 'El pedido no está en el Archivo de entregados.'; end if;
  select * into delivered_stage from public.workflow_stages where id = target_order.current_stage_id;
  if not found or delivered_stage.code <> 'delivered' then raise exception 'El pedido archivado ya no conserva la etapa Entregado.'; end if;

  event_time := clock_timestamp();
  update public.orders set lifecycle_state = 'active', updated_at = event_time where id = target_order.id returning * into target_order;
  result_snapshot := jsonb_build_object('order_id', target_order.id, 'public_number', target_order.public_number, 'lifecycle_state', target_order.lifecycle_state, 'updated_at', target_order.updated_at);
  insert into public.order_lifecycle_events (order_id, actor_id, event_type, from_state, to_state, reason, occurred_at, idempotency_key, fingerprint, result_snapshot)
  values (target_order.id, actor.id, 'delivered_unarchived', 'archived_delivered', 'active', 'Pedido entregado retirado del Archivo', event_time, normalized_key, request_fingerprint, result_snapshot);
  return result_snapshot;
end;
$$;

create or replace function public.m16_purge_cancelled_order_core(
  p_order_id uuid,
  p_actor_id uuid,
  p_source text,
  p_reason text,
  p_idempotency_key text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  purge_job public.order_purge_jobs%rowtype;
  existing_event public.order_lifecycle_events%rowtype;
  job_exists boolean;
  normalized_source text := btrim(coalesce(p_source, ''));
  normalized_reason text := case when p_reason is null then null else btrim(p_reason) end;
  normalized_key text := btrim(coalesce(p_idempotency_key, ''));
  request_fingerprint text;
  event_reason text;
  captured_object_paths jsonb;
  result_snapshot jsonb;
begin
  if p_order_id is null or p_actor_id is null or normalized_source not in ('manual', 'scheduler')
    or char_length(normalized_key) not between 1 and 200 or p_now is null then
    raise exception 'La solicitud de purga no es válida.';
  end if;

  if normalized_source = 'manual' then
    if (select auth.role()) <> 'authenticated' or (select auth.uid()) is distinct from p_actor_id then
      raise exception 'No tenés permiso para purgar pedidos anulados.';
    end if;
    if normalized_reason is null or char_length(normalized_reason) not between 2 and 500 then
      raise exception 'El motivo de purga debe tener entre 2 y 500 caracteres.';
    end if;
    select * into actor from public.profiles where id = p_actor_id for update;
    if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then
      raise exception 'No tenés permiso para purgar pedidos anulados.';
    end if;
  elsif (select auth.role()) <> 'service_role' or p_reason is not null then
    raise exception 'No tenés permiso para purgar pedidos anulados.';
  end if;

  request_fingerprint := md5(concat_ws('|', 'm16-purge-cancelled:v2', p_order_id::text, normalized_key, normalized_source, coalesce(normalized_reason, '')));
  select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  if normalized_source = 'scheduler' and target_order.cancelled_by is distinct from p_actor_id then
    raise exception 'La solicitud de purga no es válida.';
  end if;

  select * into existing_event
  from public.order_lifecycle_events event
  where event.order_id = target_order.id
    and event.event_type = 'cancelled_purged'
    and event.idempotency_key = normalized_key
  order by event.occurred_at desc, event.id desc
  limit 1;
  if found then
    if existing_event.fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra purga.';
    end if;
    return existing_event.result_snapshot;
  end if;

  if target_order.lifecycle_state = 'purged_cancelled' then
    raise exception 'Solo se pueden purgar pedidos anulados.';
  end if;
  if target_order.lifecycle_state <> 'cancelled' then
    raise exception 'Solo se pueden purgar pedidos anulados.';
  end if;
  if normalized_source = 'scheduler' and p_now < target_order.cancelled_at + interval '30 days' then
    raise exception 'La retención de 30 días todavía no venció.';
  end if;

  select * into purge_job from public.order_purge_jobs where order_id = p_order_id for update;
  job_exists := found;
  if not job_exists then
    insert into public.order_purge_jobs (order_id, status, idempotency_fingerprint)
    values (p_order_id, 'prepared', request_fingerprint)
    returning * into purge_job;
  elsif purge_job.idempotency_fingerprint is not null and purge_job.idempotency_fingerprint <> request_fingerprint then
    raise exception 'La clave de idempotencia ya fue utilizada para otra purga.';
  elsif purge_job.result is not null then
    raise exception 'La purga no conserva un evento de replay válido.';
  else
    update public.order_purge_jobs
    set idempotency_fingerprint = request_fingerprint, updated_at = clock_timestamp()
    where id = purge_job.id and idempotency_fingerprint is null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(path) order by path), '[]'::jsonb) into captured_object_paths
  from (
    select image.object_path as path from public.order_design_images image where image.order_id = target_order.id
    union select image_event.object_path as path from public.order_design_image_events image_event where image_event.order_id = target_order.id
    union select image_event.previous_object_path as path from public.order_design_image_events image_event where image_event.order_id = target_order.id and image_event.previous_object_path is not null
  ) paths;

  perform set_config('m16.purge_context', 'on', true);
  update public.orders
  set lifecycle_state = 'purged_cancelled', customer_name = null, client_name = null, team_name = null, phone = null,
      quantity = null, order_type = null, order_date = null, promised_delivery_date = null, description = null,
      current_stage_id = null, idempotency_key = null, idempotency_fingerprint = null, cancellation_reason = null, updated_at = p_now
  where id = target_order.id;

  delete from public.order_comments where order_id = target_order.id;
  delete from public.order_catalog_items where order_id = target_order.id;
  delete from public.order_line_shields where order_line_id in (select line.id from public.order_lines line where line.order_id = target_order.id);
  delete from public.order_lines where order_id = target_order.id;
  delete from public.order_design_image_events where order_id = target_order.id;
  delete from public.order_design_images where order_id = target_order.id;

  event_reason := coalesce(normalized_reason, 'Purga automática de pedido anulado');
  result_snapshot := jsonb_build_object(
    'order_id', target_order.id,
    'public_number', target_order.public_number,
    'lifecycle_state', 'purged_cancelled',
    'updated_at', p_now,
    'source', normalized_source,
    'reason', normalized_reason,
    'storage_status', 'storage_pending'
  );
  insert into public.order_lifecycle_events (order_id, actor_id, event_type, from_state, to_state, reason, occurred_at, idempotency_key, fingerprint, result_snapshot)
  values (target_order.id, p_actor_id, 'cancelled_purged', 'cancelled', 'purged_cancelled', event_reason, p_now, normalized_key, request_fingerprint, result_snapshot);
  update public.order_purge_jobs as job_row
  set status = 'storage_pending', object_paths = captured_object_paths, idempotency_fingerprint = request_fingerprint, result = result_snapshot, updated_at = clock_timestamp()
  where job_row.id = purge_job.id;
  return result_snapshot;
end;
$$;

create or replace function public.purge_cancelled_order(
  p_order_id uuid,
  p_idempotency_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  if (select auth.role()) <> 'authenticated' then
    raise exception 'No tenés permiso para purgar pedidos anulados.';
  end if;
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para purgar pedidos anulados.';
  end if;
  return public.m16_purge_cancelled_order_core(p_order_id, actor.id, 'manual', p_reason, p_idempotency_key, clock_timestamp());
end;
$$;

revoke all on function public.cancel_order(uuid, timestamptz, text, text), public.restore_order(uuid, timestamptz, text), public.archive_delivered_order(uuid, timestamptz, text), public.unarchive_delivered_order(uuid, timestamptz, text), public.purge_cancelled_order(uuid, text, text) from public, anon;
grant execute on function public.cancel_order(uuid, timestamptz, text, text), public.restore_order(uuid, timestamptz, text), public.archive_delivered_order(uuid, timestamptz, text), public.unarchive_delivered_order(uuid, timestamptz, text), public.purge_cancelled_order(uuid, text, text) to authenticated;

create policy "Attention can read archived orders"
on public.orders for select to authenticated
using ((select public.current_active_role()) = 'attention' and lifecycle_state in ('cancelled', 'archived_delivered'));

create policy "Attention can read archived order specifications"
on public.order_catalog_items for select to authenticated
using ((select public.current_active_role()) = 'attention' and exists (select 1 from public.orders target_order where target_order.id = order_catalog_items.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered')));

create policy "Attention can read archived stage history"
on public.order_stage_events for select to authenticated
using ((select public.current_active_role()) = 'attention' and exists (select 1 from public.orders target_order where target_order.id = order_stage_events.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered')));

create policy "Attention can read archived order finances"
on public.order_financials for select to authenticated
using ((select public.current_active_role()) = 'attention' and exists (select 1 from public.orders target_order where target_order.id = order_financials.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered')));

create policy "Attention can read archived order lines"
on public.order_lines for select to authenticated
using ((select public.current_active_role()) = 'attention' and exists (select 1 from public.orders target_order where target_order.id = order_lines.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered')));

create policy "Attention can read archived line shields"
on public.order_line_shields for select to authenticated
using ((select public.current_active_role()) = 'attention' and exists (select 1 from public.order_lines line join public.orders target_order on target_order.id = line.order_id where line.id = order_line_shields.order_line_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered')));

create policy "Attention can read archived order changes"
on public.order_change_events for select to authenticated
using ((select public.current_active_role()) = 'attention' and exists (select 1 from public.orders target_order where target_order.id = order_change_events.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered')));

create policy "Attention can read archived order comments"
on public.order_comments for select to authenticated
using ((select public.current_active_role()) = 'attention' and exists (select 1 from public.orders target_order where target_order.id = order_comments.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered')));

create policy "Attention can read archived order images"
on public.order_design_images for select to authenticated
using ((select public.current_active_role()) = 'attention' and exists (select 1 from public.orders target_order where target_order.id = order_design_images.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered')));

create policy "Attention can read archived image events"
on public.order_design_image_events for select to authenticated
using ((select public.current_active_role()) = 'attention' and exists (select 1 from public.orders target_order where target_order.id = order_design_image_events.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered')));

create policy "Attention can read archived order payments"
on public.order_payments for select to authenticated
using ((select public.current_active_role()) = 'attention' and exists (select 1 from public.orders target_order where target_order.id = order_payments.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered')));

create policy "Attention can read archived payment events"
on public.order_payment_events for select to authenticated
using ((select public.current_active_role()) = 'attention' and exists (select 1 from public.order_payments payment join public.orders target_order on target_order.id = payment.order_id where payment.id = order_payment_events.order_payment_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered')));

create policy "Attention can read archived lifecycle events"
on public.order_lifecycle_events for select to authenticated
using ((select public.current_active_role()) = 'attention' and exists (select 1 from public.orders target_order where target_order.id = order_lifecycle_events.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered')));

create policy "Archive managers can read profile names"
on public.profiles for select to authenticated
using (role in ('admin', 'attention', 'employee') and (select public.current_active_role()) in ('admin', 'attention'));

create policy "Attention can read archived order objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'order-designs'
  and (select public.current_active_role()) = 'attention'
  and exists (
    select 1 from public.orders target_order
    where target_order.id::text = split_part(name, '/', 2)
      and target_order.lifecycle_state in ('cancelled', 'archived_delivered')
  )
);

create or replace function public.get_order_timeline(p_order_id uuid)
returns table (event_id uuid, event_type text, actor_display_name text, occurred_at timestamptz, details jsonb, comment_body text, change_note text, from_stage_id uuid, to_stage_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
begin
  select * into actor from public.profiles where id = (select auth.uid());
  if not found or not actor.is_active or actor.must_change_password then raise exception 'No tenés permiso para ver el historial del pedido.'; end if;
  select * into target_order from public.orders where id = p_order_id;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  if target_order.lifecycle_state in ('cancelled', 'archived_delivered') and actor.role not in ('super_admin', 'admin', 'attention') then raise exception 'El pedido seleccionado no existe.'; end if;
  if target_order.lifecycle_state = 'purged_cancelled' and actor.role <> 'super_admin' then raise exception 'El pedido seleccionado no existe.'; end if;
  return query
  select * from (
    select stage_event.id, 'stage_moved'::text, profile.display_name, stage_event.created_at, '{}'::jsonb, null::text, null::text, stage_event.from_stage_id, stage_event.to_stage_id
    from public.order_stage_events stage_event join public.profiles profile on profile.id = stage_event.actor_id where stage_event.order_id = p_order_id
    union all
    select change_event.id, change_event.action, profile.display_name, change_event.created_at,
      case when actor.role = 'employee' and exists (select 1 from jsonb_array_elements(coalesce(change_event.details->'changes', '[]'::jsonb)) item where item->>'field' in ('total_amount', 'deposit_amount', 'deposit_paid')) then jsonb_build_object('version', 1, 'changes', jsonb_build_array(jsonb_build_object('field', 'order_updated'))) else change_event.details end,
      null::text,
      case when actor.role = 'employee' and exists (select 1 from jsonb_array_elements(coalesce(change_event.details->'changes', '[]'::jsonb)) item where item->>'field' in ('total_amount', 'deposit_amount', 'deposit_paid')) then null else change_event.change_note end,
      null::uuid, null::uuid
    from public.order_change_events change_event join public.profiles profile on profile.id = change_event.actor_id where change_event.order_id = p_order_id
    union all
    select comment.id, 'commented'::text, profile.display_name, comment.created_at, '{}'::jsonb, comment.body, null::text, null::uuid, null::uuid
    from public.order_comments comment join public.profiles profile on profile.id = comment.actor_id where comment.order_id = p_order_id
    union all
    select payment_event.id, case when payment_event.event_type = 'confirmed' then 'payment_confirmed' else 'payment_reversed' end, profile.display_name, payment_event.occurred_at, case when actor.role in ('super_admin', 'admin', 'attention') then payment_event.payment_snapshot else jsonb_build_object('version', 1, case when payment_event.event_type = 'confirmed' then 'payment_confirmed' else 'payment_reversed' end, true) end, null::text, null::text, null::uuid, null::uuid
    from public.order_payment_events payment_event join public.profiles profile on profile.id = payment_event.actor_id join public.order_payments payment on payment.id = payment_event.order_payment_id where payment.order_id = p_order_id
    union all
    select lifecycle_event.id, case lifecycle_event.event_type when 'cancelled' then 'order_cancelled' when 'restored' then 'order_restored' when 'delivered_archived' then 'delivered_archived' when 'delivered_unarchived' then 'delivered_unarchived' else 'cancelled_purged' end, profile.display_name, lifecycle_event.occurred_at, jsonb_build_object('version', lifecycle_event.version, 'reason', lifecycle_event.reason, 'from_state', lifecycle_event.from_state, 'to_state', lifecycle_event.to_state, 'snapshot', lifecycle_event.result_snapshot), null::text, null::text, null::uuid, null::uuid
    from public.order_lifecycle_events lifecycle_event join public.profiles profile on profile.id = lifecycle_event.actor_id where lifecycle_event.order_id = p_order_id
  ) timeline(event_id, event_type, actor_display_name, occurred_at, details, comment_body, change_note, from_stage_id, to_stage_id)
  order by timeline.occurred_at desc, timeline.event_type asc, timeline.event_id asc;
end;
$$;

revoke all on function public.get_order_timeline(uuid) from public, anon;
grant execute on function public.get_order_timeline(uuid) to authenticated;

commit;
