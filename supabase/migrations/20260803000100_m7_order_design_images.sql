insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-designs',
  'order-designs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
);

create table public.order_design_images (
  order_id uuid primary key references public.orders (id),
  object_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_design_images_path_check check (
    object_path = lower(object_path)
    and object_path ~ (
      '^orders/' || order_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
    )
  ),
  constraint order_design_images_extension_check check (
    (content_type = 'image/jpeg' and object_path ~ '[.](jpg|jpeg)$')
    or (content_type = 'image/png' and object_path ~ '[.]png$')
    or (content_type = 'image/webp' and object_path ~ '[.]webp$')
  )
);

create table public.order_design_image_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  actor_id uuid not null references public.profiles (id),
  action text not null check (action in ('uploaded', 'replaced')),
  object_path text not null,
  previous_object_path text,
  image_updated_at timestamptz not null,
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 200),
  idempotency_fingerprint text not null check (char_length(idempotency_fingerprint) = 32),
  created_at timestamptz not null default now(),
  unique (actor_id, idempotency_key)
);

create index order_design_image_events_order_created_at_idx
  on public.order_design_image_events (order_id, created_at desc, id);

alter table public.order_design_images enable row level security;
alter table public.order_design_image_events enable row level security;

revoke all on table public.order_design_images from anon, authenticated;
revoke all on table public.order_design_image_events from anon, authenticated;

grant select on table public.order_design_images to authenticated;
grant select on table public.order_design_image_events to authenticated;
grant select, insert, update, delete on table public.order_design_images to service_role;
grant select, insert, update, delete on table public.order_design_image_events to service_role;

create policy "Operational users can read order design images"
on public.order_design_images
for select
to authenticated
using ((select public.current_active_role()) is not null);

create policy "Operational users can read order design image events"
on public.order_design_image_events
for select
to authenticated
using ((select public.current_active_role()) is not null);

create policy "Operational users can read order design objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'order-designs'
  and (select public.current_active_role()) is not null
  and name ~ '^orders/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
  and exists (
    select 1
    from public.orders
    where orders.id::text = split_part(name, '/', 2)
  )
);

create policy "Image managers can upload order design objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'order-designs'
  and (select public.current_active_role()) in ('super_admin', 'admin', 'attention')
  and name ~ '^orders/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
  and exists (
    select 1
    from public.orders
    where orders.id::text = split_part(name, '/', 2)
  )
);

create function public.finalize_order_design_image(
  p_order_id uuid,
  p_object_path text,
  p_idempotency_key text,
  p_expected_image_updated_at timestamptz default null
)
returns table (
  order_id uuid,
  object_path text,
  previous_object_path text,
  image_updated_at timestamptz,
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  current_image public.order_design_images%rowtype;
  existing_event public.order_design_image_events%rowtype;
  object_mime_type text;
  object_byte_size bigint;
  previous_path text;
  request_fingerprint text;
  event_action text;
  new_event_id uuid;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para cargar imágenes del pedido.';
  end if;

  if p_order_id is null
    or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200
    or p_object_path is null
    or p_object_path <> lower(p_object_path)
    or p_object_path !~ (
      '^orders/' || p_order_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
    ) then
    raise exception 'La solicitud de imagen no es válida.';
  end if;

  request_fingerprint := md5(concat_ws(
    '|',
    p_order_id::text,
    p_object_path,
    coalesce(p_expected_image_updated_at::text, '')
  ));

  select * into existing_event
  from public.order_design_image_events
  where actor_id = actor.id
    and idempotency_key = p_idempotency_key;

  if found then
    if existing_event.idempotency_fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra imagen.';
    end if;

    return query
    select
      existing_event.order_id,
      existing_event.object_path,
      existing_event.previous_object_path,
      existing_event.image_updated_at,
      existing_event.id;
    return;
  end if;

  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'El pedido seleccionado no existe.';
  end if;

  select * into current_image
  from public.order_design_images image
  where image.order_id = target_order.id
  for update;

  if found and current_image.updated_at is distinct from p_expected_image_updated_at then
    raise exception 'La imagen cambió en otra sesión. Actualizala e intentá nuevamente.';
  end if;

  if not found and p_expected_image_updated_at is not null then
    raise exception 'La imagen cambió en otra sesión. Actualizala e intentá nuevamente.';
  end if;

  if found and current_image.object_path = p_object_path then
    raise exception 'La imagen seleccionada ya es la vigente.';
  end if;

  select
    lower(storage_object.metadata ->> 'mimetype'),
    case
      when coalesce(storage_object.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (storage_object.metadata ->> 'size')::bigint
      else null
    end
  into object_mime_type, object_byte_size
  from storage.objects storage_object
  where storage_object.bucket_id = 'order-designs'
    and storage_object.name = p_object_path
  for update;

  if not found
    or object_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or object_byte_size not between 1 and 10485760 then
    raise exception 'El archivo de imagen no está disponible o no cumple los límites permitidos.';
  end if;

  if (object_mime_type = 'image/jpeg' and p_object_path !~ '[.](jpg|jpeg)$')
    or (object_mime_type = 'image/png' and p_object_path !~ '[.]png$')
    or (object_mime_type = 'image/webp' and p_object_path !~ '[.]webp$') then
    raise exception 'El tipo de archivo no coincide con su extensión.';
  end if;

  if current_image.order_id is null then
    event_action := 'uploaded';

    insert into public.order_design_images (
      order_id,
      object_path,
      content_type,
      byte_size,
      uploaded_by
    )
    values (
      target_order.id,
      p_object_path,
      object_mime_type,
      object_byte_size,
      actor.id
    )
    returning * into current_image;
  else
    event_action := 'replaced';
    previous_path := current_image.object_path;

    update public.order_design_images image
    set object_path = p_object_path,
        content_type = object_mime_type,
        byte_size = object_byte_size,
        uploaded_by = actor.id,
        updated_at = now()
    where image.order_id = target_order.id
    returning * into current_image;
  end if;

  insert into public.order_design_image_events (
    order_id,
    actor_id,
    action,
    object_path,
    previous_object_path,
    image_updated_at,
    idempotency_key,
    idempotency_fingerprint
  )
  values (
    target_order.id,
    actor.id,
    event_action,
    current_image.object_path,
    previous_path,
    current_image.updated_at,
    p_idempotency_key,
    request_fingerprint
  )
  returning id into new_event_id;

  return query
  select
    target_order.id,
    current_image.object_path,
    previous_path,
    current_image.updated_at,
    new_event_id;
end;
$$;

revoke all on function public.finalize_order_design_image(uuid, text, text, timestamptz) from public;
grant execute on function public.finalize_order_design_image(uuid, text, text, timestamptz) to authenticated;
