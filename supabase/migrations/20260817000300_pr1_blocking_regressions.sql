alter table public.catalog_products
  add column if not exists legacy_catalog_item_id uuid references public.catalog_items(id) on delete set null,
  add column if not exists garment_layer public.garment_layer;

alter table public.catalog_products
  drop constraint if exists catalog_products_section_id_name_key_key,
  drop constraint if exists catalog_products_section_id_name_key;

create unique index if not exists catalog_products_legacy_catalog_item_id_key
  on public.catalog_products (legacy_catalog_item_id)
  where legacy_catalog_item_id is not null;

create unique index if not exists catalog_products_section_layer_name_key
  on public.catalog_products (section_id, garment_layer, name_key)
  where kind = 'garment' and garment_layer is not null;

create unique index if not exists catalog_products_section_name_key
  on public.catalog_products (section_id, name_key)
  where kind <> 'garment' or garment_layer is null;

create or replace function public.sync_legacy_garment_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  section_id uuid;
begin
  if tg_op = 'DELETE' then
    update public.catalog_products
    set is_active = false, updated_at = now(), updated_by = old.updated_by
    where legacy_catalog_item_id = old.id;
    return old;
  end if;

  if new.kind <> 'garment' then
    return new;
  end if;

  select id into section_id from public.catalog_sections where code = 'garments';
  if section_id is null then
    insert into public.catalog_sections(code, name, created_by, updated_by)
    values ('garments', 'Prendas', new.created_by, new.updated_by)
    on conflict (code) do update set updated_by = excluded.updated_by, updated_at = now()
    returning id into section_id;
  end if;

  insert into public.catalog_products(
    section_id, kind, legacy_catalog_item_id, garment_layer, name, is_active,
    created_by, updated_by, created_at, updated_at
  ) values (
    section_id, 'garment', new.id, new.garment_layer, new.name, new.is_active,
    new.created_by, new.updated_by, new.created_at, new.updated_at
  )
  on conflict (legacy_catalog_item_id) where legacy_catalog_item_id is not null do update set
    section_id = excluded.section_id,
    garment_layer = excluded.garment_layer,
    name = excluded.name,
    is_active = excluded.is_active,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists sync_legacy_garment_product on public.catalog_items;
create trigger sync_legacy_garment_product
after insert or update of name, garment_layer, is_active on public.catalog_items
for each row execute function public.sync_legacy_garment_product();

drop trigger if exists deactivate_legacy_garment_product on public.catalog_items;
create trigger deactivate_legacy_garment_product
before delete on public.catalog_items
for each row execute function public.sync_legacy_garment_product();

update public.catalog_items
set name = name
where kind = 'garment';

create or replace function public.ensure_profile_catalog_sections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active and new.role in ('super_admin', 'admin') then
    insert into public.catalog_sections (code, name, created_by, updated_by)
    values
      ('garments', 'Prendas', new.id, new.id),
      ('flags', 'Banderas', new.id, new.id),
      ('bags', 'Bolsos', new.id, new.id),
      ('shields', 'Escudos', new.id, new.id)
    on conflict (code) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_profile_catalog_sections on public.profiles;
create trigger ensure_profile_catalog_sections
after insert or update of role, is_active on public.profiles
for each row execute function public.ensure_profile_catalog_sections();

do $$
declare profile_id uuid;
begin
  select id into profile_id
  from public.profiles
  where role in ('super_admin', 'admin') and is_active
  order by created_at, id
  limit 1;
  if profile_id is not null then
    insert into public.catalog_sections (code, name, created_by, updated_by)
    values
      ('garments', 'Prendas', profile_id, profile_id),
      ('flags', 'Banderas', profile_id, profile_id),
      ('bags', 'Bolsos', profile_id, profile_id),
      ('shields', 'Escudos', profile_id, profile_id)
    on conflict (code) do nothing;
  end if;
end;
$$;

revoke all on function public.ensure_profile_catalog_sections() from public;

