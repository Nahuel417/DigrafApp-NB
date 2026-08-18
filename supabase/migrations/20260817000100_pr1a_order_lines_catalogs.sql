create type public.order_line_type as enum ('individual', 'set', 'flag', 'bag', 'shield');
create type public.catalog_product_kind as enum ('garment', 'flag', 'bag', 'shield');
create type public.catalog_option_selection_mode as enum ('single', 'multiple');

create table public.catalog_sections (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = lower(code) and code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.catalog_sections(id),
  kind public.catalog_product_kind not null,
  category_id uuid,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  name_key text generated always as (lower(btrim(name))) stored,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, name_key)
);

create table public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.catalog_sections(id),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  name_key text generated always as (lower(btrim(name))) stored,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, name_key)
);

alter table public.catalog_products
  add constraint catalog_products_category_fk
  foreign key (category_id) references public.catalog_categories(id);

create table public.catalog_product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id),
  code text not null check (code = lower(code) and code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  selection_mode public.catalog_option_selection_mode not null,
  position integer not null default 0 check (position >= 0),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, code)
);

create table public.catalog_product_option_values (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.catalog_product_options(id),
  value text not null check (char_length(btrim(value)) between 1 and 100),
  value_key text generated always as (lower(btrim(value))) stored,
  position integer not null default 0 check (position >= 0),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (option_id, value_key)
);

alter table public.orders
  alter column customer_name drop not null;

alter table public.orders
  add column client_name text,
  add column team_name text,
  add column phone text;

alter table public.orders
  alter column order_type drop not null;

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  position integer not null check (position >= 0),
  line_type public.order_line_type not null,
  product_id uuid references public.catalog_products(id),
  product_name_snapshot text not null check (char_length(btrim(product_name_snapshot)) between 2 and 500),
  quantity integer not null check (quantity > 0),
  color text check (color is null or char_length(color) <= 100),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, position)
);

create table public.order_line_shields (
  id uuid primary key default gen_random_uuid(),
  order_line_id uuid not null references public.order_lines(id),
  shield_product_id uuid references public.catalog_products(id),
  shield_name_snapshot text not null check (char_length(btrim(shield_name_snapshot)) between 2 and 100),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique (order_line_id, position)
);

create index catalog_products_section_active_name_idx on public.catalog_products(section_id, is_active, name_key);
create index catalog_categories_section_active_name_idx on public.catalog_categories(section_id, is_active, name_key);
create index catalog_product_options_product_active_position_idx on public.catalog_product_options(product_id, is_active, position);
create index catalog_product_option_values_option_active_position_idx on public.catalog_product_option_values(option_id, is_active, position);
create index order_lines_order_position_idx on public.order_lines(order_id, position);
create index order_line_shields_line_position_idx on public.order_line_shields(order_line_id, position);

alter table public.catalog_sections enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.catalog_product_options enable row level security;
alter table public.catalog_product_option_values enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_line_shields enable row level security;

revoke all on table public.catalog_sections, public.catalog_products, public.catalog_categories,
  public.catalog_product_options, public.catalog_product_option_values, public.order_lines,
  public.order_line_shields from anon, authenticated;

grant select on table public.catalog_sections, public.catalog_products, public.catalog_categories,
  public.catalog_product_options, public.catalog_product_option_values, public.order_lines,
  public.order_line_shields to authenticated;
grant select, insert, update, delete on table public.catalog_sections, public.catalog_products,
  public.catalog_categories, public.catalog_product_options, public.catalog_product_option_values,
  public.order_lines, public.order_line_shields to service_role;

create policy "Operational users read active PR1A catalog"
on public.catalog_sections for select to authenticated
using ((select public.current_active_role()) is not null and (is_active or (select public.current_active_role()) in ('super_admin', 'admin')));

create policy "Operational users read active PR1A products"
on public.catalog_products for select to authenticated
using ((select public.current_active_role()) is not null and (is_active or (select public.current_active_role()) in ('super_admin', 'admin')));

