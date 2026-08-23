begin;
set local search_path = '';
alter table public.orders
  drop constraint orders_lifecycle_state_check,
  drop constraint orders_cancellation_fields_check,
  alter column customer_name drop not null,
  alter column quantity drop not null,
  alter column order_date drop not null,
  alter column promised_delivery_date drop not null,
  alter column current_stage_id drop not null,
  alter column idempotency_key drop not null,
  alter column idempotency_fingerprint drop not null;
alter table public.orders
  add constraint orders_lifecycle_state_check check (lifecycle_state in ('active', 'cancelled', 'archived_delivered', 'purged_cancelled')),
  add constraint orders_cancellation_fields_check check (
    (lifecycle_state in ('active', 'archived_delivered') and cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or (lifecycle_state = 'cancelled' and cancelled_at is not null and cancelled_by is not null and char_length(btrim(cancellation_reason)) between 2 and 500)
    or (lifecycle_state = 'purged_cancelled' and cancelled_at is not null and cancelled_by is not null and cancellation_reason is null
      and customer_name is null and client_name is null and team_name is null and phone is null
      and quantity is null and order_type is null and order_date is null and promised_delivery_date is null
      and description is null and current_stage_id is null and idempotency_key is null and idempotency_fingerprint is null)
  );
alter table public.order_lifecycle_events
  drop constraint order_lifecycle_events_event_type_check,
  drop constraint order_lifecycle_events_from_state_check,
  drop constraint order_lifecycle_events_to_state_check,
  add constraint order_lifecycle_events_event_type_check check (event_type in ('cancelled', 'restored', 'delivered_archived', 'delivered_unarchived', 'cancelled_purged')),
  add constraint order_lifecycle_events_from_state_check check (from_state in ('active', 'cancelled', 'archived_delivered')),
  add constraint order_lifecycle_events_to_state_check check (to_state in ('active', 'cancelled', 'archived_delivered', 'purged_cancelled'));
create table public.order_purge_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  status text not null check (status in ('prepared', 'purged', 'storage_pending', 'storage_retry', 'storage_completed', 'storage_failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  object_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(object_paths) = 'array'),
  idempotency_fingerprint text,
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (order_id)
);
create index order_purge_jobs_due_idx
  on public.order_purge_jobs (status, next_attempt_at, created_at);
alter table public.order_purge_jobs enable row level security;
revoke all on table public.order_purge_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.order_purge_jobs to service_role;
create or replace view public.archived_delivered_orders
with (security_invoker = true)
as
select
  order_row.id,
  order_row.public_number,
  order_row.customer_name,
  order_row.client_name,
  order_row.team_name,
  order_row.phone,
  order_row.quantity,
  order_row.order_type,
  order_row.order_date,
  order_row.promised_delivery_date,
  order_row.description,
  order_row.current_stage_id,
  order_row.lifecycle_state,
  order_row.created_by,
  order_row.created_at,
  order_row.updated_at
from public.orders order_row
where order_row.lifecycle_state = 'archived_delivered';
revoke all on public.archived_delivered_orders from public, anon;
grant select on public.archived_delivered_orders to authenticated;
create or replace function public.m15_reject_cancelled_order_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid;
  old_order_id uuid;
  new_order_id uuid;
begin
  if tg_table_name = 'orders' then
    target_order_id := coalesce(new.id, old.id);
    if tg_op = 'UPDATE' and old.lifecycle_state = 'cancelled'
      and (new.lifecycle_state = 'active' or (new.lifecycle_state = 'purged_cancelled' and current_setting('m16.purge_context', true) = 'on')) then
      return new;
    end if;
  elsif tg_table_name in ('order_financials', 'order_catalog_items', 'order_stage_events', 'order_change_events', 'order_comments', 'order_design_images', 'order_design_image_events', 'order_lines') then
    if tg_table_name = 'order_lines' then
      old_order_id := old.order_id;
      new_order_id := new.order_id;
    else
      target_order_id := coalesce(new.order_id, old.order_id);
    end if;
  elsif tg_table_name = 'order_line_shields' then
    select line.order_id into old_order_id from public.order_lines line where line.id = old.order_line_id;
    select line.order_id into new_order_id from public.order_lines line where line.id = new.order_line_id;
  elsif tg_table_name = 'order_payments' then
    target_order_id := coalesce(new.order_id, old.order_id);
  elsif tg_table_name = 'order_payment_events' then
    select payment.order_id into target_order_id
    from public.order_payments payment
    where payment.id = coalesce(new.order_payment_id, old.order_payment_id);
  end if;

   if (target_order_id is not null and exists (select 1 from public.orders target_order where target_order.id = target_order_id and target_order.lifecycle_state = 'cancelled'))
     or exists (select 1 from public.orders target_order where target_order.id in (old_order_id, new_order_id) and target_order.lifecycle_state = 'cancelled') then
    raise exception 'El pedido está anulado y se encuentra congelado.';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.m15_reject_cancelled_order_mutation() from public, anon, authenticated;
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
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then
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
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then
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
  p_idempotency_key text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  purge_job public.order_purge_jobs%rowtype;
  job_exists boolean;
  normalized_key text := btrim(coalesce(p_idempotency_key, ''));
  request_fingerprint text;
  captured_object_paths jsonb;
  result_snapshot jsonb;
begin
  if p_order_id is null or p_actor_id is null or char_length(btrim(coalesce(p_source, ''))) not between 1 and 80
    or char_length(normalized_key) not between 1 and 200 or p_now is null then
    raise exception 'La solicitud de purga no es válida.';
  end if;

  select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  request_fingerprint := md5(concat_ws('|', 'm16-purge-cancelled:v1', p_order_id::text, normalized_key, p_source));
  select * into purge_job from public.order_purge_jobs where order_id = p_order_id for update;
  job_exists := found;
  if target_order.lifecycle_state = 'purged_cancelled' then
    if not job_exists or purge_job.result is null then raise exception 'Solo se pueden purgar pedidos anulados.'; end if;
    if purge_job.idempotency_fingerprint is distinct from request_fingerprint then raise exception 'La clave de idempotencia ya fue utilizada para otra purga.'; end if;
    return purge_job.result;
  end if;
  if target_order.lifecycle_state <> 'cancelled' then raise exception 'Solo se pueden purgar pedidos anulados.'; end if;
  if p_now < target_order.cancelled_at + interval '30 days' then raise exception 'La retención de 30 días todavía no venció.'; end if;
  if not job_exists then
    insert into public.order_purge_jobs (order_id, status, idempotency_fingerprint)
    values (p_order_id, 'prepared', request_fingerprint)
    returning * into purge_job;
  elsif purge_job.idempotency_fingerprint is not null and purge_job.idempotency_fingerprint <> request_fingerprint then
    raise exception 'La clave de idempotencia ya fue utilizada para otra purga.';
  elsif purge_job.result is not null then
    return purge_job.result;
  else
    update public.order_purge_jobs
    set idempotency_fingerprint = request_fingerprint, updated_at = clock_timestamp()
    where id = purge_job.id and idempotency_fingerprint is null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(path) order by path), '[]'::jsonb) into captured_object_paths
  from (
    select image.object_path as path from public.order_design_images image where image.order_id = target_order.id
    union
    select image_event.object_path as path from public.order_design_image_events image_event where image_event.order_id = target_order.id
    union
    select image_event.previous_object_path as path from public.order_design_image_events image_event where image_event.order_id = target_order.id and image_event.previous_object_path is not null
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

  result_snapshot := jsonb_build_object('order_id', target_order.id, 'public_number', target_order.public_number, 'lifecycle_state', 'purged_cancelled', 'source', p_source, 'storage_status', 'storage_pending');
  insert into public.order_lifecycle_events (order_id, actor_id, event_type, from_state, to_state, reason, occurred_at, idempotency_key, fingerprint, result_snapshot)
  values (target_order.id, p_actor_id, 'cancelled_purged', 'cancelled', 'purged_cancelled', 'Pedido anulado purgado', p_now, normalized_key, request_fingerprint, result_snapshot);
  update public.order_purge_jobs as job_row
  set status = 'storage_pending', object_paths = captured_object_paths, idempotency_fingerprint = request_fingerprint, result = result_snapshot, updated_at = clock_timestamp()
  where job_row.id = purge_job.id;
  return result_snapshot;
end;
$$;
revoke all on function public.archive_delivered_order(uuid, timestamptz, text), public.unarchive_delivered_order(uuid, timestamptz, text), public.m16_purge_cancelled_order_core(uuid, uuid, text, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.archive_delivered_order(uuid, timestamptz, text), public.unarchive_delivered_order(uuid, timestamptz, text) to authenticated;
create or replace function public.purge_cancelled_order(
  p_order_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role <> 'super_admin' then
    raise exception 'No tenés permiso para purgar pedidos anulados.';
  end if;
  return public.m16_purge_cancelled_order_core(p_order_id, actor.id, 'manual', p_idempotency_key, clock_timestamp());
end;
$$;
revoke all on function public.purge_cancelled_order(uuid, text) from public, anon, service_role;
grant execute on function public.purge_cancelled_order(uuid, text) to authenticated;
create or replace function public.prepare_cancelled_order_purge_jobs(p_limit integer)
returns table (job_id uuid, order_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'El límite de preparación no es válido.'; end if;
  return query
  insert into public.order_purge_jobs as job_row (order_id, status)
  select target_order.id, 'prepared'
  from public.orders target_order
  where target_order.lifecycle_state = 'cancelled'
    and target_order.cancelled_at <= clock_timestamp() - interval '29 days'
  order by target_order.cancelled_at, target_order.id
  limit p_limit
  on conflict on constraint order_purge_jobs_order_id_key do nothing
  returning job_row.id, job_row.order_id, job_row.status;
end;
$$;
create or replace function public.purge_due_cancelled_orders(p_limit integer)
returns table (result jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
begin
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
    result := public.m16_purge_cancelled_order_core(candidate.order_id, candidate.cancelled_by, 'scheduler', 'm16-scheduler:' || candidate.order_id::text, clock_timestamp());
    return next;
  end loop;
end;
$$;
create or replace function public.claim_order_purge_storage_jobs(p_limit integer)
returns table (job_id uuid, lease_token uuid, object_paths jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.order_purge_jobs%rowtype;
  new_lease uuid;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'El límite de Storage no es válido.'; end if;
  for candidate in
    select * from public.order_purge_jobs job
    where job.status in ('storage_pending', 'storage_retry')
      and (job.next_attempt_at is null or job.next_attempt_at <= clock_timestamp())
      and (job.lease_expires_at is null or job.lease_expires_at < clock_timestamp())
    order by job.updated_at, job.id
    limit p_limit
    for update skip locked
  loop
    new_lease := gen_random_uuid();
    update public.order_purge_jobs job
    set lease_token = new_lease, lease_expires_at = clock_timestamp() + interval '10 minutes', updated_at = clock_timestamp()
    where job.id = candidate.id
    returning job.id, job.object_paths into job_id, object_paths;
    lease_token := new_lease;
    return next;
  end loop;
end;
$$;
create or replace function public.finalize_order_purge_storage_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  purge_job public.order_purge_jobs%rowtype;
  next_status text;
  next_result jsonb;
begin
  select * into purge_job from public.order_purge_jobs where id = p_job_id for update;
  if not found or purge_job.lease_token is distinct from p_lease_token or purge_job.lease_expires_at < clock_timestamp() then
    raise exception 'La concesión de limpieza de Storage ya no es válida.';
  end if;
  if p_succeeded then
    next_status := 'storage_completed';
    next_result := jsonb_set(coalesce(purge_job.result, '{}'::jsonb), '{storage_status}', '"storage_completed"'::jsonb, true);
  else
    next_status := case when purge_job.attempts + 1 >= 10 then 'storage_failed' else 'storage_retry' end;
    next_result := jsonb_set(coalesce(purge_job.result, '{}'::jsonb), '{storage_status}', to_jsonb(next_status), true);
  end if;
  update public.order_purge_jobs
  set status = next_status, attempts = case when p_succeeded then attempts else attempts + 1 end,
      last_error = case when p_succeeded then null else left(coalesce(p_error, 'Storage cleanup failed.'), 2000) end,
      next_attempt_at = case when p_succeeded or next_status = 'storage_failed' then null else clock_timestamp() + interval '5 minutes' end,
      lease_token = null, lease_expires_at = null, result = next_result, updated_at = clock_timestamp()
  where id = purge_job.id;
  return next_result;
end;
$$;
revoke all on function public.prepare_cancelled_order_purge_jobs(integer), public.purge_due_cancelled_orders(integer), public.claim_order_purge_storage_jobs(integer), public.finalize_order_purge_storage_job(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.prepare_cancelled_order_purge_jobs(integer), public.purge_due_cancelled_orders(integer), public.claim_order_purge_storage_jobs(integer), public.finalize_order_purge_storage_job(uuid, uuid, boolean, text) to service_role;
drop policy "Operational users can read orders" on public.orders;
create policy "Operational users can read orders"
on public.orders for select to authenticated
using (
  (select public.current_active_role()) is not null
  and (
    lifecycle_state = 'active'
    or (lifecycle_state in ('cancelled', 'archived_delivered') and (select public.current_active_role()) in ('super_admin', 'admin'))
    or (lifecycle_state = 'purged_cancelled' and (select public.current_active_role()) = 'super_admin')
  )
);

drop policy "Operational users can read order specifications" on public.order_catalog_items;
create policy "Operational users can read order specifications"
on public.order_catalog_items for select to authenticated
using (
  (select public.current_active_role()) is not null
  and (
    exists (select 1 from public.orders target_order where target_order.id = order_catalog_items.order_id and target_order.lifecycle_state = 'active')
    or (select public.current_active_role()) in ('super_admin', 'admin') and exists (select 1 from public.orders target_order where target_order.id = order_catalog_items.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered'))
  )
);

drop policy "Operational users can read stage history" on public.order_stage_events;
create policy "Operational users can read stage history"
on public.order_stage_events for select to authenticated
using (
  (select public.current_active_role()) is not null
  and (
    exists (select 1 from public.orders target_order where target_order.id = order_stage_events.order_id and target_order.lifecycle_state = 'active')
    or (select public.current_active_role()) in ('super_admin', 'admin') and exists (select 1 from public.orders target_order where target_order.id = order_stage_events.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered'))
    or (select public.current_active_role()) = 'super_admin' and exists (select 1 from public.orders target_order where target_order.id = order_stage_events.order_id and target_order.lifecycle_state = 'purged_cancelled')
  )
);

drop policy "Financial roles can read order finances" on public.order_financials;
create policy "Financial roles can read order finances"
on public.order_financials for select to authenticated
using (
  (select public.current_active_role()) in ('super_admin', 'admin', 'attention')
  and (
    exists (select 1 from public.orders target_order where target_order.id = order_financials.order_id and target_order.lifecycle_state = 'active')
    or (select public.current_active_role()) in ('super_admin', 'admin') and exists (select 1 from public.orders target_order where target_order.id = order_financials.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered'))
    or (select public.current_active_role()) = 'super_admin' and exists (select 1 from public.orders target_order where target_order.id = order_financials.order_id and target_order.lifecycle_state = 'purged_cancelled')
  )
);

drop policy "Operational users read order lines" on public.order_lines;
create policy "Operational users read order lines" on public.order_lines for select to authenticated
using (
  (select public.current_active_role()) is not null and (
    exists (select 1 from public.orders target_order where target_order.id = order_lines.order_id and target_order.lifecycle_state = 'active')
    or (select public.current_active_role()) in ('super_admin', 'admin') and exists (select 1 from public.orders target_order where target_order.id = order_lines.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered'))
  )
);

drop policy "Operational users read line shields" on public.order_line_shields;
create policy "Operational users read line shields" on public.order_line_shields for select to authenticated
using (
  (select public.current_active_role()) is not null and (
    exists (select 1 from public.order_lines line join public.orders target_order on target_order.id = line.order_id where line.id = order_line_shields.order_line_id and target_order.lifecycle_state = 'active')
    or (select public.current_active_role()) in ('super_admin', 'admin') and exists (select 1 from public.order_lines line join public.orders target_order on target_order.id = line.order_id where line.id = order_line_shields.order_line_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered'))
  )
);

drop policy "Operational users can read order change events" on public.order_change_events;
create policy "Operational users can read order change events" on public.order_change_events for select to authenticated
using (
  (select public.current_active_role()) in ('super_admin', 'admin') and exists (select 1 from public.orders target_order where target_order.id = order_change_events.order_id and target_order.lifecycle_state in ('active', 'cancelled', 'archived_delivered'))
  or (select public.current_active_role()) = 'super_admin' and exists (select 1 from public.orders target_order where target_order.id = order_change_events.order_id and target_order.lifecycle_state = 'purged_cancelled')
);

drop policy "Operational users can read order comments" on public.order_comments;
create policy "Operational users can read order comments" on public.order_comments for select to authenticated
using (
  exists (select 1 from public.orders target_order where target_order.id = order_comments.order_id and target_order.lifecycle_state = 'active')
  or (select public.current_active_role()) in ('super_admin', 'admin') and exists (select 1 from public.orders target_order where target_order.id = order_comments.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered'))
);

drop policy "Operational users can read order design images" on public.order_design_images;
create policy "Operational users can read order design images" on public.order_design_images for select to authenticated
using (
  exists (select 1 from public.orders target_order where target_order.id = order_design_images.order_id and target_order.lifecycle_state = 'active')
  or (select public.current_active_role()) in ('super_admin', 'admin') and exists (select 1 from public.orders target_order where target_order.id = order_design_images.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered'))
);

drop policy "Operational users can read order design image events" on public.order_design_image_events;
create policy "Operational users can read order design image events" on public.order_design_image_events for select to authenticated
using (
  exists (select 1 from public.orders target_order where target_order.id = order_design_image_events.order_id and target_order.lifecycle_state = 'active')
  or (select public.current_active_role()) in ('super_admin', 'admin') and exists (select 1 from public.orders target_order where target_order.id = order_design_image_events.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered'))
);

drop policy "Financial roles can read order payments" on public.order_payments;
create policy "Financial roles can read order payments" on public.order_payments for select to authenticated
using (
  (select public.current_active_role()) in ('super_admin', 'admin', 'attention')
  and (exists (select 1 from public.orders target_order where target_order.id = order_payments.order_id and target_order.lifecycle_state = 'active')
    or (select public.current_active_role()) in ('super_admin', 'admin') and exists (select 1 from public.orders target_order where target_order.id = order_payments.order_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered'))
    or (select public.current_active_role()) = 'super_admin' and exists (select 1 from public.orders target_order where target_order.id = order_payments.order_id and target_order.lifecycle_state = 'purged_cancelled'))
);

drop policy "Financial roles can read order payment events" on public.order_payment_events;
create policy "Financial roles can read order payment events" on public.order_payment_events for select to authenticated
using (
  (select public.current_active_role()) in ('super_admin', 'admin', 'attention')
  and (exists (select 1 from public.order_payments payment join public.orders target_order on target_order.id = payment.order_id where payment.id = order_payment_events.order_payment_id and target_order.lifecycle_state = 'active')
    or (select public.current_active_role()) in ('super_admin', 'admin') and exists (select 1 from public.order_payments payment join public.orders target_order on target_order.id = payment.order_id where payment.id = order_payment_events.order_payment_id and target_order.lifecycle_state in ('cancelled', 'archived_delivered'))
    or (select public.current_active_role()) = 'super_admin' and exists (select 1 from public.order_payments payment join public.orders target_order on target_order.id = payment.order_id where payment.id = order_payment_events.order_payment_id and target_order.lifecycle_state = 'purged_cancelled'))
);

drop policy "Managers can read order lifecycle events" on public.order_lifecycle_events;
create policy "Managers can read order lifecycle events" on public.order_lifecycle_events for select to authenticated
using (
  (select public.current_active_role()) in ('super_admin', 'admin') and exists (select 1 from public.orders target_order where target_order.id = order_lifecycle_events.order_id and target_order.lifecycle_state in ('active', 'cancelled', 'archived_delivered'))
  or (select public.current_active_role()) = 'super_admin' and exists (select 1 from public.orders target_order where target_order.id = order_lifecycle_events.order_id and target_order.lifecycle_state = 'purged_cancelled')
);

drop policy "Operational users can read order design objects" on storage.objects;
create policy "Operational users can read order design objects" on storage.objects for select to authenticated
using (
  bucket_id = 'order-designs'
  and ((select public.current_active_role()) is not null)
  and exists (
    select 1 from public.orders target_order
    where target_order.id::text = split_part(name, '/', 2)
      and (target_order.lifecycle_state = 'active' or (select public.current_active_role()) in ('super_admin', 'admin') and target_order.lifecycle_state in ('cancelled', 'archived_delivered'))
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
  select * into target_order from public.orders where id = p_order_id;
  if not found or not actor.is_active or actor.must_change_password then raise exception 'El pedido seleccionado no existe.'; end if;
  if target_order.lifecycle_state in ('cancelled', 'archived_delivered') and actor.role not in ('super_admin', 'admin') then raise exception 'El pedido seleccionado no existe.'; end if;
  if target_order.lifecycle_state = 'purged_cancelled' and actor.role <> 'super_admin' then raise exception 'El pedido seleccionado no existe.'; end if;
  return query
  select * from (
    select stage_event.id, 'stage_moved'::text, profile.display_name, stage_event.created_at, '{}'::jsonb, null::text, null::text, stage_event.from_stage_id, stage_event.to_stage_id
    from public.order_stage_events stage_event join public.profiles profile on profile.id = stage_event.actor_id where stage_event.order_id = p_order_id
    union all
    select change_event.id, change_event.action, profile.display_name, change_event.created_at, change_event.details, null::text, change_event.change_note, null::uuid, null::uuid
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