create or replace function public.ensure_catalog_section(target_code text, target_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype; section_id uuid;
begin
  actor := public.pr1a_assert_actor(array['super_admin','admin']::public.app_role[]);
  insert into public.catalog_sections(code,name,created_by,updated_by)
  values(lower(btrim(target_code)), btrim(target_name), actor.id, actor.id)
  on conflict (code) do update set name = excluded.name, updated_by = actor.id, updated_at = now()
  returning id into section_id;
  return section_id;
end;
$$;

create or replace function public.create_catalog_product_without_category(
  target_section_id uuid,
  target_kind public.catalog_product_kind,
  target_name text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.create_catalog_product(target_section_id, target_kind, null::uuid, target_name);
$$;

create or replace function public.rename_catalog_product(target_id uuid, target_name text)
returns void language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype;
begin
  actor := public.pr1a_assert_actor(array['super_admin','admin']::public.app_role[]);
  update public.catalog_products set name = btrim(target_name), updated_by = actor.id, updated_at = now()
  where id = target_id and legacy_catalog_item_id is null;
  if not found then raise exception 'El producto seleccionado no existe.'; end if;
end;
$$;

create or replace function public.rename_catalog_category(target_id uuid, target_name text)
returns void language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype;
begin
  actor := public.pr1a_assert_actor(array['super_admin','admin']::public.app_role[]);
  update public.catalog_categories set name = btrim(target_name), updated_by = actor.id, updated_at = now()
  where id = target_id and section_id = (select id from public.catalog_sections where code = 'shields');
  if not found then raise exception 'La categoría seleccionada no existe.'; end if;
end;
$$;

create or replace function public.set_catalog_category_active(target_id uuid, target_is_active boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype;
begin
  actor := public.pr1a_assert_actor(array['super_admin','admin']::public.app_role[]);
  update public.catalog_categories set is_active = target_is_active, updated_by = actor.id, updated_at = now()
  where id = target_id and section_id = (select id from public.catalog_sections where code = 'shields');
  if not found then raise exception 'La categoría seleccionada no existe.'; end if;
end;
$$;

create or replace function public.pr1_validate_legacy_options(options jsonb, needs_upper boolean, needs_lower boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare extra_id uuid; extra_count integer;
begin
  options := coalesce(options, '{}'::jsonb);
  if jsonb_typeof(options) <> 'object' then raise exception 'Las opciones existentes no son válidas.'; end if;
  if needs_upper and not exists(select 1 from public.catalog_items where id = nullif(options->>'neckline_id','')::uuid and kind = 'neckline' and is_active) then raise exception 'Seleccioná un cuello activo.'; end if;
  if needs_upper and not exists(select 1 from public.catalog_items where id = nullif(options->>'upper_pattern_id','')::uuid and kind = 'upper_pattern' and is_active) then raise exception 'Seleccioná un molde superior activo.'; end if;
  if needs_lower and not exists(select 1 from public.catalog_items where id = nullif(options->>'lower_pattern_id','')::uuid and kind = 'lower_pattern' and is_active) then raise exception 'Seleccioná un molde inferior activo.'; end if;
  if not exists(select 1 from public.catalog_items where id = nullif(options->>'fabric_id','')::uuid and kind = 'fabric' and is_active) then raise exception 'Seleccioná una tela activa.'; end if;
  if jsonb_typeof(coalesce(options->'extra_ids','[]'::jsonb)) <> 'array' then raise exception 'Los extras seleccionados no son válidos.'; end if;
  select count(*) into extra_count from jsonb_array_elements_text(coalesce(options->'extra_ids','[]'::jsonb));
  if extra_count <> (select count(distinct value) from jsonb_array_elements_text(coalesce(options->'extra_ids','[]'::jsonb))) then raise exception 'No se puede repetir un extra.'; end if;
  for extra_id in select value::uuid from jsonb_array_elements_text(coalesce(options->'extra_ids','[]'::jsonb)) loop
    if not exists(select 1 from public.catalog_items where id = extra_id and kind = 'extra' and is_active) then raise exception 'Uno de los extras seleccionados no está activo.'; end if;
  end loop;
end;
$$;

create or replace function public.pr1_snapshot_legacy_options(options jsonb)
returns jsonb language sql security definer set search_path = ''
as $$
  select jsonb_build_object(
    'neckline', (select jsonb_build_object('id', id, 'name', name) from public.catalog_items where id = nullif(options->>'neckline_id','')::uuid),
    'upper_pattern', (select jsonb_build_object('id', id, 'name', name) from public.catalog_items where id = nullif(options->>'upper_pattern_id','')::uuid),
    'lower_pattern', (select jsonb_build_object('id', id, 'name', name) from public.catalog_items where id = nullif(options->>'lower_pattern_id','')::uuid),
    'fabric', (select jsonb_build_object('id', id, 'name', name) from public.catalog_items where id = nullif(options->>'fabric_id','')::uuid),
    'extras', coalesce((select jsonb_agg(jsonb_build_object('id', item.id, 'name', item.name) order by item.name) from public.catalog_items item where item.id in (select value::uuid from jsonb_array_elements_text(coalesce(options->'extra_ids','[]'::jsonb)))), '[]'::jsonb)
  );
$$;

create or replace function public.pr1a_validate_option_selections(p_product_id uuid, selections jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare selection jsonb; option_row record; value_count integer;
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
    if value_count = 0 or (option_row.selection_mode = 'single' and (value_count <> 1 or jsonb_array_length(selection->'value_ids') <> 1)) then raise exception 'La cardinalidad de la opción no es válida.'; end if;
    if option_row.selection_mode = 'multiple' and value_count <> jsonb_array_length(selection->'value_ids') then raise exception 'Uno de los valores de la opción no está activo.'; end if;
  end loop;
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
  if line_type in ('individual','flag','bag','shield') then
    select * into product from public.catalog_products where id = nullif(line->>'product_id','')::uuid and is_active for update;
    if not found or product.kind <> (case line_type when 'individual' then 'garment' else line_type::text::public.catalog_product_kind end) then raise exception 'El producto del renglón no está activo o no corresponde.'; end if;
    perform public.pr1a_validate_option_selections(product.id, line->'options');
    if line_type = 'individual' then perform public.pr1_validate_legacy_options(line->'configuration'->'legacy_options', product.garment_layer = 'upper', product.garment_layer = 'lower'); end if;
  elsif line_type = 'set' then
    upper_id := nullif(line->'configuration'->'upper'->>'product_id','')::uuid;
    lower_id := nullif(line->'configuration'->'lower'->>'product_id','')::uuid;
    select * into product from public.catalog_products where id = upper_id and is_active and kind = 'garment' and garment_layer = 'upper' for update;
    if not found then raise exception 'La parte superior del conjunto no está activa.'; end if;
    perform public.pr1a_validate_option_selections(product.id, line->'configuration'->'upper'->'options');
    select * into product from public.catalog_products where id = lower_id and is_active and kind = 'garment' and garment_layer = 'lower' for update;
    if not found then raise exception 'La parte inferior del conjunto no está activa.'; end if;
    perform public.pr1a_validate_option_selections(product.id, line->'configuration'->'lower'->'options');
    perform public.pr1_validate_legacy_options(line->'configuration'->'legacy_options', true, true);
  end if;
  if jsonb_typeof(coalesce(line->'shield_product_ids','[]'::jsonb)) <> 'array' then raise exception 'Los escudos seleccionados no son válidos.'; end if;
  if jsonb_array_length(coalesce(line->'shield_product_ids','[]'::jsonb)) <> (select count(*) from (select distinct value from jsonb_array_elements_text(coalesce(line->'shield_product_ids','[]'::jsonb))) distinct_values) then raise exception 'No se puede repetir un escudo.'; end if;
end;
$$;

create or replace function public.pr1a_insert_lines(target_order_id uuid, lines jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare line jsonb; line_row public.order_lines%rowtype; product public.catalog_products%rowtype; upper_product public.catalog_products%rowtype; lower_product public.catalog_products%rowtype; shield_id uuid; shield public.catalog_products%rowtype; legacy_snapshot jsonb;
begin
  for line in select value from jsonb_array_elements(lines) loop
    legacy_snapshot := public.pr1_snapshot_legacy_options(line->'configuration'->'legacy_options');
    if (line->>'line_type')::public.order_line_type = 'set' then
      select * into upper_product from public.catalog_products where id = nullif(line->'configuration'->'upper'->>'product_id','')::uuid;
      select * into lower_product from public.catalog_products where id = nullif(line->'configuration'->'lower'->>'product_id','')::uuid;
      insert into public.order_lines(order_id, position, line_type, product_name_snapshot, quantity, color, configuration)
      values(target_order_id, (line->>'position')::integer, 'set', 'Conjunto', (line->>'quantity')::integer, nullif(btrim(line->>'color'),''), jsonb_build_object(
        'upper', line->'configuration'->'upper' || jsonb_build_object('product_name', upper_product.name, 'options', public.pr1a_snapshot_options(upper_product.id, line->'configuration'->'upper'->'options')),
        'lower', line->'configuration'->'lower' || jsonb_build_object('product_name', lower_product.name, 'options', public.pr1a_snapshot_options(lower_product.id, line->'configuration'->'lower'->'options')),
        'legacy_options', legacy_snapshot
      )) returning * into line_row;
    else
      select * into product from public.catalog_products where id = nullif(line->>'product_id','')::uuid;
      insert into public.order_lines(order_id, position, line_type, product_id, product_name_snapshot, quantity, color, configuration)
      values(target_order_id, (line->>'position')::integer, (line->>'line_type')::public.order_line_type, product.id, product.name, (line->>'quantity')::integer, nullif(btrim(line->>'color'),''), jsonb_build_object(
        'product_name', product.name,
        'options', public.pr1a_snapshot_options(product.id, line->'options'),
        'legacy_options', legacy_snapshot,
        'configuration', coalesce(line->'configuration','{}'::jsonb)
      )) returning * into line_row;
    end if;
    for shield_id in select value::uuid from jsonb_array_elements_text(coalesce(line->'shield_product_ids','[]'::jsonb)) loop
      select * into shield from public.catalog_products where id = shield_id and is_active and kind = 'shield';
      if not found then raise exception 'Uno de los escudos seleccionados no está activo.'; end if;
      insert into public.order_line_shields(order_line_id, shield_product_id, shield_name_snapshot, position)
      values(line_row.id, shield.id, shield.name, (select count(*) from public.order_line_shields where order_line_id = line_row.id));
    end loop;
  end loop;
end;
$$;

revoke all on function public.ensure_catalog_section(text,text), public.create_catalog_product_without_category(uuid,public.catalog_product_kind,text), public.rename_catalog_product(uuid,text), public.rename_catalog_category(uuid,text), public.set_catalog_category_active(uuid,boolean), public.pr1_validate_legacy_options(jsonb,boolean,boolean), public.pr1_snapshot_legacy_options(jsonb) from public;
grant execute on function public.ensure_catalog_section(text,text), public.create_catalog_product_without_category(uuid,public.catalog_product_kind,text), public.rename_catalog_product(uuid,text), public.rename_catalog_category(uuid,text), public.set_catalog_category_active(uuid,boolean) to authenticated;
