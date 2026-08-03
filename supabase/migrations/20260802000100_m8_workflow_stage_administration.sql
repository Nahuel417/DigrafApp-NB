alter table public.order_stage_events
  add column from_stage_name text check (from_stage_name is null or char_length(btrim(from_stage_name)) between 2 and 80),
  add column to_stage_name text check (to_stage_name is null or char_length(btrim(to_stage_name)) between 2 and 80);

create function public.capture_order_stage_event_names()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_name text;
  destination_name text;
begin
  if new.from_stage_id is not null and new.from_stage_name is null then
    select name into source_name
    from public.workflow_stages
    where id = new.from_stage_id;
    new.from_stage_name := source_name;
  end if;

  if new.to_stage_name is null then
    select name into destination_name
    from public.workflow_stages
    where id = new.to_stage_id;
    new.to_stage_name := destination_name;
  end if;

  return new;
end;
$$;

create trigger capture_order_stage_event_names
before insert on public.order_stage_events
for each row execute function public.capture_order_stage_event_names();

create table public.workflow_stage_events (
  id uuid primary key default gen_random_uuid(),
  workflow_stage_id uuid references public.workflow_stages (id),
  actor_id uuid not null references public.profiles (id),
  action text not null check (action in ('created', 'renamed', 'reordered', 'retired')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 200),
  idempotency_fingerprint text not null check (char_length(idempotency_fingerprint) = 32),
  created_at timestamptz not null default now(),
  unique (actor_id, idempotency_key)
);

create index workflow_stage_events_stage_created_at_idx
  on public.workflow_stage_events (workflow_stage_id, created_at desc, id);

create index workflow_stage_events_actor_created_at_idx
  on public.workflow_stage_events (actor_id, created_at desc, id);

alter table public.workflow_stage_events enable row level security;

revoke all on table public.workflow_stage_events from anon, authenticated;
grant select on table public.workflow_stage_events to authenticated;
grant select, insert, update, delete on table public.workflow_stage_events to service_role;

drop policy "Operational users can read active workflow stages" on public.workflow_stages;

create policy "Operational users can read workflow stages"
on public.workflow_stages
for select
to authenticated
using (
  (select public.current_active_role()) is not null
  and (
    is_active
    or (select public.current_active_role()) in ('super_admin', 'admin')
  )
);

create policy "Managers can read workflow stage events"
on public.workflow_stage_events
for select
to authenticated
using ((select public.current_active_role()) in ('super_admin', 'admin'));

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
      persisted_order.updated_at,
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

  if source_stage.code = 'paid' or destination_stage.code = 'paid' then
    raise exception 'Los movimientos hacia o desde Pagado estarán disponibles al confirmar el cobro.';
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

