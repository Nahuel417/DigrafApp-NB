create table public.order_change_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  actor_id uuid not null references public.profiles (id),
  action text not null check (action in ('order_updated', 'promised_delivery_date_changed')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  order_updated_at timestamptz not null,
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 200),
  idempotency_fingerprint text not null check (char_length(idempotency_fingerprint) = 32),
  created_at timestamptz not null default now(),
  unique (actor_id, idempotency_key)
);

create table public.order_comments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  actor_id uuid not null references public.profiles (id),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 200),
  idempotency_fingerprint text not null check (char_length(idempotency_fingerprint) = 32),
  created_at timestamptz not null default now(),
  unique (actor_id, idempotency_key)
);

create index order_change_events_order_created_at_idx
  on public.order_change_events (order_id, created_at desc, action, id);

create index order_comments_order_created_at_idx
  on public.order_comments (order_id, created_at desc, id);

alter table public.order_change_events enable row level security;
alter table public.order_comments enable row level security;

revoke all on table public.order_change_events from anon, authenticated;
revoke all on table public.order_comments from anon, authenticated;

grant select on table public.order_change_events to authenticated;
grant select on table public.order_comments to authenticated;
grant select, insert, update, delete on table public.order_change_events to service_role;
grant select, insert, update, delete on table public.order_comments to service_role;

create policy "Operational users can read order change events"
on public.order_change_events
for select
to authenticated
using ((select public.current_active_role()) is not null);

create policy "Operational users can read order comments"
on public.order_comments
for select
to authenticated
using ((select public.current_active_role()) is not null);