create policy "Operational users read active PR1A categories"
on public.catalog_categories for select to authenticated
using ((select public.current_active_role()) is not null and (is_active or (select public.current_active_role()) in ('super_admin', 'admin')));

create policy "Operational users read active PR1A options"
on public.catalog_product_options for select to authenticated
using ((select public.current_active_role()) is not null and (is_active or (select public.current_active_role()) in ('super_admin', 'admin')));

create policy "Operational users read active PR1A option values"
on public.catalog_product_option_values for select to authenticated
using ((select public.current_active_role()) is not null and (is_active or (select public.current_active_role()) in ('super_admin', 'admin')));

create policy "Operational users read order lines"
on public.order_lines for select to authenticated
using ((select public.current_active_role()) is not null);

create policy "Operational users read line shields"
on public.order_line_shields for select to authenticated
using ((select public.current_active_role()) is not null);

insert into public.catalog_sections (code, name, created_by, updated_by)
select value.code, value.name, profile.id, profile.id
from (values ('flags', 'Banderas'), ('bags', 'Bolsos'), ('shields', 'Escudos')) as value(code, name)
cross join lateral (select id from public.profiles where role = 'super_admin' and is_active order by created_at limit 1) profile
on conflict (code) do update set name = excluded.name, updated_at = now(), updated_by = excluded.updated_by;

insert into public.order_lines (order_id, position, line_type, product_name_snapshot, quantity, configuration, created_at, updated_at)
select
  o.id,
  0,
  case o.order_type when 'set' then 'set'::public.order_line_type else 'individual'::public.order_line_type end,
  coalesce((select string_agg(item_name, ' + ' order by id) from public.order_catalog_items where order_id = o.id), coalesce(o.customer_name, 'Pedido histórico')),
  o.quantity,
  jsonb_build_object(
    'legacy_order_type', o.order_type,
    'legacy_customer_name', o.customer_name,
    'legacy_selections', coalesce((select jsonb_agg(jsonb_build_object(
      'selection_key', selection_key,
      'catalog_item_id', catalog_item_id,
      'catalog_kind', catalog_kind,
      'garment_layer', garment_layer,
      'item_name', item_name
    ) order by id) from public.order_catalog_items where order_id = o.id), '[]'::jsonb)
  ),
  o.created_at,
  o.updated_at
from public.orders o
where not exists (select 1 from public.order_lines line where line.order_id = o.id);

create or replace function public.pr1a_assert_actor(allowed_roles public.app_role[])
returns public.profiles
language plpgsql stable security definer set search_path = ''
as $$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id = (select auth.uid());
  if not found or not actor.is_active or actor.must_change_password or not (actor.role = any(allowed_roles)) then
    raise exception 'No tenés permiso para realizar esta operación.';
  end if;
  return actor;
end;
$$;