create function public.create_workflow_stage(
  p_name text,
  p_idempotency_key text
)
returns table (
  stage_id uuid,
  stage_code text,
  stage_name text,
  stage_position integer,
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_stage public.workflow_stages%rowtype;
  existing_event public.workflow_stage_events%rowtype;
  normalized_name text;
  request_fingerprint text;
  new_event_id uuid;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para administrar etapas.';
  end if;

  normalized_name := btrim(coalesce(p_name, ''));
  if char_length(normalized_name) not between 2 and 80
    or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'La solicitud de etapa no es válida.';
  end if;

  request_fingerprint := md5(concat_ws('|', 'created', normalized_name));
  perform pg_advisory_xact_lock(hashtext('digraf:workflow-stage:' || actor.id::text || ':' || p_idempotency_key));
  select * into existing_event from public.workflow_stage_events
  where actor_id = actor.id and idempotency_key = p_idempotency_key;
  if found then
    if existing_event.idempotency_fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra operación de etapas.';
    end if;
    return query
    select
      persisted_stage.id,
      persisted_stage.code,
      persisted_stage.name,
      persisted_stage.position,
      existing_event.id
    from public.workflow_stages persisted_stage
    where persisted_stage.id = existing_event.workflow_stage_id;
    return;
  end if;

  lock table public.workflow_stages in share row exclusive mode;
  insert into public.workflow_stages (code, name, position)
  values (
    'stage_' || replace(gen_random_uuid()::text, '-', ''),
    normalized_name,
    coalesce((select max(position) + 1 from public.workflow_stages where is_active), 0)
  )
  returning * into target_stage;

  insert into public.workflow_stage_events (workflow_stage_id, actor_id, action, details, idempotency_key, idempotency_fingerprint)
  values (
    target_stage.id,
    actor.id,
    'created',
    jsonb_build_object('version', 1, 'code', target_stage.code, 'name', target_stage.name, 'position', target_stage.position),
    p_idempotency_key,
    request_fingerprint
  )
  returning id into new_event_id;

  return query select target_stage.id, target_stage.code, target_stage.name, target_stage.position, new_event_id;
end;
$$;

create function public.rename_workflow_stage(
  p_stage_id uuid,
  p_name text,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns table (stage_id uuid, stage_name text, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_stage public.workflow_stages%rowtype;
  existing_event public.workflow_stage_events%rowtype;
  normalized_name text;
  request_fingerprint text;
  previous_name text;
  new_event_id uuid;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para administrar etapas.';
  end if;

  normalized_name := btrim(coalesce(p_name, ''));
  if p_stage_id is null
    or p_expected_updated_at is null
    or char_length(normalized_name) not between 2 and 80
    or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'La solicitud de etapa no es válida.';
  end if;

  request_fingerprint := md5(concat_ws('|', 'renamed', p_stage_id::text, normalized_name, p_expected_updated_at::text));
  perform pg_advisory_xact_lock(hashtext('digraf:workflow-stage:' || actor.id::text || ':' || p_idempotency_key));
  select * into existing_event from public.workflow_stage_events
  where actor_id = actor.id and idempotency_key = p_idempotency_key;
  if found then
    if existing_event.idempotency_fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra operación de etapas.';
    end if;
    return query select existing_event.workflow_stage_id, existing_event.details->>'name', existing_event.id;
    return;
  end if;

  select * into target_stage from public.workflow_stages where id = p_stage_id for update;
  if not found then raise exception 'La etapa seleccionada no existe.'; end if;
  if target_stage.updated_at <> p_expected_updated_at then
    raise exception 'La etapa cambió en otra sesión. Actualizá e intentá nuevamente.';
  end if;
  if target_stage.name = normalized_name then raise exception 'No hay cambios para guardar.'; end if;

  previous_name := target_stage.name;
  update public.workflow_stages
  set name = normalized_name, updated_at = now()
  where id = target_stage.id
  returning * into target_stage;

  insert into public.workflow_stage_events (workflow_stage_id, actor_id, action, details, idempotency_key, idempotency_fingerprint)
  values (
    target_stage.id,
    actor.id,
    'renamed',
    jsonb_build_object('version', 1, 'previous_name', previous_name, 'name', target_stage.name),
    p_idempotency_key,
    request_fingerprint
  )
  returning id into new_event_id;

  return query select target_stage.id, target_stage.name, new_event_id;
end;
$$;

create function public.reorder_workflow_stages(
  p_stage_ids uuid[],
  p_expected_stage_ids uuid[],
  p_idempotency_key text
)
returns table (event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  existing_event public.workflow_stage_events%rowtype;
  active_stage_ids uuid[];
  previous_stage_ids uuid[];
  active_stage_count integer;
  request_fingerprint text;
  new_event_id uuid;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para administrar etapas.';
  end if;

  if p_stage_ids is null
    or p_expected_stage_ids is null
    or cardinality(p_stage_ids) = 0
    or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'La solicitud de reordenamiento no es válida.';
  end if;

  request_fingerprint := md5(concat_ws('|', 'reordered', array_to_string(p_stage_ids, '|'), array_to_string(p_expected_stage_ids, '|')));
  perform pg_advisory_xact_lock(hashtext('digraf:workflow-stage:' || actor.id::text || ':' || p_idempotency_key));
  select * into existing_event from public.workflow_stage_events
  where actor_id = actor.id and idempotency_key = p_idempotency_key;
  if found then
    if existing_event.idempotency_fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra operación de etapas.';
    end if;
    return query select existing_event.id;
    return;
  end if;

  lock table public.workflow_stages in share row exclusive mode;
  select count(*), array_agg(id order by id), array_agg(id order by position, id)
  into active_stage_count, active_stage_ids, previous_stage_ids
  from public.workflow_stages
  where is_active;

  if cardinality(p_stage_ids) <> active_stage_count
    or (select count(distinct stage_id) from unnest(p_stage_ids) as stage_id) <> cardinality(p_stage_ids)
    or not (p_stage_ids <@ active_stage_ids) then
    raise exception 'El reordenamiento debe incluir una sola vez todas las etapas activas.';
  end if;
  if p_expected_stage_ids <> previous_stage_ids then
    raise exception 'Las etapas cambiaron en otra sesión. Actualizá e intentá nuevamente.';
  end if;

  update public.workflow_stages stage
  set position = ordered.position,
      updated_at = now()
  from unnest(p_stage_ids) with ordinality as ordered(id, position)
  where stage.id = ordered.id
    and stage.position <> ordered.position - 1;

  insert into public.workflow_stage_events (workflow_stage_id, actor_id, action, details, idempotency_key, idempotency_fingerprint)
  values (
    null,
    actor.id,
    'reordered',
    jsonb_build_object('version', 1, 'previous_stage_ids', to_jsonb(previous_stage_ids), 'stage_ids', to_jsonb(p_stage_ids)),
    p_idempotency_key,
    request_fingerprint
  )
  returning id into new_event_id;

  return query select new_event_id;
end;
$$;

create function public.retire_workflow_stage(
  p_stage_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns table (stage_id uuid, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_stage public.workflow_stages%rowtype;
  existing_event public.workflow_stage_events%rowtype;
  active_ordinary_stage_count integer;
  request_fingerprint text;
  new_event_id uuid;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para administrar etapas.';
  end if;

  if p_stage_id is null
    or p_expected_updated_at is null
    or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'La solicitud de retiro no es válida.';
  end if;

  request_fingerprint := md5(concat_ws('|', 'retired', p_stage_id::text, p_expected_updated_at::text));
  perform pg_advisory_xact_lock(hashtext('digraf:workflow-stage:' || actor.id::text || ':' || p_idempotency_key));
  select * into existing_event from public.workflow_stage_events
  where actor_id = actor.id and idempotency_key = p_idempotency_key;
  if found then
    if existing_event.idempotency_fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra operación de etapas.';
    end if;
    return query select existing_event.workflow_stage_id, existing_event.id;
    return;
  end if;

  lock table public.workflow_stages in share row exclusive mode;
  select * into target_stage from public.workflow_stages where id = p_stage_id for update;
  if not found or not target_stage.is_active then raise exception 'La etapa seleccionada no está disponible.'; end if;
  if target_stage.updated_at <> p_expected_updated_at then
    raise exception 'La etapa cambió en otra sesión. Actualizá e intentá nuevamente.';
  end if;
  if target_stage.code in ('received', 'paid', 'delivered') then
    raise exception 'La etapa seleccionada no se puede retirar.';
  end if;

  if exists (select 1 from public.orders where current_stage_id = target_stage.id) then
    raise exception 'No se puede retirar una etapa que tiene pedidos.';
  end if;

  select count(*) into active_ordinary_stage_count
  from public.workflow_stages
  where is_active and code not in ('received', 'paid', 'delivered');
  if active_ordinary_stage_count <= 1 then
    raise exception 'Debe permanecer al menos una etapa ordinaria activa.';
  end if;

  update public.workflow_stages
  set is_active = false, updated_at = now()
  where id = target_stage.id;

  insert into public.workflow_stage_events (workflow_stage_id, actor_id, action, details, idempotency_key, idempotency_fingerprint)
  values (
    target_stage.id,
    actor.id,
    'retired',
    jsonb_build_object('version', 1, 'code', target_stage.code, 'name', target_stage.name, 'position', target_stage.position),
    p_idempotency_key,
    request_fingerprint
  )
  returning id into new_event_id;

  return query select target_stage.id, new_event_id;
end;
$$;

revoke all on function public.create_workflow_stage(text, text) from public;
revoke all on function public.rename_workflow_stage(uuid, text, timestamptz, text) from public;
revoke all on function public.reorder_workflow_stages(uuid[], uuid[], text) from public;
revoke all on function public.retire_workflow_stage(uuid, timestamptz, text) from public;

grant execute on function public.create_workflow_stage(text, text) to authenticated;
grant execute on function public.rename_workflow_stage(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.reorder_workflow_stages(uuid[], uuid[], text) to authenticated;
grant execute on function public.retire_workflow_stage(uuid, timestamptz, text) to authenticated;