create function public.update_order_description(
  p_order_id uuid,
  p_description text,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns table (
  order_id uuid,
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
  existing_event public.order_change_events%rowtype;
  normalized_description text;
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
    raise exception 'No tenés permiso para editar la descripción del pedido.';
  end if;

  if p_order_id is null or p_expected_updated_at is null
    or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'La solicitud de edición no es válida.';
  end if;

  normalized_description := nullif(btrim(coalesce(p_description, '')), '');
  if normalized_description is not null and char_length(normalized_description) > 5000 then
    raise exception 'La descripción no puede superar los 5000 caracteres.';
  end if;

  request_fingerprint := md5(concat_ws(
    '|',
    p_order_id::text,
    coalesce(normalized_description, ''),
    p_expected_updated_at::text
  ));

  select * into existing_event
  from public.order_change_events
  where actor_id = actor.id
    and idempotency_key = p_idempotency_key;

  if found then
    if existing_event.idempotency_fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra edición.';
    end if;

    return query
    select existing_event.order_id, existing_event.order_updated_at, existing_event.id;
    return;
  end if;

  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'El pedido seleccionado no existe.';
  end if;

  if target_order.updated_at <> p_expected_updated_at then
    raise exception 'El pedido cambió en otra sesión. Actualizalo e intentá nuevamente.';
  end if;

  update public.orders
  set description = normalized_description,
      updated_at = now()
  where id = target_order.id
  returning * into target_order;

  insert into public.order_change_events (
    order_id,
    actor_id,
    action,
    order_updated_at,
    idempotency_key,
    idempotency_fingerprint
  )
  values (
    target_order.id,
    actor.id,
    'order_updated',
    target_order.updated_at,
    p_idempotency_key,
    request_fingerprint
  )
  returning id into new_event_id;

  return query
  select target_order.id, target_order.updated_at, new_event_id;
end;
$$;

create function public.update_order(
  p_order_id uuid,
  p_customer_name text,
  p_quantity integer,
  p_order_type public.order_type,
  p_order_date date,
  p_promised_delivery_date date,
  p_description text,
  p_total_amount numeric,
  p_deposit_amount numeric,
  p_deposit_paid boolean,
  p_garment_upper_id uuid,
  p_garment_lower_id uuid,
  p_neckline_id uuid,
  p_upper_pattern_id uuid,
  p_lower_pattern_id uuid,
  p_fabric_id uuid,
  p_extra_ids uuid[],
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns table (
  order_id uuid,
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
  target_financials public.order_financials%rowtype;
  existing_event public.order_change_events%rowtype;
  selected public.catalog_items%rowtype;
  normalized_customer_name text;
  normalized_description text;
  request_fingerprint text;
  event_action text;
  event_details jsonb := '{}'::jsonb;
  new_event_id uuid;
  new_extra_id uuid;
  previous_promised_delivery_date date;
  preserved_garment_upper boolean;
  preserved_garment_lower boolean;
  preserved_neckline boolean;
  preserved_upper_pattern boolean;
  preserved_lower_pattern boolean;
  preserved_fabric boolean;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para editar datos sensibles del pedido.';
  end if;

  if p_order_id is null or p_order_type is null or p_order_date is null
    or p_promised_delivery_date is null or p_expected_updated_at is null
    or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'La solicitud de edición no es válida.';
  end if;

  normalized_customer_name := btrim(coalesce(p_customer_name, ''));
  if char_length(normalized_customer_name) < 2 or char_length(normalized_customer_name) > 200 then
    raise exception 'El cliente o equipo debe tener entre 2 y 200 caracteres.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;

  if p_promised_delivery_date < p_order_date then
    raise exception 'La fecha prometida no puede ser anterior a la fecha del pedido.';
  end if;

  normalized_description := nullif(btrim(coalesce(p_description, '')), '');
  if normalized_description is not null and char_length(normalized_description) > 5000 then
    raise exception 'La descripción no puede superar los 5000 caracteres.';
  end if;

  if p_total_amount is null or p_total_amount < 0 then
    raise exception 'El total debe ser mayor o igual a cero.';
  end if;

  if p_deposit_amount is null or p_deposit_amount < 0 then
    raise exception 'La seña debe ser mayor o igual a cero.';
  end if;

  if p_deposit_amount > p_total_amount then
    raise exception 'La seña no puede superar el total.';
  end if;

  if p_total_amount <> round(p_total_amount, 2)
    or p_deposit_amount <> round(p_deposit_amount, 2) then
    raise exception 'Los importes deben tener como máximo dos decimales.';
  end if;

  if p_deposit_paid is null then
    raise exception 'Indicá si la seña fue abonada.';
  end if;

  request_fingerprint := md5(concat_ws(
    '|',
    p_order_id::text,
    normalized_customer_name,
    p_quantity::text,
    p_order_type::text,
    p_order_date::text,
    p_promised_delivery_date::text,
    coalesce(normalized_description, ''),
    p_total_amount::text,
    p_deposit_amount::text,
    p_deposit_paid::text,
    coalesce(p_garment_upper_id::text, ''),
    coalesce(p_garment_lower_id::text, ''),
    coalesce(p_neckline_id::text, ''),
    coalesce(p_upper_pattern_id::text, ''),
    coalesce(p_lower_pattern_id::text, ''),
    coalesce(p_fabric_id::text, ''),
    coalesce((
      select string_agg(extra_value::text, ',' order by extra_value)
      from unnest(coalesce(p_extra_ids, array[]::uuid[])) as extra_values(extra_value)
    ), ''),
    p_expected_updated_at::text
  ));

  select * into existing_event
  from public.order_change_events
  where actor_id = actor.id
    and idempotency_key = p_idempotency_key;

  if found then
    if existing_event.idempotency_fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra edición.';
    end if;

    return query
    select existing_event.order_id, existing_event.order_updated_at, existing_event.id;
    return;
  end if;

  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'El pedido seleccionado no existe.';
  end if;

  if target_order.updated_at <> p_expected_updated_at then
    raise exception 'El pedido cambió en otra sesión. Actualizalo e intentá nuevamente.';
  end if;

  select * into target_financials
  from public.order_financials
  where order_financials.order_id = target_order.id
  for update;

  if not found then
    raise exception 'Los importes del pedido no están disponibles.';
  end if;

  select exists (
    select 1 from public.order_catalog_items
    where order_catalog_items.order_id = target_order.id and selection_key = 'garment_upper' and catalog_item_id is null
  ) into preserved_garment_upper;
  select exists (
    select 1 from public.order_catalog_items
    where order_catalog_items.order_id = target_order.id and selection_key = 'garment_lower' and catalog_item_id is null
  ) into preserved_garment_lower;
  select exists (
    select 1 from public.order_catalog_items
    where order_catalog_items.order_id = target_order.id and selection_key = 'neckline' and catalog_item_id is null
  ) into preserved_neckline;
  select exists (
    select 1 from public.order_catalog_items
    where order_catalog_items.order_id = target_order.id and selection_key = 'upper_pattern' and catalog_item_id is null
  ) into preserved_upper_pattern;
  select exists (
    select 1 from public.order_catalog_items
    where order_catalog_items.order_id = target_order.id and selection_key = 'lower_pattern' and catalog_item_id is null
  ) into preserved_lower_pattern;
  select exists (
    select 1 from public.order_catalog_items
    where order_catalog_items.order_id = target_order.id and selection_key = 'fabric' and catalog_item_id is null
  ) into preserved_fabric;

  if p_order_type = 'set' then
    if not (p_garment_upper_id is not null or preserved_garment_upper)
      or not (p_garment_lower_id is not null or preserved_garment_lower)
      or not (p_neckline_id is not null or preserved_neckline)
      or not (p_upper_pattern_id is not null or preserved_upper_pattern)
      or not (p_lower_pattern_id is not null or preserved_lower_pattern) then
      raise exception 'Un conjunto requiere prendas, cuello y ambos moldes.';
    end if;
  elsif (p_garment_upper_id is not null or preserved_garment_upper)
    = (p_garment_lower_id is not null or preserved_garment_lower) then
    raise exception 'Una prenda individual debe ser superior o inferior.';
  elsif (p_garment_upper_id is not null or preserved_garment_upper)
    and (not (p_neckline_id is not null or preserved_neckline)
      or not (p_upper_pattern_id is not null or preserved_upper_pattern)
      or p_lower_pattern_id is not null) then
    raise exception 'La prenda superior requiere cuello y molde superior.';
  elsif (p_garment_lower_id is not null or preserved_garment_lower)
    and (p_neckline_id is not null
      or not (p_lower_pattern_id is not null or preserved_lower_pattern)
      or p_upper_pattern_id is not null) then
    raise exception 'La prenda inferior requiere molde inferior y no lleva cuello.';
  end if;

  if not (p_fabric_id is not null or preserved_fabric) then
    raise exception 'Seleccioná una tela.';
  end if;

  if p_garment_upper_id is not null then
    select * into selected from public.catalog_items where id = p_garment_upper_id and is_active;
    if not found or selected.kind <> 'garment' or selected.garment_layer <> 'upper' then
      raise exception 'Seleccioná una prenda superior activa.';
    end if;
  end if;

  if p_garment_lower_id is not null then
    select * into selected from public.catalog_items where id = p_garment_lower_id and is_active;
    if not found or selected.kind <> 'garment' or selected.garment_layer <> 'lower' then
      raise exception 'Seleccioná una prenda inferior activa.';
    end if;
  end if;

  if p_neckline_id is not null then
    select * into selected from public.catalog_items where id = p_neckline_id and is_active;
    if not found or selected.kind <> 'neckline' then
      raise exception 'Seleccioná un cuello activo.';
    end if;
  end if;

  if p_upper_pattern_id is not null then
    select * into selected from public.catalog_items where id = p_upper_pattern_id and is_active;
    if not found or selected.kind <> 'upper_pattern' then
      raise exception 'Seleccioná un molde superior activo.';
    end if;
  end if;

  if p_lower_pattern_id is not null then
    select * into selected from public.catalog_items where id = p_lower_pattern_id and is_active;
    if not found or selected.kind <> 'lower_pattern' then
      raise exception 'Seleccioná un molde inferior activo.';
    end if;
  end if;

  if p_fabric_id is not null then
    select * into selected from public.catalog_items where id = p_fabric_id and is_active;
    if not found or selected.kind <> 'fabric' then
      raise exception 'Seleccioná una tela activa.';
    end if;
  end if;

  for new_extra_id in select extra_value from unnest(coalesce(p_extra_ids, array[]::uuid[])) as extra_values(extra_value) loop
    select * into selected from public.catalog_items where id = new_extra_id and is_active;
    if not found or selected.kind <> 'extra' then
      raise exception 'Uno de los extras seleccionados no está disponible.';
    end if;
  end loop;

  previous_promised_delivery_date := target_order.promised_delivery_date;

  update public.orders
  set customer_name = normalized_customer_name,
      quantity = p_quantity,
      order_type = p_order_type,
      order_date = p_order_date,
      promised_delivery_date = p_promised_delivery_date,
      description = normalized_description,
      updated_at = now()
  where id = target_order.id
  returning * into target_order;

  update public.order_financials
  set total_amount = p_total_amount,
      deposit_amount = p_deposit_amount,
      deposit_paid = p_deposit_paid,
      updated_at = now()
  where order_financials.order_id = target_order.id;

  delete from public.order_catalog_items
  where order_catalog_items.order_id = target_order.id
    and catalog_item_id is not null;

  if p_garment_upper_id is not null then
    select * into selected from public.catalog_items where id = p_garment_upper_id;
    insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
    values (target_order.id, selected.id, 'garment_upper', selected.kind, selected.garment_layer, selected.name);
  end if;

  if p_garment_lower_id is not null then
    select * into selected from public.catalog_items where id = p_garment_lower_id;
    insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
    values (target_order.id, selected.id, 'garment_lower', selected.kind, selected.garment_layer, selected.name);
  end if;

  if p_neckline_id is not null then
    select * into selected from public.catalog_items where id = p_neckline_id;
    insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
    values (target_order.id, selected.id, 'neckline', selected.kind, selected.garment_layer, selected.name);
  end if;

  if p_upper_pattern_id is not null then
    select * into selected from public.catalog_items where id = p_upper_pattern_id;
    insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
    values (target_order.id, selected.id, 'upper_pattern', selected.kind, selected.garment_layer, selected.name);
  end if;

  if p_lower_pattern_id is not null then
    select * into selected from public.catalog_items where id = p_lower_pattern_id;
    insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
    values (target_order.id, selected.id, 'lower_pattern', selected.kind, selected.garment_layer, selected.name);
  end if;

  if p_fabric_id is not null then
    select * into selected from public.catalog_items where id = p_fabric_id;
    insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
    values (target_order.id, selected.id, 'fabric', selected.kind, selected.garment_layer, selected.name);
  end if;

  for new_extra_id in select extra_value from unnest(coalesce(p_extra_ids, array[]::uuid[])) as extra_values(extra_value) loop
    select * into selected from public.catalog_items where id = new_extra_id;
    insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
    values (target_order.id, selected.id, 'extra', selected.kind, selected.garment_layer, selected.name);
  end loop;

  if previous_promised_delivery_date <> p_promised_delivery_date then
    event_action := 'promised_delivery_date_changed';
    event_details := jsonb_build_object(
      'previous_promised_delivery_date', previous_promised_delivery_date,
      'next_promised_delivery_date', p_promised_delivery_date
    );
  else
    event_action := 'order_updated';
  end if;

  insert into public.order_change_events (
    order_id,
    actor_id,
    action,
    details,
    order_updated_at,
    idempotency_key,
    idempotency_fingerprint
  )
  values (
    target_order.id,
    actor.id,
    event_action,
    event_details,
    target_order.updated_at,
    p_idempotency_key,
    request_fingerprint
  )
  returning id into new_event_id;

  return query
  select target_order.id, target_order.updated_at, new_event_id;
end;
$$;

create function public.create_order_comment(
  p_order_id uuid,
  p_body text,
  p_idempotency_key text
)
returns table (
  comment_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  existing_comment public.order_comments%rowtype;
  normalized_body text;
  request_fingerprint text;
  new_comment_id uuid;
  new_created_at timestamptz;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role not in ('super_admin', 'admin', 'attention', 'employee') then
    raise exception 'No tenés permiso para comentar pedidos.';
  end if;

  if p_order_id is null
    or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'La solicitud de comentario no es válida.';
  end if;

  normalized_body := btrim(coalesce(p_body, ''));
  if char_length(normalized_body) not between 1 and 5000 then
    raise exception 'El comentario debe tener entre 1 y 5000 caracteres.';
  end if;

  request_fingerprint := md5(concat_ws('|', p_order_id::text, normalized_body));

  select * into existing_comment
  from public.order_comments
  where actor_id = actor.id
    and idempotency_key = p_idempotency_key;

  if found then
    if existing_comment.idempotency_fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otro comentario.';
    end if;

    return query
    select existing_comment.id, existing_comment.created_at;
    return;
  end if;

  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'El pedido seleccionado no existe.';
  end if;

  insert into public.order_comments as comment (
    order_id,
    actor_id,
    body,
    idempotency_key,
    idempotency_fingerprint
  )
  values (
    p_order_id,
    actor.id,
    normalized_body,
    p_idempotency_key,
    request_fingerprint
  )
  returning comment.id, comment.created_at into new_comment_id, new_created_at;

  return query
  select new_comment_id, new_created_at;
end;
$$;

create function public.get_order_timeline(p_order_id uuid)
returns table (
  event_id uuid,
  event_type text,
  actor_display_name text,
  occurred_at timestamptz,
  details jsonb,
  comment_body text,
  from_stage_id uuid,
  to_stage_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid());

  if not found or not actor.is_active or actor.must_change_password then
    raise exception 'No tenés permiso para ver el historial del pedido.';
  end if;

  if p_order_id is null or not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'El pedido seleccionado no existe.';
  end if;

  return query
  select *
  from (
    select
      stage_event.id as event_id,
      'stage_moved'::text as event_type,
      profile.display_name as actor_display_name,
      stage_event.created_at as occurred_at,
      '{}'::jsonb as details,
      null::text as comment_body,
      stage_event.from_stage_id,
      stage_event.to_stage_id
    from public.order_stage_events stage_event
    join public.profiles profile on profile.id = stage_event.actor_id
    where stage_event.order_id = p_order_id

    union all

    select
      change_event.id as event_id,
      change_event.action as event_type,
      profile.display_name as actor_display_name,
      change_event.created_at as occurred_at,
      change_event.details,
      null::text as comment_body,
      null::uuid as from_stage_id,
      null::uuid as to_stage_id
    from public.order_change_events change_event
    join public.profiles profile on profile.id = change_event.actor_id
    where change_event.order_id = p_order_id

    union all

    select
      comment.id as event_id,
      'commented'::text as event_type,
      profile.display_name as actor_display_name,
      comment.created_at as occurred_at,
      '{}'::jsonb as details,
      comment.body as comment_body,
      null::uuid as from_stage_id,
      null::uuid as to_stage_id
    from public.order_comments comment
    join public.profiles profile on profile.id = comment.actor_id
    where comment.order_id = p_order_id
  ) as timeline
  order by timeline.occurred_at desc, timeline.event_type asc, timeline.event_id asc;
end;
$$;

revoke all on function public.update_order_description(uuid, text, timestamptz, text) from public;
revoke all on function public.update_order(uuid, text, integer, public.order_type, date, date, text, numeric, numeric, boolean, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], timestamptz, text) from public;
revoke all on function public.create_order_comment(uuid, text, text) from public;
revoke all on function public.get_order_timeline(uuid) from public;

grant execute on function public.update_order_description(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.update_order(uuid, text, integer, public.order_type, date, date, text, numeric, numeric, boolean, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], timestamptz, text) to authenticated;
grant execute on function public.create_order_comment(uuid, text, text) to authenticated;
grant execute on function public.get_order_timeline(uuid) to authenticated;