create or replace function public.pr1a_validate_option_selections(p_product_id uuid, selections jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare selection jsonb; option_row record; value_count integer; expected_product uuid;
begin
  if selections is null then return; end if;
  if jsonb_typeof(selections) <> 'array' then raise exception 'Las opciones del producto no son válidas.'; end if;
  for selection in select value from jsonb_array_elements(selections) loop
    select o.* into option_row from public.catalog_product_options o
    where o.id = nullif(selection->>'option_id', '')::uuid and o.product_id = p_product_id and o.is_active;
    if not found then raise exception 'La opción seleccionada no pertenece al producto activo.'; end if;
    if jsonb_typeof(selection->'value_ids') <> 'array' then raise exception 'Los valores de una opción no son válidos.'; end if;
    select count(*) into value_count from public.catalog_product_option_values v
    where v.option_id = option_row.id and v.is_active and v.id in (select value::uuid from jsonb_array_elements_text(selection->'value_ids'));
    if value_count = 0 or (option_row.selection_mode = 'single' and value_count <> 1) then raise exception 'La cardinalidad de la opción no es válida.'; end if;
    if option_row.selection_mode = 'multiple' and value_count <> jsonb_array_length(selection->'value_ids') then raise exception 'Uno de los valores de la opción no está activo.'; end if;
  end loop;
end;
$$;

create or replace function public.pr1a_snapshot_options(p_product_id uuid, selections jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare selection jsonb; option_row public.catalog_product_options%rowtype; values_snapshot jsonb; result jsonb := '[]'::jsonb;
begin
  for selection in select value from jsonb_array_elements(coalesce(selections, '[]'::jsonb)) loop
    select * into option_row from public.catalog_product_options where id = (selection->>'option_id')::uuid and product_id = p_product_id;
    select coalesce(jsonb_agg(jsonb_build_object('value_id', value_row.id, 'value', value_row.value) order by value_row.position), '[]'::jsonb)
      into values_snapshot
    from public.catalog_product_option_values value_row
    where value_row.option_id = option_row.id and value_row.id in (select value::uuid from jsonb_array_elements_text(selection->'value_ids'));
    result := result || jsonb_build_array(jsonb_build_object('option_id', option_row.id, 'option_name', option_row.name, 'selection_mode', option_row.selection_mode, 'values', values_snapshot));
  end loop;
  return result;
end;
$$;

create or replace function public.pr1a_validate_line(line jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare line_type public.order_line_type; product public.catalog_products%rowtype; upper_id uuid; lower_id uuid;
begin
  begin line_type := (line->>'line_type')::public.order_line_type; exception when invalid_text_representation then raise exception 'El tipo de renglón no es válido.'; end;
  if line_type is null then raise exception 'El tipo de renglón no es válido.'; end if;
  if coalesce((line->>'quantity')::integer, 0) <= 0 then raise exception 'La cantidad del renglón debe ser mayor que cero.'; end if;
  if line_type in ('individual', 'flag', 'bag', 'shield') then
    product := null;
    select * into product from public.catalog_products where id = nullif(line->>'product_id', '')::uuid and is_active for update;
    if not found or product.kind <> (case line_type when 'individual' then 'garment' else line_type::text::public.catalog_product_kind end) then raise exception 'El producto del renglón no está activo o no corresponde.'; end if;
    perform public.pr1a_validate_option_selections(product.id, line->'options');
  elsif line_type = 'set' then
    upper_id := nullif(line->'configuration'->'upper'->>'product_id', '')::uuid;
    lower_id := nullif(line->'configuration'->'lower'->>'product_id', '')::uuid;
    if upper_id is null or lower_id is null then raise exception 'El conjunto requiere parte superior e inferior.'; end if;
    select * into product from public.catalog_products where id = upper_id and is_active and kind = 'garment' for update;
    if not found then raise exception 'La parte superior del conjunto no está activa.'; end if;
    perform public.pr1a_validate_option_selections(product.id, line->'configuration'->'upper'->'options');
    select * into product from public.catalog_products where id = lower_id and is_active and kind = 'garment' for update;
    if not found then raise exception 'La parte inferior del conjunto no está activa.'; end if;
    perform public.pr1a_validate_option_selections(product.id, line->'configuration'->'lower'->'options');
  end if;
  if jsonb_typeof(coalesce(line->'shield_product_ids', '[]'::jsonb)) <> 'array' then raise exception 'Los escudos seleccionados no son válidos.'; end if;
  if jsonb_array_length(coalesce(line->'shield_product_ids', '[]'::jsonb)) <> (select count(*) from (select distinct value from jsonb_array_elements_text(coalesce(line->'shield_product_ids', '[]'::jsonb))) distinct_values) then raise exception 'No se puede repetir un escudo.'; end if;
end;
$$;

create or replace function public.pr1a_insert_lines(target_order_id uuid, lines jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare line jsonb; line_row public.order_lines%rowtype; product public.catalog_products%rowtype; upper_product public.catalog_products%rowtype; lower_product public.catalog_products%rowtype; shield_id uuid; shield public.catalog_products%rowtype;
begin
  for line in select value from jsonb_array_elements(lines) loop
    if (line->>'line_type')::public.order_line_type = 'set' then
      select * into upper_product from public.catalog_products where id = nullif(line->'configuration'->'upper'->>'product_id','')::uuid;
      select * into lower_product from public.catalog_products where id = nullif(line->'configuration'->'lower'->>'product_id','')::uuid;
      insert into public.order_lines(order_id,position,line_type,product_name_snapshot,quantity,color,configuration)
      values(target_order_id,(line->>'position')::integer,'set','Conjunto',(line->>'quantity')::integer,nullif(btrim(line->>'color'),''),jsonb_build_object('upper', line->'configuration'->'upper' || jsonb_build_object('product_name', upper_product.name, 'options', public.pr1a_snapshot_options(upper_product.id, line->'configuration'->'upper'->'options')), 'lower', line->'configuration'->'lower' || jsonb_build_object('product_name', lower_product.name, 'options', public.pr1a_snapshot_options(lower_product.id, line->'configuration'->'lower'->'options')))) returning * into line_row;
    else
      select * into product from public.catalog_products where id = nullif(line->>'product_id','')::uuid;
      insert into public.order_lines(order_id,position,line_type,product_id,product_name_snapshot,quantity,color,configuration)
      values(target_order_id,(line->>'position')::integer,(line->>'line_type')::public.order_line_type,product.id,product.name,(line->>'quantity')::integer,nullif(btrim(line->>'color'),''),jsonb_build_object('product_name', product.name, 'options', public.pr1a_snapshot_options(product.id, line->'options'), 'configuration', coalesce(line->'configuration','{}'::jsonb))) returning * into line_row;
    end if;
    for shield_id in select value::uuid from jsonb_array_elements_text(coalesce(line->'shield_product_ids','[]'::jsonb)) loop
      select * into shield from public.catalog_products where id = shield_id and is_active and kind = 'shield';
      if not found then raise exception 'Uno de los escudos seleccionados no está activo.'; end if;
      insert into public.order_line_shields(order_line_id,shield_product_id,shield_name_snapshot,position)
      values(line_row.id,shield.id,shield.name,(select count(*) from public.order_line_shields where order_line_id = line_row.id));
    end loop;
  end loop;
end;
$$;

drop function public.create_order(text, integer, public.order_type, date, date, text, text, text, boolean, text, text, text, text, text, text, uuid[], text);

create function public.create_order(
  p_client_name text, p_team_name text, p_phone text, p_order_date date, p_promised_delivery_date date,
  p_description text, p_total_amount text, p_deposit_amount text, p_deposit_paid boolean,
  p_lines jsonb, p_idempotency_key text
)
returns table (order_id uuid, public_number bigint, stage_code text)
language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype; received_stage public.workflow_stages%rowtype; order_row public.orders%rowtype;
  line jsonb; line_row public.order_lines%rowtype; product public.catalog_products%rowtype; shield_id uuid; shield public.catalog_products%rowtype;
  total_amount numeric; deposit_amount numeric; fingerprint text; existing public.orders%rowtype;
begin
  actor := public.pr1a_assert_actor(array['super_admin','admin','attention']::public.app_role[]);
  if char_length(btrim(coalesce(p_client_name, ''))) not between 2 and 200 or char_length(btrim(coalesce(p_team_name, ''))) not between 2 and 200 or char_length(btrim(coalesce(p_phone, ''))) not between 6 and 40 then raise exception 'Completá cliente, equipo y teléfono.'; end if;
  if char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then raise exception 'La solicitud de creación no es válida.'; end if;
  if p_deposit_paid is null then raise exception 'Indicá si la seña fue abonada.'; end if;
  if p_order_date is null or p_promised_delivery_date is null or p_promised_delivery_date < p_order_date then raise exception 'Las fechas del pedido no son válidas.'; end if;
  if char_length(coalesce(p_description, '')) > 5000 then raise exception 'La descripción no puede superar los 5000 caracteres.'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'El pedido requiere al menos un renglón.'; end if;
  if jsonb_array_length(p_lines) < 1 then raise exception 'El pedido requiere al menos un renglón.'; end if;
  total_amount := nullif(btrim(coalesce(p_total_amount, '')), '')::numeric; deposit_amount := nullif(btrim(coalesce(p_deposit_amount, '')), '')::numeric;
  if total_amount is null or deposit_amount is null or total_amount < 0 or deposit_amount < 0 or deposit_amount > total_amount or total_amount <> round(total_amount, 2) or deposit_amount <> round(deposit_amount, 2) then raise exception 'Los importes del pedido no son válidos.'; end if;
  for line in select value from jsonb_array_elements(p_lines) loop perform public.pr1a_validate_line(line); end loop;
  fingerprint := md5(concat_ws('|', p_client_name, p_team_name, p_phone, p_order_date, p_promised_delivery_date, coalesce(p_description,''), total_amount, deposit_amount, p_deposit_paid, p_lines));
  select * into existing from public.orders where created_by = actor.id and idempotency_key = p_idempotency_key for update;
  if found then if existing.idempotency_fingerprint <> fingerprint then raise exception 'La clave de creación ya fue utilizada para otro pedido.'; end if; return query select existing.id, existing.public_number, (select code from public.workflow_stages where id = existing.current_stage_id); return; end if;
  select * into received_stage from public.workflow_stages where code = 'received' and is_active;
  if not found then raise exception 'La etapa inicial del pedido no está configurada.'; end if;
  insert into public.orders (customer_name, client_name, team_name, phone, quantity, order_type, order_date, promised_delivery_date, description, current_stage_id, created_by, idempotency_key, idempotency_fingerprint)
  values (null, btrim(p_client_name), btrim(p_team_name), btrim(p_phone), (select sum((value->>'quantity')::integer) from jsonb_array_elements(p_lines)), (select case when count(*) = 1 and min(value->>'line_type') = 'set' then 'set'::public.order_type when count(*) = 1 and min(value->>'line_type') = 'individual' then 'individual'::public.order_type else null end from jsonb_array_elements(p_lines)), p_order_date, p_promised_delivery_date, nullif(btrim(coalesce(p_description,'')),''), received_stage.id, actor.id, p_idempotency_key, fingerprint) returning * into order_row;
  insert into public.order_financials(order_id,total_amount,deposit_amount,deposit_paid) values(order_row.id,total_amount,deposit_amount,p_deposit_paid);
  perform public.pr1a_insert_lines(order_row.id, p_lines);
  insert into public.order_stage_events(order_id,from_stage_id,to_stage_id,actor_id) values(order_row.id,null,received_stage.id,actor.id);
  return query select order_row.id, order_row.public_number, received_stage.code;
end;
$$;

revoke all on function public.create_order(text,text,text,date,date,text,text,text,boolean,jsonb,text) from public;
grant execute on function public.create_order(text,text,text,date,date,text,text,text,boolean,jsonb,text) to authenticated;
revoke all on function public.pr1a_assert_actor(public.app_role[]) from public;
revoke all on function public.pr1a_validate_option_selections(uuid,jsonb), public.pr1a_snapshot_options(uuid,jsonb) from public;
revoke all on function public.pr1a_validate_line(jsonb) from public;
revoke all on function public.pr1a_insert_lines(uuid,jsonb) from public;

create function public.create_catalog_section(target_code text, target_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype; section_id uuid;
begin
  actor := public.pr1a_assert_actor(array['super_admin','admin']::public.app_role[]);
  insert into public.catalog_sections(code,name,created_by,updated_by) values(lower(btrim(target_code)),btrim(target_name),actor.id,actor.id) returning id into section_id;
  return section_id;
end;
$$;

create function public.create_catalog_product(target_section_id uuid, target_kind public.catalog_product_kind, target_category_id uuid, target_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype; product_id uuid; section_code text;
begin
  actor := public.pr1a_assert_actor(array['super_admin','admin']::public.app_role[]);
  select code into section_code from public.catalog_sections where id = target_section_id and is_active;
  if section_code is null or section_code <> target_kind::text || 's' then raise exception 'El producto no corresponde a la sección seleccionada.'; end if;
  if target_kind <> 'shield' and target_category_id is not null then raise exception 'Solo los escudos pueden tener categoría.'; end if;
  if target_kind = 'shield' and (target_category_id is not null and not exists (select 1 from public.catalog_categories where id = target_category_id and section_id = target_section_id and is_active)) then raise exception 'La categoría del escudo no está activa.'; end if;
  insert into public.catalog_products(section_id,kind,category_id,name,created_by,updated_by) values(target_section_id,target_kind,target_category_id,btrim(target_name),actor.id,actor.id) returning id into product_id;
  return product_id;
end;
$$;

create function public.create_catalog_category(target_section_id uuid, target_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype; category_id uuid;
begin
  actor := public.pr1a_assert_actor(array['super_admin','admin']::public.app_role[]);
  if not exists (select 1 from public.catalog_sections where id = target_section_id and code = 'shields' and is_active) then raise exception 'Las categorías solo aplican a escudos.'; end if;
  insert into public.catalog_categories(section_id,name,created_by,updated_by) values(target_section_id,btrim(target_name),actor.id,actor.id) returning id into category_id;
  return category_id;
end;
$$;

create function public.create_catalog_product_option(target_product_id uuid, target_code text, target_name text, target_selection_mode public.catalog_option_selection_mode)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype; option_id uuid;
begin
  actor := public.pr1a_assert_actor(array['super_admin','admin']::public.app_role[]);
  if not exists (select 1 from public.catalog_products where id = target_product_id) then raise exception 'El producto no existe.'; end if;
  insert into public.catalog_product_options(product_id,code,name,selection_mode,created_by,updated_by) values(target_product_id,lower(btrim(target_code)),btrim(target_name),target_selection_mode,actor.id,actor.id) returning id into option_id;
  return option_id;
end;
$$;

create function public.create_catalog_option_value(target_option_id uuid, target_value text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype; value_id uuid;
begin
  actor := public.pr1a_assert_actor(array['super_admin','admin']::public.app_role[]);
  if not exists (select 1 from public.catalog_product_options where id = target_option_id) then raise exception 'La opción no existe.'; end if;
  insert into public.catalog_product_option_values(option_id,value,created_by,updated_by) values(target_option_id,btrim(target_value),actor.id,actor.id) returning id into value_id;
  return value_id;
end;
$$;

create function public.set_catalog_product_active(target_id uuid, target_is_active boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype;
begin
  actor := public.pr1a_assert_actor(array['super_admin','admin']::public.app_role[]);
  update public.catalog_products set is_active = target_is_active, updated_by = actor.id, updated_at = now() where id = target_id;
  if not found then raise exception 'El producto no existe.'; end if;
end;
$$;

revoke all on function public.create_catalog_section(text,text), public.create_catalog_product(uuid,public.catalog_product_kind,uuid,text), public.create_catalog_category(uuid,text), public.create_catalog_product_option(uuid,text,text,public.catalog_option_selection_mode), public.create_catalog_option_value(uuid,text), public.set_catalog_product_active(uuid,boolean) from public;
grant execute on function public.create_catalog_section(text,text), public.create_catalog_product(uuid,public.catalog_product_kind,uuid,text), public.create_catalog_category(uuid,text), public.create_catalog_product_option(uuid,text,text,public.catalog_option_selection_mode), public.create_catalog_option_value(uuid,text), public.set_catalog_product_active(uuid,boolean) to authenticated;

drop function public.update_order(uuid,text,integer,public.order_type,date,date,text,numeric,numeric,boolean,uuid,uuid,uuid,uuid,uuid,uuid,uuid[],text,timestamptz,text);

create function public.update_order(
  p_order_id uuid, p_client_name text, p_team_name text, p_phone text, p_order_date date,
  p_promised_delivery_date date, p_description text, p_total_amount numeric, p_deposit_amount numeric,
  p_deposit_paid boolean, p_lines jsonb, p_change_note text, p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns table(order_id uuid, updated_at timestamptz, event_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype; target public.orders%rowtype; financials public.order_financials%rowtype; event_row public.order_change_events%rowtype; fingerprint text; new_event_id uuid; line jsonb;
  event_details jsonb := jsonb_build_object('version',1,'changes','[]'::jsonb,'line_count',jsonb_array_length(p_lines));
begin
  actor := public.pr1a_assert_actor(array['super_admin','admin']::public.app_role[]);
  if p_order_id is null or p_expected_updated_at is null or char_length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 200 then raise exception 'La solicitud de edición no es válida.'; end if;
  if char_length(btrim(coalesce(p_client_name,''))) not between 2 and 200 or char_length(btrim(coalesce(p_team_name,''))) not between 2 and 200 or char_length(btrim(coalesce(p_phone,''))) not between 6 and 40 then raise exception 'Completá cliente, equipo y teléfono.'; end if;
  if p_order_date is null or p_promised_delivery_date is null or p_promised_delivery_date < p_order_date then raise exception 'Las fechas del pedido no son válidas.'; end if;
  if p_total_amount is null or p_deposit_amount is null or p_total_amount < 0 or p_deposit_amount < 0 or p_deposit_amount > p_total_amount or p_total_amount <> round(p_total_amount, 2) or p_deposit_amount <> round(p_deposit_amount, 2) then raise exception 'Los importes del pedido no son válidos.'; end if;
  if p_deposit_paid is null then raise exception 'Indicá si la seña fue abonada.'; end if;
  if char_length(coalesce(p_description, '')) > 5000 then raise exception 'La descripción no puede superar los 5000 caracteres.'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'El pedido requiere al menos un renglón.'; end if;
  if jsonb_array_length(p_lines) < 1 then raise exception 'El pedido requiere al menos un renglón.'; end if;
  for line in select value from jsonb_array_elements(p_lines) loop perform public.pr1a_validate_line(line); end loop;
  fingerprint := md5(concat_ws('|',p_order_id,p_client_name,p_team_name,p_phone,p_order_date,p_promised_delivery_date,coalesce(p_description,''),p_total_amount,p_deposit_amount,p_deposit_paid,p_lines,coalesce(p_change_note,''),p_expected_updated_at));
  select * into event_row from public.order_change_events where actor_id = actor.id and idempotency_key = p_idempotency_key;
  if found then if event_row.idempotency_fingerprint <> fingerprint then raise exception 'La clave de idempotencia ya fue utilizada para otra edición.'; end if; return query select event_row.order_id,event_row.order_updated_at,event_row.id; return; end if;
  select * into target from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  if target.updated_at <> p_expected_updated_at then raise exception 'El pedido cambió en otra sesión. Actualizalo e intentá nuevamente.'; end if;
  select * into financials from public.order_financials where public.order_financials.order_id = target.id for update;
  if not found then raise exception 'Los importes del pedido no están disponibles.'; end if;
  if target.client_name is distinct from btrim(p_client_name) then event_details := jsonb_set(event_details,'{changes}',event_details->'changes'||jsonb_build_array(jsonb_build_object('field','client_name','previous',target.client_name,'next',btrim(p_client_name)))); end if;
  if target.team_name is distinct from btrim(p_team_name) then event_details := jsonb_set(event_details,'{changes}',event_details->'changes'||jsonb_build_array(jsonb_build_object('field','team_name','previous',target.team_name,'next',btrim(p_team_name)))); end if;
  if target.phone is distinct from btrim(p_phone) then event_details := jsonb_set(event_details,'{changes}',event_details->'changes'||jsonb_build_array(jsonb_build_object('field','phone'))); end if;
  if target.order_date is distinct from p_order_date then event_details := jsonb_set(event_details,'{changes}',event_details->'changes'||jsonb_build_array(jsonb_build_object('field','order_date','previous',target.order_date,'next',p_order_date))); end if;
  if target.promised_delivery_date is distinct from p_promised_delivery_date then event_details := jsonb_set(event_details,'{changes}',event_details->'changes'||jsonb_build_array(jsonb_build_object('field','promised_delivery_date','previous',target.promised_delivery_date,'next',p_promised_delivery_date))); end if;
  if target.description is distinct from nullif(btrim(coalesce(p_description,'')),'') then event_details := jsonb_set(event_details,'{changes}',event_details->'changes'||jsonb_build_array(jsonb_build_object('field','description'))); end if;
  if financials.total_amount is distinct from p_total_amount then event_details := jsonb_set(event_details,'{changes}',event_details->'changes'||jsonb_build_array(jsonb_build_object('field','total_amount','previous',financials.total_amount,'next',p_total_amount))); end if;
  if financials.deposit_amount is distinct from p_deposit_amount then event_details := jsonb_set(event_details,'{changes}',event_details->'changes'||jsonb_build_array(jsonb_build_object('field','deposit_amount','previous',financials.deposit_amount,'next',p_deposit_amount))); end if;
  if financials.deposit_paid is distinct from p_deposit_paid then event_details := jsonb_set(event_details,'{changes}',event_details->'changes'||jsonb_build_array(jsonb_build_object('field','deposit_paid','previous',financials.deposit_paid,'next',p_deposit_paid))); end if;
  event_details := jsonb_set(event_details,'{changes}',event_details->'changes'||jsonb_build_array(jsonb_build_object('field','specifications')));
  update public.orders set client_name=btrim(p_client_name),team_name=btrim(p_team_name),phone=btrim(p_phone),customer_name=null,quantity=(select sum((value->>'quantity')::integer) from jsonb_array_elements(p_lines)),order_type=(select case when count(*)=1 and min(value->>'line_type')='set' then 'set'::public.order_type when count(*)=1 and min(value->>'line_type')='individual' then 'individual'::public.order_type else null end from jsonb_array_elements(p_lines)),order_date=p_order_date,promised_delivery_date=p_promised_delivery_date,description=nullif(btrim(coalesce(p_description,'')),''),updated_at=now() where id=target.id returning * into target;
  update public.order_financials set total_amount=p_total_amount,deposit_amount=p_deposit_amount,deposit_paid=p_deposit_paid,updated_at=now() where public.order_financials.order_id=target.id;
  delete from public.order_line_shields where order_line_id in (select id from public.order_lines where public.order_lines.order_id=target.id);
  delete from public.order_lines where public.order_lines.order_id=target.id;
  perform public.pr1a_insert_lines(target.id,p_lines);
  insert into public.order_change_events(order_id,actor_id,action,details,change_note,order_updated_at,idempotency_key,idempotency_fingerprint) values(target.id,actor.id,'order_updated',event_details,nullif(btrim(coalesce(p_change_note,'')),''),target.updated_at,p_idempotency_key,fingerprint) returning id into new_event_id;
  return query select target.id,target.updated_at,new_event_id;
end;
$$;

revoke all on function public.update_order(uuid,text,text,text,date,date,text,numeric,numeric,boolean,jsonb,text,timestamptz,text) from public;
grant execute on function public.update_order(uuid,text,text,text,date,date,text,numeric,numeric,boolean,jsonb,text,timestamptz,text) to authenticated;
