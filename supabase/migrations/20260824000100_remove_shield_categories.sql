-- Convert shield categories into plain shield products before removing the category model.
insert into public.catalog_products (
  section_id,
  kind,
  name,
  is_active,
  created_by,
  updated_by,
  created_at,
  updated_at
)
select
  category.section_id,
  'shield'::public.catalog_product_kind,
  btrim(category.name),
  category.is_active,
  category.created_by,
  category.updated_by,
  category.created_at,
  category.updated_at
from public.catalog_categories category
join public.catalog_sections section on section.id = category.section_id
where section.code = 'shields'
  and not exists (
    select 1
    from public.catalog_products product
    where product.section_id = category.section_id
      and product.kind = 'shield'
      and product.name_key = category.name_key
  );

-- Existing shield products win duplicate names; order history already stores snapshots.
update public.catalog_products set category_id = null where category_id is not null;

create or replace function public.create_catalog_product_without_category(
  target_section_id uuid,
  target_kind public.catalog_product_kind,
  target_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  product_id uuid;
  section_code text;
begin
  actor := public.pr1a_assert_actor(array['super_admin','admin']::public.app_role[]);
  select code into section_code
  from public.catalog_sections
  where id = target_section_id and is_active;

  if section_code is null or section_code <> target_kind::text || 's' then
    raise exception 'El producto no corresponde a la sección seleccionada.';
  end if;

  insert into public.catalog_products(section_id, kind, name, created_by, updated_by)
  values (target_section_id, target_kind, btrim(target_name), actor.id, actor.id)
  returning id into product_id;

  return product_id;
end;
$$;

revoke all on function public.create_catalog_product(uuid, public.catalog_product_kind, uuid, text) from public, anon, authenticated;
drop function public.create_catalog_product(uuid, public.catalog_product_kind, uuid, text);

drop function public.create_catalog_category(uuid, text);
drop function public.rename_catalog_category(uuid, text);
drop function public.set_catalog_category_active(uuid, boolean);

alter table public.catalog_products drop constraint catalog_products_category_fk;
alter table public.catalog_products drop column category_id;
drop table public.catalog_categories;
