alter table public.price_products
  alter column code drop not null;

create or replace function public.upsert_price_product(
  p_id uuid,
  p_code text,
  p_group public.price_group,
  p_name text,
  p_unit text,
  p_price numeric,
  p_is_active boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles%rowtype;
  product_id uuid;
  normalized_code text := nullif(btrim(p_code), '');
begin
  actor := public.m13_m14_assert_actor();
  if p_group is null or (normalized_code is not null and normalized_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$') or char_length(btrim(coalesce(p_name,''))) not between 2 and 120 or p_price is null or p_price <= 0 or p_price <> round(p_price,2) or p_unit not in ('unidad','metro_lineal') then
    raise exception 'Los datos del precio no son válidos.';
  end if;
  if p_group = 'flags' and p_unit <> 'metro_lineal' then raise exception 'Banderas requiere metro lineal.'; end if;
  if p_group <> 'flags' and p_unit <> 'unidad' then raise exception 'Este grupo requiere unidad.'; end if;
  if p_id is not null then
    select id into product_id from public.price_products where id = p_id for update;
    if not found then raise exception 'El precio seleccionado no existe.'; end if;
    if normalized_code is not null and exists (select 1 from public.price_products where code_key = lower(normalized_code) and id <> p_id) then raise exception 'Ya existe otro precio con ese código.'; end if;
    update public.price_products
    set code=normalized_code, group_name=p_group, name=btrim(p_name), unit=p_unit, price=p_price, is_active=coalesce(p_is_active,is_active), updated_by=actor.id, updated_at=now()
    where id=p_id;
  else
    insert into public.price_products(code, group_name, name, unit, price, is_active, created_by, updated_by)
    values(normalized_code, p_group, btrim(p_name), p_unit, p_price, coalesce(p_is_active,true), actor.id, actor.id)
    on conflict (code_key) do update set group_name=excluded.group_name, name=excluded.name, unit=excluded.unit, price=excluded.price, is_active=coalesce(excluded.is_active, price_products.is_active), updated_by=actor.id, updated_at=now()
    returning id into product_id;
  end if;
  return product_id;
end;
$$;

create or replace function public.import_price_products(p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles%rowtype;
  row jsonb;
  row_count integer := 0;
  code text;
  group_name public.price_group;
  unit text;
  price numeric;
  active boolean;
begin
  actor := public.m13_m14_assert_actor();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 1000 then raise exception 'El lote debe tener entre 1 y 1000 productos.'; end if;
  if (select count(*) from (select lower(nullif(btrim(value->>'code'), '')) from jsonb_array_elements(p_rows) value where nullif(btrim(value->>'code'), '') is not null group by lower(nullif(btrim(value->>'code'), '')) having count(*) > 1) duplicates) > 0 then raise exception 'Hay códigos duplicados en el lote.'; end if;
  for row in select value from jsonb_array_elements(p_rows) loop
    code := nullif(btrim(row->>'code'), '');
    group_name := (row->>'group')::public.price_group;
    unit := row->>'unit';
    price := (row->>'price')::numeric;
    if (code is not null and code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$') or char_length(btrim(coalesce(row->>'name',''))) not between 2 and 120 or unit not in ('unidad','metro_lineal') or price is null or price <= 0 or price <> round(price,2) or (group_name = 'flags' and unit <> 'metro_lineal') or (group_name <> 'flags' and unit <> 'unidad') then raise exception 'Una fila del lote no es válida. No se importó nada.'; end if;
  end loop;
  for row in select value from jsonb_array_elements(p_rows) loop
    code := nullif(btrim(row->>'code'), '');
    select is_active into active from public.price_products where code_key = lower(code);
    perform public.upsert_price_product(null, code, (row->>'group')::public.price_group, row->>'name', row->>'unit', (row->>'price')::numeric, coalesce((row->>'active')::boolean, active, true));
    row_count := row_count + 1;
  end loop;
  return row_count;
exception when others then
  raise exception '%', case when sqlerrm like 'Una fila del lote%' then sqlerrm else 'Una fila del lote no es válida. No se importó nada.' end;
end;
$$;
