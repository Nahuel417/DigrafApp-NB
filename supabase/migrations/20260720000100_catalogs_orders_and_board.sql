create type public.catalog_item_kind as enum (
  'garment',
  'neckline',
  'upper_pattern',
  'lower_pattern',
  'fabric',
  'extra'
);

create type public.garment_layer as enum (
  'upper',
  'lower'
);

create type public.order_type as enum (
  'set',
  'individual'
);

create sequence public.orders_public_number_seq
  as bigint
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

create table public.workflow_stages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = lower(code) and code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  position integer not null check (position >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  kind public.catalog_item_kind not null,
  garment_layer public.garment_layer,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  name_key text generated always as (lower(btrim(name))) stored,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles (id),
  updated_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_items_layer_consistency check (
    (kind = 'garment' and garment_layer is not null)
    or (kind <> 'garment' and garment_layer is null)
  ),
  unique (kind, name_key)
);

create table public.catalog_item_events (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.catalog_items (id),
  actor_id uuid not null references public.profiles (id),
  action text not null check (action in ('created', 'renamed', 'retired', 'activated')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  public_number bigint not null default nextval('public.orders_public_number_seq'),
  customer_name text not null check (char_length(btrim(customer_name)) between 2 and 200),
  quantity integer not null check (quantity > 0),
  order_type public.order_type not null,
  order_date date not null,
  promised_delivery_date date not null,
  description text check (description is null or char_length(description) <= 5000),
  current_stage_id uuid not null references public.workflow_stages (id),
  created_by uuid not null references public.profiles (id),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  idempotency_fingerprint text not null check (char_length(idempotency_fingerprint) = 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_promised_date_check check (promised_delivery_date >= order_date),
  unique (public_number),
  unique (created_by, idempotency_key)
);

create table public.order_financials (
  order_id uuid primary key references public.orders (id),
  total_amount numeric(14, 2) not null check (total_amount >= 0),
  deposit_amount numeric(14, 2) not null check (deposit_amount >= 0 and deposit_amount <= total_amount),
  deposit_paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_catalog_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  catalog_item_id uuid not null references public.catalog_items (id),
  selection_key text not null check (
    selection_key in (
      'garment_upper',
      'garment_lower',
      'neckline',
      'upper_pattern',
      'lower_pattern',
      'fabric',
      'extra'
    )
  ),
  catalog_kind public.catalog_item_kind not null,
  garment_layer public.garment_layer,
  item_name text not null check (char_length(btrim(item_name)) between 2 and 100),
  created_at timestamptz not null default now(),
  unique (order_id, selection_key, catalog_item_id)
);

create table public.order_stage_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  from_stage_id uuid references public.workflow_stages (id),
  to_stage_id uuid not null references public.workflow_stages (id),
  actor_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint order_stage_events_different_stage check (from_stage_id is null or from_stage_id <> to_stage_id)
);

create index workflow_stages_position_idx
  on public.workflow_stages (position)
  where is_active;

create index catalog_items_kind_active_name_idx
  on public.catalog_items (kind, is_active, name_key);

create index catalog_item_events_item_created_at_idx
  on public.catalog_item_events (catalog_item_id, created_at desc);

create index orders_stage_created_at_idx
  on public.orders (current_stage_id, created_at desc);

create index orders_created_by_created_at_idx
  on public.orders (created_by, created_at desc);

create index order_catalog_items_order_idx
  on public.order_catalog_items (order_id);

create index order_catalog_items_catalog_item_idx
  on public.order_catalog_items (catalog_item_id);

create index order_stage_events_order_created_at_idx
  on public.order_stage_events (order_id, created_at desc);

create index order_stage_events_actor_created_at_idx
  on public.order_stage_events (actor_id, created_at desc);

insert into public.workflow_stages (code, name, position)
values
  ('received', 'Pedido recibido', 0),
  ('design', 'Diseño', 1),
  ('cut', 'Corte', 2),
  ('printing', 'Estampado', 3),
  ('sewing', 'Costura', 4),
  ('quality_control', 'Control de calidad', 5),
  ('paid', 'Pagado', 6),
  ('delivered', 'Entregado', 7);

alter table public.workflow_stages enable row level security;
alter table public.catalog_items enable row level security;
alter table public.catalog_item_events enable row level security;
alter table public.orders enable row level security;
alter table public.order_financials enable row level security;
alter table public.order_catalog_items enable row level security;
alter table public.order_stage_events enable row level security;

revoke all on table public.workflow_stages from anon, authenticated;
revoke all on table public.catalog_items from anon, authenticated;
revoke all on table public.catalog_item_events from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_financials from anon, authenticated;
revoke all on table public.order_catalog_items from anon, authenticated;
revoke all on table public.order_stage_events from anon, authenticated;
revoke all on sequence public.orders_public_number_seq from anon, authenticated;

grant select on table public.workflow_stages to authenticated;
grant select on table public.catalog_items to authenticated;
grant select on table public.catalog_item_events to authenticated;
grant select on table public.orders to authenticated;
grant select on table public.order_financials to authenticated;
grant select on table public.order_catalog_items to authenticated;
grant select on table public.order_stage_events to authenticated;

grant select, insert, update, delete on table public.workflow_stages to service_role;
grant select, insert, update, delete on table public.catalog_items to service_role;
grant select, insert, update, delete on table public.catalog_item_events to service_role;
grant select, insert, update, delete on table public.orders to service_role;
grant select, insert, update, delete on table public.order_financials to service_role;
grant select, insert, update, delete on table public.order_catalog_items to service_role;
grant select, insert, update, delete on table public.order_stage_events to service_role;
grant usage, select on sequence public.orders_public_number_seq to service_role;

create or replace function public.current_active_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and is_active
    and not must_change_password
$$;

create policy "Operational users can read active workflow stages"
on public.workflow_stages
for select
to authenticated
using ((select public.current_active_role()) is not null and is_active);

create policy "Operational users can read active catalogs"
on public.catalog_items
for select
to authenticated
using (
  (select public.current_active_role()) is not null
  and (is_active or (select public.current_active_role()) in ('super_admin', 'admin'))
);

create policy "Managers can read catalog item events"
on public.catalog_item_events
for select
to authenticated
using ((select public.current_active_role()) in ('super_admin', 'admin'));

create policy "Operational users can read orders"
on public.orders
for select
to authenticated
using ((select public.current_active_role()) is not null);

create policy "Operational users can read order specifications"
on public.order_catalog_items
for select
to authenticated
using ((select public.current_active_role()) is not null);

create policy "Operational users can read stage history"
on public.order_stage_events
for select
to authenticated
using ((select public.current_active_role()) is not null);

create policy "Financial roles can read order finances"
on public.order_financials
for select
to authenticated
using ((select public.current_active_role()) in ('super_admin', 'admin', 'attention'));

create function public.create_catalog_item(
  target_kind public.catalog_item_kind,
  target_garment_layer text,
  target_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  normalized_name text;
  normalized_layer public.garment_layer;
  item_id uuid;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para administrar catálogos.';
  end if;

  if target_kind is null then
    raise exception 'Seleccioná un tipo de catálogo.';
  end if;

  begin
    normalized_layer := nullif(btrim(coalesce(target_garment_layer, '')), '')::public.garment_layer;
  exception
    when invalid_text_representation then
      raise exception 'La clasificación de la prenda no es válida.';
  end;

  normalized_name := btrim(coalesce(target_name, ''));
  if char_length(normalized_name) < 2 or char_length(normalized_name) > 100 then
    raise exception 'El nombre debe tener entre 2 y 100 caracteres.';
  end if;

  if target_kind = 'garment' and normalized_layer is null then
    raise exception 'Una prenda debe indicar si es superior o inferior.';
  end if;

  if target_kind <> 'garment' and normalized_layer is not null then
    raise exception 'Solo las prendas tienen clasificación superior o inferior.';
  end if;

  if exists (
    select 1
    from public.catalog_items
    where kind = target_kind
      and name_key = lower(normalized_name)
  ) then
    raise exception 'Ya existe un ítem con ese nombre en el catálogo.';
  end if;

  insert into public.catalog_items (kind, garment_layer, name, created_by, updated_by)
  values (target_kind, normalized_layer, normalized_name, actor.id, actor.id)
  returning id into item_id;

  insert into public.catalog_item_events (catalog_item_id, actor_id, action, details)
  values (
    item_id,
    actor.id,
    'created',
    jsonb_build_object('kind', target_kind, 'garment_layer', normalized_layer, 'name', normalized_name)
  );

  return item_id;
end;
$$;

create function public.rename_catalog_item(
  target_id uuid,
  target_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  item public.catalog_items%rowtype;
  normalized_name text;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para administrar catálogos.';
  end if;

  select * into item
  from public.catalog_items
  where id = target_id
  for update;

  if not found then
    raise exception 'El ítem de catálogo seleccionado no existe.';
  end if;

  normalized_name := btrim(coalesce(target_name, ''));
  if char_length(normalized_name) < 2 or char_length(normalized_name) > 100 then
    raise exception 'El nombre debe tener entre 2 y 100 caracteres.';
  end if;

  if exists (
    select 1
    from public.catalog_items
    where kind = item.kind
      and name_key = lower(normalized_name)
      and id <> item.id
  ) then
    raise exception 'Ya existe un ítem con ese nombre en el catálogo.';
  end if;

  update public.catalog_items
  set name = normalized_name, updated_by = actor.id, updated_at = now()
  where id = item.id;

  insert into public.catalog_item_events (catalog_item_id, actor_id, action, details)
  values (
    item.id,
    actor.id,
    'renamed',
    jsonb_build_object('previous_name', item.name, 'next_name', normalized_name)
  );
end;
$$;

create function public.set_catalog_item_active(
  target_id uuid,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  item public.catalog_items%rowtype;
  action_name text;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para administrar catálogos.';
  end if;

  select * into item
  from public.catalog_items
  where id = target_id
  for update;

  if not found then
    raise exception 'El ítem de catálogo seleccionado no existe.';
  end if;

  if item.is_active = target_is_active then
    return;
  end if;

  update public.catalog_items
  set is_active = target_is_active, updated_by = actor.id, updated_at = now()
  where id = item.id;

  action_name := case when target_is_active then 'activated' else 'retired' end;
  insert into public.catalog_item_events (catalog_item_id, actor_id, action, details)
  values (
    item.id,
    actor.id,
    action_name,
    jsonb_build_object('previous_is_active', item.is_active, 'next_is_active', target_is_active)
  );
end;
$$;

create function public.create_order(
  p_customer_name text,
  p_quantity integer,
  p_order_type public.order_type,
  p_order_date date,
  p_promised_delivery_date date,
  p_description text,
  p_total_amount text,
  p_deposit_amount text,
  p_deposit_paid boolean,
  p_garment_upper_id text,
  p_garment_lower_id text,
  p_neckline_id text,
  p_upper_pattern_id text,
  p_lower_pattern_id text,
  p_fabric_id text,
  p_extra_ids uuid[],
  p_idempotency_key text
)
returns table (order_id uuid, public_number bigint, stage_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  received_stage public.workflow_stages%rowtype;
  selected public.catalog_items%rowtype;
  existing_order_id uuid;
  existing_public_number bigint;
  existing_stage_code text;
  existing_fingerprint text;
  new_order_id uuid;
  new_public_number bigint;
  normalized_customer_name text;
  normalized_description text;
  total_amount numeric;
  deposit_amount numeric;
  garment_upper_id uuid;
  garment_lower_id uuid;
  neckline_id uuid;
  upper_pattern_id uuid;
  lower_pattern_id uuid;
  fabric_id uuid;
  extra_id uuid;
  request_fingerprint text;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para crear pedidos.';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'La solicitud de creación no es válida.';
  end if;

  if btrim(coalesce(p_total_amount, '')) !~ '^\d{1,12}(\.\d{1,2})?$'
    or btrim(coalesce(p_deposit_amount, '')) !~ '^\d{1,12}(\.\d{1,2})?$' then
    raise exception 'Los importes deben tener como máximo dos decimales.';
  end if;

  begin
    total_amount := nullif(btrim(coalesce(p_total_amount, '')), '')::numeric;
    deposit_amount := nullif(btrim(coalesce(p_deposit_amount, '')), '')::numeric;
    garment_upper_id := nullif(btrim(coalesce(p_garment_upper_id, '')), '')::uuid;
    garment_lower_id := nullif(btrim(coalesce(p_garment_lower_id, '')), '')::uuid;
    neckline_id := nullif(btrim(coalesce(p_neckline_id, '')), '')::uuid;
    upper_pattern_id := nullif(btrim(coalesce(p_upper_pattern_id, '')), '')::uuid;
    lower_pattern_id := nullif(btrim(coalesce(p_lower_pattern_id, '')), '')::uuid;
    fabric_id := nullif(btrim(coalesce(p_fabric_id, '')), '')::uuid;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Los importes o las selecciones del pedido no son válidos.';
  end;

  normalized_customer_name := btrim(coalesce(p_customer_name, ''));
  if char_length(normalized_customer_name) < 2 or char_length(normalized_customer_name) > 200 then
    raise exception 'El cliente o equipo debe tener entre 2 y 200 caracteres.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;

  if p_order_type is null then
    raise exception 'Seleccioná el tipo de pedido.';
  end if;

  if p_order_date is null or p_promised_delivery_date is null then
    raise exception 'Completá las fechas del pedido.';
  end if;

  if p_promised_delivery_date < p_order_date then
    raise exception 'La fecha prometida no puede ser anterior a la fecha del pedido.';
  end if;

  normalized_description := nullif(btrim(coalesce(p_description, '')), '');
  if normalized_description is not null and char_length(normalized_description) > 5000 then
    raise exception 'La descripción no puede superar los 5000 caracteres.';
  end if;

  if total_amount is null or total_amount < 0 then
    raise exception 'El total debe ser mayor o igual a cero.';
  end if;

  if deposit_amount is null or deposit_amount < 0 then
    raise exception 'La seña debe ser mayor o igual a cero.';
  end if;

  if deposit_amount > total_amount then
    raise exception 'La seña no puede superar el total.';
  end if;

  if total_amount <> round(total_amount, 2)
    or deposit_amount <> round(deposit_amount, 2) then
    raise exception 'Los importes deben tener como máximo dos decimales.';
  end if;

  if p_deposit_paid is null then
    raise exception 'Indicá si la seña fue abonada.';
  end if;

  if fabric_id is null then
    raise exception 'Seleccioná una tela.';
  end if;

  if p_order_type = 'set' then
    if garment_upper_id is null
      or garment_lower_id is null
      or neckline_id is null
      or upper_pattern_id is null
      or lower_pattern_id is null then
      raise exception 'Un conjunto requiere prendas, cuello y ambos moldes.';
    end if;
  elsif (garment_upper_id is null) = (garment_lower_id is null) then
    raise exception 'Una prenda individual debe ser superior o inferior.';
  elsif garment_upper_id is not null
    and (neckline_id is null or upper_pattern_id is null or lower_pattern_id is not null) then
    raise exception 'La prenda superior requiere cuello y molde superior.';
  elsif garment_lower_id is not null
    and (neckline_id is not null or lower_pattern_id is null or upper_pattern_id is not null) then
    raise exception 'La prenda inferior requiere molde inferior y no lleva cuello.';
  end if;

  request_fingerprint := md5(concat_ws(
    '|',
    normalized_customer_name,
    p_quantity::text,
    p_order_type::text,
    p_order_date::text,
    p_promised_delivery_date::text,
    coalesce(normalized_description, ''),
    total_amount::text,
    deposit_amount::text,
    p_deposit_paid::text,
    coalesce(garment_upper_id::text, ''),
    coalesce(garment_lower_id::text, ''),
    coalesce(neckline_id::text, ''),
    coalesce(upper_pattern_id::text, ''),
    coalesce(lower_pattern_id::text, ''),
    fabric_id::text,
    coalesce((
      select string_agg(extra_value::text, ',' order by extra_value)
      from unnest(coalesce(p_extra_ids, array[]::uuid[])) as extra_values(extra_value)
    ), '')
  ));

  select o.id, o.public_number, s.code, o.idempotency_fingerprint
    into existing_order_id, existing_public_number, existing_stage_code, existing_fingerprint
  from public.orders o
  join public.workflow_stages s on s.id = o.current_stage_id
  where o.created_by = actor.id
    and o.idempotency_key = p_idempotency_key;

  if found then
    if existing_fingerprint <> request_fingerprint then
      raise exception 'La clave de creación ya fue utilizada para otro pedido.';
    end if;
    return query select existing_order_id, existing_public_number, existing_stage_code;
    return;
  end if;

  select * into received_stage
  from public.workflow_stages
  where code = 'received'
    and is_active;

  if not found then
    raise exception 'La etapa inicial del pedido no está configurada.';
  end if;

  insert into public.orders (
    customer_name,
    quantity,
    order_type,
    order_date,
    promised_delivery_date,
    description,
    current_stage_id,
    created_by,
    idempotency_key,
    idempotency_fingerprint
  )
  values (
    normalized_customer_name,
    p_quantity,
    p_order_type,
    p_order_date,
    p_promised_delivery_date,
    normalized_description,
    received_stage.id,
    actor.id,
    p_idempotency_key,
    request_fingerprint
  )
  returning orders.id, orders.public_number into new_order_id, new_public_number;

  insert into public.order_financials (order_id, total_amount, deposit_amount, deposit_paid)
  values (new_order_id, total_amount, deposit_amount, p_deposit_paid);

  if p_order_type = 'set' or garment_upper_id is not null then
    select * into selected from public.catalog_items where id = garment_upper_id and is_active;
    if not found or selected.kind <> 'garment' or selected.garment_layer <> 'upper' then
      raise exception 'Seleccioná una prenda superior activa.';
    end if;
    insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
    values (new_order_id, selected.id, 'garment_upper', selected.kind, selected.garment_layer, selected.name);
  end if;

  if p_order_type = 'set' or garment_lower_id is not null then
    select * into selected from public.catalog_items where id = garment_lower_id and is_active;
    if not found or selected.kind <> 'garment' or selected.garment_layer <> 'lower' then
      raise exception 'Seleccioná una prenda inferior activa.';
    end if;
    insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
    values (new_order_id, selected.id, 'garment_lower', selected.kind, selected.garment_layer, selected.name);
  end if;

  if neckline_id is not null then
    select * into selected from public.catalog_items where id = neckline_id and is_active;
    if not found or selected.kind <> 'neckline' then
      raise exception 'Seleccioná un cuello activo.';
    end if;
    insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
    values (new_order_id, selected.id, 'neckline', selected.kind, selected.garment_layer, selected.name);
  end if;

  if upper_pattern_id is not null then
    select * into selected from public.catalog_items where id = upper_pattern_id and is_active;
    if not found or selected.kind <> 'upper_pattern' then
      raise exception 'Seleccioná un molde superior activo.';
    end if;
    insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
    values (new_order_id, selected.id, 'upper_pattern', selected.kind, selected.garment_layer, selected.name);
  end if;

  if lower_pattern_id is not null then
    select * into selected from public.catalog_items where id = lower_pattern_id and is_active;
    if not found or selected.kind <> 'lower_pattern' then
      raise exception 'Seleccioná un molde inferior activo.';
    end if;
    insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
    values (new_order_id, selected.id, 'lower_pattern', selected.kind, selected.garment_layer, selected.name);
  end if;

  select * into selected from public.catalog_items where id = fabric_id and is_active;
  if not found or selected.kind <> 'fabric' then
    raise exception 'Seleccioná una tela activa.';
  end if;
  insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
  values (new_order_id, selected.id, 'fabric', selected.kind, selected.garment_layer, selected.name);

  foreach extra_id in array coalesce(p_extra_ids, array[]::uuid[]) loop
    select * into selected from public.catalog_items where id = extra_id and is_active;
    if not found or selected.kind <> 'extra' then
      raise exception 'Uno de los extras seleccionados no está disponible.';
    end if;
    insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
    values (new_order_id, selected.id, 'extra', selected.kind, selected.garment_layer, selected.name)
    on conflict on constraint order_catalog_items_order_id_selection_key_catalog_item_id_key do nothing;
  end loop;

  insert into public.order_stage_events (order_id, from_stage_id, to_stage_id, actor_id)
  values (new_order_id, null, received_stage.id, actor.id);

  return query select new_order_id, new_public_number, received_stage.code;
end;
$$;

revoke all on function public.create_catalog_item(public.catalog_item_kind, text, text) from public;
revoke all on function public.rename_catalog_item(uuid, text) from public;
revoke all on function public.set_catalog_item_active(uuid, boolean) from public;
revoke all on function public.create_order(
  text,
  integer,
  public.order_type,
  date,
  date,
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid[],
  text
) from public;

grant execute on function public.create_catalog_item(public.catalog_item_kind, text, text) to authenticated;
grant execute on function public.rename_catalog_item(uuid, text) to authenticated;
grant execute on function public.set_catalog_item_active(uuid, boolean) to authenticated;
grant execute on function public.create_order(
  text,
  integer,
  public.order_type,
  date,
  date,
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid[],
  text
) to authenticated;

-- Keep the password-change gate at the database boundary for the M1/M2 RPCs.
create or replace function public.create_managed_profile(
  target_id uuid,
  target_display_name text,
  target_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role <> 'super_admin' then
    raise exception 'No tenés permiso para crear usuarios.';
  end if;

  insert into public.profiles (id, display_name, role, is_active, must_change_password)
  values (target_id, target_display_name, target_role, true, true);

  insert into public.audit_events (actor_id, target_user_id, action, details)
  values (
    actor.id,
    target_id,
    'user_created',
    jsonb_build_object('display_name', target_display_name, 'role', target_role)
  );
end;
$$;

create or replace function public.update_managed_profile(
  target_id uuid,
  target_role public.app_role,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target public.profiles%rowtype;
  active_super_admin_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('digraf:last-active-super-admin'));

  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found or not actor.is_active or actor.must_change_password then
    raise exception 'No tenés permiso para administrar usuarios.';
  end if;

  select * into target
  from public.profiles
  where id = target_id
  for update;

  if not found then
    raise exception 'El usuario seleccionado no existe.';
  end if;

  if actor.role = 'admin' then
    if target.role not in ('attention', 'employee')
      or target_role not in ('attention', 'employee') then
      raise exception 'No tenés permiso para realizar este cambio.';
    end if;
  elsif actor.role = 'super_admin' then
    if target.role = 'super_admin'
      and (target_role <> 'super_admin' or not target_is_active) then
      select count(*) into active_super_admin_count
      from public.profiles
      where role = 'super_admin' and is_active;

      if active_super_admin_count <= 1 then
        raise exception 'Debe existir al menos un Super admin activo.';
      end if;
    end if;
  else
    raise exception 'No tenés permiso para administrar usuarios.';
  end if;

  update public.profiles
  set role = target_role, is_active = target_is_active, updated_at = now()
  where id = target.id;

  if target.role <> target_role then
    insert into public.audit_events (actor_id, target_user_id, action, details)
    values (
      actor.id,
      target.id,
      'user_role_changed',
      jsonb_build_object('previous_role', target.role, 'next_role', target_role)
    );
  end if;

  if target.is_active <> target_is_active then
    insert into public.audit_events (actor_id, target_user_id, action, details)
    values (
      actor.id,
      target.id,
      case when target_is_active then 'user_activated' else 'user_deactivated' end,
      jsonb_build_object('previous_is_active', target.is_active, 'next_is_active', target_is_active)
    );
  end if;
end;
$$;

create or replace function public.prepare_password_reset(target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target public.profiles%rowtype;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role <> 'super_admin' then
    raise exception 'No tenés permiso para restablecer contraseñas.';
  end if;

  select * into target
  from public.profiles
  where id = target_id
  for update;

  if not found then
    raise exception 'El usuario seleccionado no existe.';
  end if;

  update public.profiles
  set must_change_password = true, updated_at = now()
  where id = target.id;

  insert into public.audit_events (actor_id, target_user_id, action)
  values (actor.id, target.id, 'password_reset_requested');
end;
$$;

create or replace function public.record_password_reset_result(target_id uuid, succeeded boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role <> 'super_admin' then
    raise exception 'No tenés permiso para restablecer contraseñas.';
  end if;

  insert into public.audit_events (actor_id, target_user_id, action)
  values (
    actor.id,
    target_id,
    case when succeeded then 'password_reset_succeeded' else 'password_reset_failed' end
  );
end;
$$;
