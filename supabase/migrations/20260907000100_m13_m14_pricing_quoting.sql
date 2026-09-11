create type public.price_group as enum ('adults', 'children', 'flags', 'additions');

create table public.price_products (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$'),
  code_key text generated always as (lower(btrim(code))) stored unique,
  group_name public.price_group not null,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  unit text not null check (unit in ('unidad', 'metro_lineal')),
  price numeric(14,2) not null check (price > 0 and price = round(price, 2)),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((group_name = 'flags' and unit = 'metro_lineal') or (group_name <> 'flags' and unit = 'unidad'))
);

alter table public.price_products enable row level security;
revoke all on table public.price_products from anon, authenticated;
grant select on table public.price_products to authenticated;
grant select, insert, update, delete on table public.price_products to service_role;

create policy "Pricing roles read prices" on public.price_products for select to authenticated
using ((select public.current_active_role()) in ('super_admin', 'admin', 'attention'));

create or replace function public.m13_m14_assert_actor()
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para administrar precios o cotizar.';
  end if;
  return actor;
end;
$$;

create or replace function public.get_price_list()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.m13_m14_assert_actor();
  return jsonb_build_object(
    'products', coalesce((select jsonb_agg(to_jsonb(p) - 'created_by' - 'updated_by' order by p.group_name, p.name) from public.price_products p), '[]'::jsonb)
  );
end;
$$;

create or replace function public.upsert_price_product(p_id uuid, p_code text, p_group public.price_group, p_name text, p_unit text, p_price numeric, p_is_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor public.profiles%rowtype; product_id uuid;
begin
  actor := public.m13_m14_assert_actor();
  if p_code is null or p_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$' or char_length(btrim(coalesce(p_name,''))) not between 2 and 120 or p_price is null or p_price <= 0 or p_price <> round(p_price,2) or p_unit not in ('unidad','metro_lineal') then raise exception 'Los datos del precio no son válidos.'; end if;
  if p_group = 'flags' and p_unit <> 'metro_lineal' then raise exception 'Banderas requiere metro lineal.'; end if;
  if p_group <> 'flags' and p_unit <> 'unidad' then raise exception 'Este grupo requiere unidad.'; end if;
  if p_id is not null then
    select id into product_id from public.price_products where id = p_id for update;
    if not found then raise exception 'El precio seleccionado no existe.'; end if;
    if exists (select 1 from public.price_products where code_key = lower(btrim(p_code)) and id <> p_id) then raise exception 'Ya existe otro precio con ese código.'; end if;
    update public.price_products set code=btrim(p_code), group_name=p_group, name=btrim(p_name), unit=p_unit, price=p_price, is_active=coalesce(p_is_active,is_active), updated_by=actor.id, updated_at=now() where id=p_id;
  else
    insert into public.price_products(code, group_name, name, unit, price, is_active, created_by, updated_by)
    values(btrim(p_code), p_group, btrim(p_name), p_unit, p_price, coalesce(p_is_active,true), actor.id, actor.id)
    on conflict (code_key) do update set group_name=excluded.group_name, name=excluded.name, unit=excluded.unit, price=excluded.price, is_active=coalesce(excluded.is_active, price_products.is_active), updated_by=actor.id, updated_at=now()
    returning id into product_id;
  end if;
  return product_id;
end;
$$;

create or replace function public.delete_price_product(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.m13_m14_assert_actor();
  delete from public.price_products where id = p_id;
  if not found then raise exception 'El precio seleccionado no existe.'; end if;
end;
$$;

create or replace function public.import_price_products(p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare actor public.profiles%rowtype; row jsonb; row_count integer := 0; code text; group_name public.price_group; unit text; price numeric; active boolean;
begin
  actor := public.m13_m14_assert_actor();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 1000 then raise exception 'El lote debe tener entre 1 y 1000 productos.'; end if;
  if (select count(*) from (select lower(value->>'code') from jsonb_array_elements(p_rows) value group by lower(value->>'code') having count(*) > 1) duplicates) > 0 then raise exception 'Hay códigos duplicados en el lote.'; end if;
  for row in select value from jsonb_array_elements(p_rows) loop
    code := row->>'code'; group_name := (row->>'group')::public.price_group; unit := row->>'unit'; price := (row->>'price')::numeric;
    if code is null or code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$' or char_length(btrim(coalesce(row->>'name',''))) not between 2 and 120 or unit not in ('unidad','metro_lineal') or price is null or price <= 0 or price <> round(price,2) or (group_name = 'flags' and unit <> 'metro_lineal') or (group_name <> 'flags' and unit <> 'unidad') then raise exception 'Una fila del lote no es válida. No se importó nada.'; end if;
  end loop;
  for row in select value from jsonb_array_elements(p_rows) loop
    select is_active into active from public.price_products where code_key = lower(btrim(row->>'code'));
    perform public.upsert_price_product(null, row->>'code', (row->>'group')::public.price_group, row->>'name', row->>'unit', (row->>'price')::numeric, coalesce((row->>'active')::boolean, active, true)); row_count := row_count + 1;
  end loop;
  return row_count;
exception when others then raise exception '%', case when sqlerrm like 'Una fila del lote%' then sqlerrm else 'Una fila del lote no es válida. No se importó nada.' end;
end;
$$;

revoke all on function public.m13_m14_assert_actor(), public.get_price_list(), public.upsert_price_product(uuid,text,public.price_group,text,text,numeric,boolean), public.delete_price_product(uuid), public.import_price_products(jsonb) from public, anon, authenticated;
grant execute on function public.get_price_list(), public.upsert_price_product(uuid,text,public.price_group,text,text,numeric,boolean), public.delete_price_product(uuid), public.import_price_products(jsonb) to authenticated;
