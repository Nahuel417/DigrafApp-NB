alter table public.order_catalog_items
  alter column catalog_item_id drop not null;

alter table public.order_catalog_items
  drop constraint order_catalog_items_catalog_item_id_fkey;

alter table public.order_catalog_items
  add constraint order_catalog_items_catalog_item_id_fkey
  foreign key (catalog_item_id)
  references public.catalog_items (id)
  on delete set null;

alter table public.catalog_item_events
  add column catalog_item_name text;

alter table public.catalog_item_events
  alter column catalog_item_id drop not null;

alter table public.catalog_item_events
  drop constraint catalog_item_events_catalog_item_id_fkey;

alter table public.catalog_item_events
  add constraint catalog_item_events_catalog_item_id_fkey
  foreign key (catalog_item_id)
  references public.catalog_items (id)
  on delete set null;

update public.catalog_item_events event
set catalog_item_name = item.name
from public.catalog_items item
where item.id = event.catalog_item_id;

alter table public.catalog_item_events
  alter column catalog_item_name set not null;

alter table public.catalog_item_events
  drop constraint catalog_item_events_action_check;

alter table public.catalog_item_events
  add constraint catalog_item_events_action_check
  check (action in ('created', 'renamed', 'retired', 'activated', 'deleted'));

drop function public.set_catalog_item_active(uuid, boolean);

create or replace function public.create_catalog_item(
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
    select 1 from public.catalog_items
    where kind = target_kind and name_key = lower(normalized_name)
  ) then
    raise exception 'Ya existe un ítem con ese nombre en el catálogo.';
  end if;

  insert into public.catalog_items (kind, garment_layer, name, created_by, updated_by)
  values (target_kind, normalized_layer, normalized_name, actor.id, actor.id)
  returning id into item_id;

  insert into public.catalog_item_events (catalog_item_id, catalog_item_name, actor_id, action, details)
  values (
    item_id,
    normalized_name,
    actor.id,
    'created',
    jsonb_build_object('kind', target_kind, 'garment_layer', normalized_layer, 'name', normalized_name)
  );

  return item_id;
end;
$$;

create or replace function public.rename_catalog_item(
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
    select 1 from public.catalog_items
    where kind = item.kind and name_key = lower(normalized_name) and id <> item.id
  ) then
    raise exception 'Ya existe un ítem con ese nombre en el catálogo.';
  end if;

  update public.catalog_items
  set name = normalized_name, updated_by = actor.id, updated_at = now()
  where id = item.id;

  insert into public.catalog_item_events (catalog_item_id, catalog_item_name, actor_id, action, details)
  values (
    item.id,
    normalized_name,
    actor.id,
    'renamed',
    jsonb_build_object('previous_name', item.name, 'next_name', normalized_name)
  );
end;
$$;

create function public.delete_catalog_item(target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  item public.catalog_items%rowtype;
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

  insert into public.catalog_item_events (catalog_item_id, catalog_item_name, actor_id, action, details)
  values (
    item.id,
    item.name,
    actor.id,
    'deleted',
    jsonb_build_object('kind', item.kind, 'garment_layer', item.garment_layer, 'name', item.name)
  );

  delete from public.catalog_items
  where id = item.id;
end;
$$;

revoke all on function public.delete_catalog_item(uuid) from public;
grant execute on function public.delete_catalog_item(uuid) to authenticated;
