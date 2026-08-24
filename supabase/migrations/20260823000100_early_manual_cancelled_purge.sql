begin;
set local search_path = '';

revoke all on function public.purge_cancelled_order(uuid, text), public.m16_purge_cancelled_order_core(uuid, uuid, text, text, timestamptz), public.purge_due_cancelled_orders(integer) from public, anon, authenticated, service_role;

drop function public.purge_cancelled_order(uuid, text);
drop function public.purge_due_cancelled_orders(integer);
drop function public.m16_purge_cancelled_order_core(uuid, uuid, text, text, timestamptz);

create function public.m16_purge_cancelled_order_core(
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
    if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then
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
    select image.object_path as path
    from public.order_design_images image
    where image.order_id = target_order.id
    union
    select image_event.object_path as path
    from public.order_design_image_events image_event
    where image_event.order_id = target_order.id
    union
    select image_event.previous_object_path as path
    from public.order_design_image_events image_event
    where image_event.order_id = target_order.id and image_event.previous_object_path is not null
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

revoke all on function public.m16_purge_cancelled_order_core(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated, service_role;

create function public.purge_due_cancelled_orders(p_limit integer)
returns table (result jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'No tenés permiso para purgar pedidos anulados.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'El límite de purga no es válido.'; end if;
  for candidate in
    select job.order_id, target_order.cancelled_by
    from public.order_purge_jobs job
    join public.orders target_order on target_order.id = job.order_id
    where job.status = 'prepared'
      and target_order.lifecycle_state = 'cancelled'
      and target_order.cancelled_at <= clock_timestamp() - interval '30 days'
    order by target_order.cancelled_at, target_order.id
    limit p_limit
    for update of job skip locked
  loop
    result := public.m16_purge_cancelled_order_core(candidate.order_id, candidate.cancelled_by, 'scheduler', null, 'm16-scheduler:' || candidate.order_id::text, clock_timestamp());
    return next;
  end loop;
end;
$$;

revoke all on function public.purge_due_cancelled_orders(integer) from public, anon, authenticated, service_role;
grant execute on function public.purge_due_cancelled_orders(integer) to service_role;

create function public.purge_cancelled_order(
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
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para purgar pedidos anulados.';
  end if;
  return public.m16_purge_cancelled_order_core(p_order_id, actor.id, 'manual', p_reason, p_idempotency_key, clock_timestamp());
end;
$$;

revoke all on function public.purge_cancelled_order(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.purge_cancelled_order(uuid, text, text) to authenticated;

commit;
