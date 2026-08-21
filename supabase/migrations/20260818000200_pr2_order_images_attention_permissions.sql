begin;

set local search_path = '';

alter table public.order_design_images
  add column id uuid default gen_random_uuid(),
  add column is_primary boolean not null default false;

update public.order_design_images
set id = gen_random_uuid(),
    is_primary = true
where id is null;

alter table public.order_design_images
  alter column id set not null,
  drop constraint order_design_images_pkey,
  add constraint order_design_images_pkey primary key (id);

create unique index order_design_images_primary_unique_idx
  on public.order_design_images (order_id)
  where is_primary;

alter table public.order_design_image_events
  drop constraint order_design_image_events_action_check,
  add constraint order_design_image_events_action_check check (
    action in ('uploaded', 'replaced', 'deleted', 'primary_set', 'primary_cleared')
  ),
  add column image_id uuid,
  add column result jsonb not null default '{}'::jsonb;

update public.order_design_image_events event
set image_id = image.id
from public.order_design_images image
where event.image_id is null
  and event.order_id = image.order_id
  and event.object_path = image.object_path;

create or replace function public.order_design_images_capacity_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  image_count integer;
begin
  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id then
    raise exception 'La imagen no puede cambiar de pedido.';
  end if;

  perform 1
  from public.orders target_order
  where target_order.id = new.order_id
  for update;

  if not found then
    raise exception 'El pedido seleccionado no existe.';
  end if;

  select count(*)
  into image_count
  from public.order_design_images image
  where image.order_id = new.order_id
    and (tg_op = 'INSERT' or image.id <> new.id);

  if image_count >= 3 then
    raise exception 'Cada pedido puede tener como máximo tres imágenes.';
  end if;

  return new;
end;
$$;

drop trigger if exists order_design_images_capacity_guard on public.order_design_images;
create trigger order_design_images_capacity_guard
before insert or update of order_id on public.order_design_images
for each row execute function public.order_design_images_capacity_guard();

revoke all on function public.order_design_images_capacity_guard() from public, anon, authenticated;

create or replace function public.m7_assert_image_actor(p_actor_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'La confirmación de imágenes requiere un contexto de servidor autorizado.';
  end if;

  select *
  into actor
  from public.profiles
  where id = p_actor_id
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para cargar imágenes del pedido.';
  end if;

  return actor;
end;
$$;

create or replace function public.m7_image_fingerprint(
  p_action text,
  p_order_id uuid,
  p_image_id uuid,
  p_object_path text,
  p_expected_image_updated_at timestamptz
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_action in ('add', 'replace') then md5(concat_ws(
      '|',
      p_order_id::text,
      p_object_path,
      coalesce(p_expected_image_updated_at::text, '')
    ))
    else md5(concat_ws(
      '|',
      'mutate_order_design_image:v1',
      p_action,
      p_order_id::text,
      coalesce(p_image_id::text, ''),
      coalesce(p_object_path, ''),
      coalesce(p_expected_image_updated_at::text, '')
    ))
  end;
$$;

revoke all on function public.m7_assert_image_actor(uuid) from public, anon, authenticated;
revoke all on function public.m7_image_fingerprint(text, uuid, uuid, text, timestamptz) from public, anon, authenticated;

create or replace function public.mutate_order_design_image(
  p_actor_id uuid,
  p_order_id uuid,
  p_action text,
  p_image_id uuid default null,
  p_object_path text default null,
  p_idempotency_key text default null,
  p_expected_image_updated_at timestamptz default null,
  p_make_primary boolean default false
)
returns table (
  order_id uuid,
  image_id uuid,
  object_path text,
  content_type text,
  byte_size bigint,
  uploaded_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_primary boolean,
  previous_object_path text,
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
  object_timestamp timestamptz;
  normalized_action text;
  normalized_key text;
  normalized_path text;
  request_fingerprint text;
  event_action text;
  previous_path text;
  event_path text;
  event_time timestamptz;
  result jsonb;
  new_event_id uuid;
begin
  actor := public.m7_assert_image_actor(p_actor_id);
  normalized_action := lower(btrim(coalesce(p_action, '')));
  normalized_key := btrim(coalesce(p_idempotency_key, ''));
  normalized_path := nullif(btrim(coalesce(p_object_path, '')), '');

  if p_order_id is null
    or normalized_action not in ('add', 'replace', 'delete', 'set_primary', 'clear_primary')
    or char_length(normalized_key) not between 1 and 200 then
    raise exception 'La solicitud de imagen no es válida.';
  end if;

  request_fingerprint := public.m7_image_fingerprint(
    normalized_action,
    p_order_id,
    p_image_id,
    normalized_path,
    p_expected_image_updated_at
  );

  perform pg_advisory_xact_lock(hashtext('digraf:order-image-actor:' || actor.id::text || ':' || normalized_key));

  select *
  into existing_event
  from public.order_design_image_events event
  where event.actor_id = actor.id
    and event.idempotency_key = normalized_key;

  if found then
    if existing_event.idempotency_fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra imagen.';
    end if;

    if existing_event.result <> '{}'::jsonb then
      return query
      select
        (existing_event.result ->> 'order_id')::uuid,
        nullif(existing_event.result ->> 'image_id', '')::uuid,
        existing_event.result ->> 'object_path',
        existing_event.result ->> 'content_type',
        nullif(existing_event.result ->> 'byte_size', '')::bigint,
        nullif(existing_event.result ->> 'uploaded_by', '')::uuid,
        nullif(existing_event.result ->> 'created_at', '')::timestamptz,
        nullif(existing_event.result ->> 'updated_at', '')::timestamptz,
        nullif(existing_event.result ->> 'is_primary', '')::boolean,
        existing_event.result ->> 'previous_object_path',
        existing_event.id;
      return;
    end if;

    select *
    into current_image
    from public.order_design_images image
    where image.id = existing_event.image_id;

    return query
    select
      existing_event.order_id,
      existing_event.image_id,
      existing_event.object_path,
      current_image.content_type,
      current_image.byte_size,
      current_image.uploaded_by,
      current_image.created_at,
      existing_event.image_updated_at,
      current_image.is_primary,
      existing_event.previous_object_path,
      existing_event.id;
    return;
  end if;

  select *
  into target_order
  from public.orders target
  where target.id = p_order_id
  for update;

  if not found then
    raise exception 'El pedido seleccionado no existe.';
  end if;

  if normalized_action in ('add', 'replace') then
    if normalized_path is null
      or normalized_path <> lower(normalized_path)
      or normalized_path !~ (
        '^orders/' || target_order.id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
      ) then
      raise exception 'La solicitud de imagen no es válida.';
    end if;

    select
      lower(storage_object.metadata ->> 'mimetype'),
      case
        when coalesce(storage_object.metadata ->> 'size', '') ~ '^[0-9]+$'
          then (storage_object.metadata ->> 'size')::bigint
        else null
      end,
      coalesce(storage_object.updated_at, storage_object.created_at)
    into object_mime_type, object_byte_size, object_timestamp
    from storage.objects storage_object
    where storage_object.bucket_id = 'order-designs'
      and storage_object.name = normalized_path
    for update;

    if not found
      or object_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
      or object_byte_size not between 1 and 10485760 then
      raise exception 'El archivo de imagen no está disponible o no cumple los límites permitidos.';
    end if;

    if object_timestamp is null or object_timestamp <= now() - interval '60 minutes' then
      raise exception 'La carga de imagen venció. Volvé a cargar el archivo.';
    end if;

    if (object_mime_type = 'image/jpeg' and normalized_path !~ '[.](jpg|jpeg)$')
      or (object_mime_type = 'image/png' and normalized_path !~ '[.]png$')
      or (object_mime_type = 'image/webp' and normalized_path !~ '[.]webp$') then
      raise exception 'El tipo de archivo no coincide con su extensión.';
    end if;
  end if;

  event_time := clock_timestamp();

  if normalized_action = 'add' then
    if p_image_id is not null then
      raise exception 'La solicitud de imagen no es válida.';
    end if;

    if (select count(*) from public.order_design_images image where image.order_id = target_order.id) >= 3 then
      raise exception 'Cada pedido puede tener como máximo tres imágenes.';
    end if;

    if p_make_primary then
      update public.order_design_images image
      set is_primary = false
      where image.order_id = target_order.id
        and image.is_primary;
    end if;

    insert into public.order_design_images (
      order_id,
      object_path,
      content_type,
      byte_size,
      uploaded_by,
      is_primary
    )
    values (
      target_order.id,
      normalized_path,
      object_mime_type,
      object_byte_size,
      actor.id,
      p_make_primary
    )
    returning * into current_image;

    event_action := 'uploaded';
  elsif normalized_action = 'replace' then
    if p_image_id is null then
      raise exception 'La solicitud de imagen no es válida.';
    end if;

    select *
    into current_image
    from public.order_design_images image
    where image.id = p_image_id
      and image.order_id = target_order.id
    for update;

    if not found then
      raise exception 'La imagen seleccionada no pertenece al pedido.';
    end if;

    if current_image.updated_at is distinct from p_expected_image_updated_at then
      raise exception 'La imagen cambió en otra sesión. Actualizala e intentá nuevamente.';
    end if;

    if current_image.object_path = normalized_path then
      raise exception 'La imagen seleccionada ya es la vigente.';
    end if;

    previous_path := current_image.object_path;
    update public.order_design_images image
    set object_path = normalized_path,
        content_type = object_mime_type,
        byte_size = object_byte_size,
        uploaded_by = actor.id,
        updated_at = event_time
    where image.id = current_image.id
    returning * into current_image;

    event_action := 'replaced';
  elsif normalized_action = 'delete' then
    if p_image_id is null or normalized_path is not null or p_expected_image_updated_at is not null then
      raise exception 'La solicitud de imagen no es válida.';
    end if;

    select *
    into current_image
    from public.order_design_images image
    where image.id = p_image_id
      and image.order_id = target_order.id
    for update;

    if not found then
      raise exception 'La imagen seleccionada no pertenece al pedido.';
    end if;

    delete from public.order_design_images image where image.id = current_image.id;
    previous_path := current_image.object_path;
    event_path := current_image.object_path;
    result := jsonb_build_object(
      'order_id', target_order.id,
      'image_id', current_image.id,
      'object_path', current_image.object_path,
      'content_type', current_image.content_type,
      'byte_size', current_image.byte_size,
      'uploaded_by', current_image.uploaded_by,
      'created_at', current_image.created_at,
      'updated_at', current_image.updated_at,
      'is_primary', current_image.is_primary,
      'previous_object_path', previous_path
    );
    event_action := 'deleted';
  elsif normalized_action = 'set_primary' then
    if p_image_id is null or normalized_path is not null or p_expected_image_updated_at is not null then
      raise exception 'La solicitud de imagen no es válida.';
    end if;

    select *
    into current_image
    from public.order_design_images image
    where image.id = p_image_id
      and image.order_id = target_order.id
    for update;

    if not found then
      raise exception 'La imagen seleccionada no pertenece al pedido.';
    end if;

    update public.order_design_images image
    set is_primary = false
    where image.order_id = target_order.id
      and image.id <> current_image.id
      and image.is_primary;

    update public.order_design_images image
    set is_primary = true
    where image.id = current_image.id
    returning * into current_image;

    event_action := 'primary_set';
  else
    if p_image_id is not null or normalized_path is not null or p_expected_image_updated_at is not null then
      raise exception 'La solicitud de imagen no es válida.';
    end if;

    select *
    into current_image
    from public.order_design_images image
    where image.order_id = target_order.id
      and image.is_primary
    order by image.created_at, image.id
    limit 1
    for update;

    if found then
      previous_path := current_image.object_path;
      update public.order_design_images image
      set is_primary = false
      where image.id = current_image.id;
    end if;

    event_path := coalesce(previous_path, '');
    result := jsonb_build_object(
      'order_id', target_order.id,
      'image_id', null,
      'object_path', null,
      'content_type', null,
      'byte_size', null,
      'uploaded_by', null,
      'created_at', null,
      'updated_at', event_time,
      'is_primary', false,
      'previous_object_path', previous_path
    );
    event_action := 'primary_cleared';
  end if;

  if result is null then
    result := jsonb_build_object(
      'order_id', target_order.id,
      'image_id', current_image.id,
      'object_path', current_image.object_path,
      'content_type', current_image.content_type,
      'byte_size', current_image.byte_size,
      'uploaded_by', current_image.uploaded_by,
      'created_at', current_image.created_at,
      'updated_at', current_image.updated_at,
      'is_primary', current_image.is_primary,
      'previous_object_path', previous_path
    );
  end if;

  if event_path is null then
    event_path := coalesce(result ->> 'object_path', '');
  end if;

  insert into public.order_design_image_events (
    order_id,
    actor_id,
    action,
    image_id,
    object_path,
    previous_object_path,
    image_updated_at,
    idempotency_key,
    idempotency_fingerprint,
    result
  )
  values (
    target_order.id,
    actor.id,
    event_action,
    nullif(result ->> 'image_id', '')::uuid,
    event_path,
    previous_path,
    coalesce(nullif(result ->> 'updated_at', '')::timestamptz, event_time),
    normalized_key,
    request_fingerprint,
    result
  )
  returning id into new_event_id;

  return query
  select
    (result ->> 'order_id')::uuid,
    nullif(result ->> 'image_id', '')::uuid,
    result ->> 'object_path',
    result ->> 'content_type',
    nullif(result ->> 'byte_size', '')::bigint,
    nullif(result ->> 'uploaded_by', '')::uuid,
    nullif(result ->> 'created_at', '')::timestamptz,
    nullif(result ->> 'updated_at', '')::timestamptz,
    nullif(result ->> 'is_primary', '')::boolean,
    result ->> 'previous_object_path',
    new_event_id;
end;
$$;

revoke all on function public.mutate_order_design_image(uuid, uuid, text, uuid, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.mutate_order_design_image(uuid, uuid, text, uuid, text, text, timestamptz, boolean) to service_role;

create or replace function public.finalize_order_design_image(
  p_actor_id uuid,
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
  existing_event public.order_design_image_events%rowtype;
  current_image public.order_design_images%rowtype;
  mutation record;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'La confirmación de imágenes requiere un contexto de servidor autorizado.';
  end if;

  select *
  into existing_event
  from public.order_design_image_events event
  where event.actor_id = p_actor_id
    and event.idempotency_key = btrim(coalesce(p_idempotency_key, ''));

  if found then
    select *
    into mutation
    from public.mutate_order_design_image(
      p_actor_id,
      p_order_id,
      'add',
      null,
      p_object_path,
      p_idempotency_key,
      p_expected_image_updated_at,
      true
    );
  else
    select *
    into current_image
    from public.order_design_images image
    where image.order_id = p_order_id
    order by image.is_primary desc, image.created_at, image.id
    limit 1;

    if found then
      select *
      into mutation
      from public.mutate_order_design_image(
        p_actor_id,
        p_order_id,
        'replace',
        current_image.id,
        p_object_path,
        p_idempotency_key,
        p_expected_image_updated_at,
        true
      );
    else
      select *
      into mutation
      from public.mutate_order_design_image(
        p_actor_id,
        p_order_id,
        'add',
        null,
        p_object_path,
        p_idempotency_key,
        p_expected_image_updated_at,
        true
      );
    end if;
  end if;

  return query
  select mutation.order_id, mutation.object_path, mutation.previous_object_path, mutation.updated_at, mutation.event_id;
end;
$$;

revoke all on function public.finalize_order_design_image(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_order_design_image(uuid, uuid, text, text, timestamptz) to service_role;

create or replace function public.update_order(
  p_order_id uuid,
  p_client_name text,
  p_team_name text,
  p_phone text,
  p_order_date date,
  p_promised_delivery_date date,
  p_description text,
  p_total_amount numeric,
  p_deposit_amount numeric,
  p_deposit_paid boolean,
  p_lines jsonb,
  p_change_note text,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns table(order_id uuid, updated_at timestamptz, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target public.orders%rowtype;
  financials public.order_financials%rowtype;
  event_row public.order_change_events%rowtype;
  fingerprint text;
  new_event_id uuid;
  line jsonb;
  event_details jsonb := jsonb_build_object('version', 1, 'changes', '[]'::jsonb, 'line_count', jsonb_array_length(p_lines));
begin
  actor := public.pr1a_assert_actor(array['super_admin', 'admin', 'attention']::public.app_role[]);
  if p_order_id is null or p_expected_updated_at is null or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then raise exception 'La solicitud de edición no es válida.'; end if;
  if char_length(btrim(coalesce(p_client_name, ''))) not between 2 and 200 or char_length(btrim(coalesce(p_team_name, ''))) not between 2 and 200 or char_length(btrim(coalesce(p_phone, ''))) not between 6 and 40 then raise exception 'Completá cliente, equipo y teléfono.'; end if;
  if p_order_date is null or p_promised_delivery_date is null or p_promised_delivery_date < p_order_date then raise exception 'Las fechas del pedido no son válidas.'; end if;
  if p_total_amount is null or p_deposit_amount is null or p_total_amount < 0 or p_deposit_amount < 0 or p_deposit_amount > p_total_amount or p_total_amount <> round(p_total_amount, 2) or p_deposit_amount <> round(p_deposit_amount, 2) then raise exception 'Los importes del pedido no son válidos.'; end if;
  if p_deposit_paid is null then raise exception 'Indicá si la seña fue abonada.'; end if;
  if char_length(coalesce(p_description, '')) > 5000 then raise exception 'La descripción no puede superar los 5000 caracteres.'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'El pedido requiere al menos un renglón.'; end if;
  if jsonb_array_length(p_lines) < 1 then raise exception 'El pedido requiere al menos un renglón.'; end if;
  for line in select value from jsonb_array_elements(p_lines) loop perform public.pr1a_validate_line(line); end loop;
  fingerprint := md5(concat_ws('|', p_order_id, p_client_name, p_team_name, p_phone, p_order_date, p_promised_delivery_date, coalesce(p_description, ''), p_total_amount, p_deposit_amount, p_deposit_paid, p_lines, coalesce(p_change_note, ''), p_expected_updated_at));
  select * into event_row from public.order_change_events where actor_id = actor.id and idempotency_key = p_idempotency_key;
  if found then if event_row.idempotency_fingerprint <> fingerprint then raise exception 'La clave de idempotencia ya fue utilizada para otra edición.'; end if; return query select event_row.order_id, event_row.order_updated_at, event_row.id; return; end if;
  select * into target from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  if target.updated_at <> p_expected_updated_at then raise exception 'El pedido cambió en otra sesión. Actualizalo e intentá nuevamente.'; end if;
  select * into financials from public.order_financials where public.order_financials.order_id = target.id for update;
  if not found then raise exception 'Los importes del pedido no están disponibles.'; end if;
  if target.client_name is distinct from btrim(p_client_name) then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'client_name', 'previous', target.client_name, 'next', btrim(p_client_name)))); end if;
  if target.team_name is distinct from btrim(p_team_name) then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'team_name', 'previous', target.team_name, 'next', btrim(p_team_name)))); end if;
  if target.phone is distinct from btrim(p_phone) then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'phone'))); end if;
  if target.order_date is distinct from p_order_date then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'order_date', 'previous', target.order_date, 'next', p_order_date))); end if;
  if target.promised_delivery_date is distinct from p_promised_delivery_date then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'promised_delivery_date', 'previous', target.promised_delivery_date, 'next', p_promised_delivery_date))); end if;
  if target.description is distinct from nullif(btrim(coalesce(p_description, '')), '') then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'description'))); end if;
  if financials.total_amount is distinct from p_total_amount then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'total_amount', 'previous', financials.total_amount, 'next', p_total_amount))); end if;
  if financials.deposit_amount is distinct from p_deposit_amount then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'deposit_amount', 'previous', financials.deposit_amount, 'next', p_deposit_amount))); end if;
  if financials.deposit_paid is distinct from p_deposit_paid then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'deposit_paid', 'previous', financials.deposit_paid, 'next', p_deposit_paid))); end if;
  event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'specifications')));
  update public.orders set client_name = btrim(p_client_name), team_name = btrim(p_team_name), phone = btrim(p_phone), customer_name = null, quantity = (select sum((value ->> 'quantity')::integer) from jsonb_array_elements(p_lines)), order_type = (select case when count(*) = 1 and min(value ->> 'line_type') = 'set' then 'set'::public.order_type when count(*) = 1 and min(value ->> 'line_type') = 'individual' then 'individual'::public.order_type else null end from jsonb_array_elements(p_lines)), order_date = p_order_date, promised_delivery_date = p_promised_delivery_date, description = nullif(btrim(coalesce(p_description, '')), ''), updated_at = now() where id = target.id returning * into target;
  update public.order_financials set total_amount = p_total_amount, deposit_amount = p_deposit_amount, deposit_paid = p_deposit_paid, updated_at = now() where public.order_financials.order_id = target.id;
  delete from public.order_line_shields where order_line_id in (select id from public.order_lines where public.order_lines.order_id = target.id);
  delete from public.order_lines where public.order_lines.order_id = target.id;
  perform public.pr1a_insert_lines(target.id, p_lines);
  insert into public.order_change_events(order_id, actor_id, action, details, change_note, order_updated_at, idempotency_key, idempotency_fingerprint) values(target.id, actor.id, 'order_updated', event_details, nullif(btrim(coalesce(p_change_note, '')), ''), target.updated_at, p_idempotency_key, fingerprint) returning id into new_event_id;
  return query select target.id, target.updated_at, new_event_id;
end;
$$;

revoke all on function public.update_order(uuid, text, text, text, date, date, text, numeric, numeric, boolean, jsonb, text, timestamptz, text) from public;
grant execute on function public.update_order(uuid, text, text, text, date, date, text, numeric, numeric, boolean, jsonb, text, timestamptz, text) to authenticated;

create or replace function public.reverse_order_payment(
  p_order_id uuid,
  p_payment_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text,
  p_reason text default null
)
returns table (
  order_id uuid,
  payment_id uuid,
  reversal_cash_movement_id uuid,
  event_id uuid,
  from_stage_id uuid,
  to_stage_id uuid,
  stage_code text,
  updated_at timestamptz,
  amount numeric(14, 2)
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  payment public.order_payments%rowtype;
  original public.cash_movements%rowtype;
  day public.cash_days%rowtype;
  financials public.order_financials%rowtype;
  paid_stage public.workflow_stages%rowtype;
  restored_stage public.workflow_stages%rowtype;
  confirmed_event public.order_payment_events%rowtype;
  existing_event public.order_payment_events%rowtype;
  normalized_key text;
  normalized_reason text;
  fingerprint text;
  event_time timestamptz;
  reversal_id uuid;
  reversal_event_id uuid;
  restored_stage_id uuid;
  reversal_day_id uuid;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para revertir pagos.';
  end if;
  normalized_key := btrim(coalesce(p_idempotency_key, ''));
  normalized_reason := nullif(regexp_replace(lower(btrim(coalesce(p_reason, ''))), '\s+', ' ', 'g'), '');
  if p_order_id is null or p_payment_id is null or p_expected_updated_at is null or char_length(normalized_key) not between 1 and 200 then
    raise exception 'La reversión de pago no es válida.';
  end if;
  if normalized_reason is not null and char_length(normalized_reason) > 500 then
    raise exception 'El motivo de reversión no puede superar los 500 caracteres.';
  end if;
  fingerprint := public.m12_reversal_fingerprint(p_order_id, p_payment_id, p_expected_updated_at, normalized_reason);
  perform pg_advisory_xact_lock(hashtext('digraf:reversal-actor:' || actor.id::text || ':' || normalized_key));
  select * into existing_event from public.order_payment_events event where event.actor_id = actor.id and event.idempotency_key = normalized_key and event.event_type = 'reversed';
  if found then
    if existing_event.fingerprint <> fingerprint then raise exception 'La clave de idempotencia ya fue utilizada para otra reversión.'; end if;
    return query select replay_payment.order_id, replay_payment.id, replay_payment.reversal_cash_movement_id, existing_event.id,
      (confirmed_event_row.order_snapshot ->> 'to_stage_id')::uuid, (confirmed_event_row.order_snapshot ->> 'from_stage_id')::uuid,
      existing_event.stage, (existing_event.order_snapshot ->> 'updated_at')::timestamptz, replay_payment.amount
    from public.order_payments replay_payment
    join public.order_payment_events confirmed_event_row on confirmed_event_row.order_payment_id = replay_payment.id and confirmed_event_row.event_type = 'confirmed'
    where replay_payment.id = existing_event.order_payment_id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('digraf:cash-rollover'));
  select movement.cash_day_id into reversal_day_id
  from public.order_payments payment_for_lock
  join public.cash_movements movement on movement.id = payment_for_lock.cash_movement_id
  where payment_for_lock.id = p_payment_id and payment_for_lock.amount > 0;
  if reversal_day_id is not null then
    select * into day from public.cash_days where id = reversal_day_id for update;
  end if;
  select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  select payment_row.* into payment from public.order_payments payment_row where payment_row.id = p_payment_id and payment_row.order_id = p_order_id for update;
  if not found then raise exception 'El pago seleccionado no existe.'; end if;
  select * into confirmed_event from public.order_payment_events event where event.order_payment_id = payment.id and event.event_type = 'confirmed' order by event.occurred_at limit 1;
  if not found or confirmed_event.order_snapshot ->> 'from_stage_id' is null then raise exception 'El pago no tiene etapa previa registrada.'; end if;
  restored_stage_id := (confirmed_event.order_snapshot ->> 'from_stage_id')::uuid;
  select * into restored_stage from public.workflow_stages where id = restored_stage_id for key share;
  if not found then raise exception 'La etapa previa del pago no está disponible.'; end if;
  select * into paid_stage from public.workflow_stages where code = 'paid' and is_active for key share;
  if not found then raise exception 'La etapa Pagado no está disponible.'; end if;
  if payment.reversed_at is not null then raise exception 'El pago ya fue revertido.'; end if;
  if target_order.updated_at <> p_expected_updated_at then raise exception 'El pedido cambió en otra sesión. Actualizá el tablero e intentá nuevamente.'; end if;
  if target_order.current_stage_id <> paid_stage.id then raise exception 'El pedido no está en la etapa Pagado.'; end if;
  select * into financials from public.order_financials financial_row where financial_row.order_id = target_order.id for update;
  if not found or payment.amount <> financials.total_amount then raise exception 'El importe del pago no coincide con el pedido.'; end if;
  if payment.amount > 0 then
    select * into original from public.cash_movements where id = payment.cash_movement_id for key share;
    if not found or original.direction <> 'income' or day.id <> original.cash_day_id or day.closed_at is not null then raise exception 'La caja está cerrada y no admite reversiones.'; end if;
    event_time := clock_timestamp();
    reversal_id := gen_random_uuid();
    insert into public.cash_movements (id, cash_day_id, direction, amount, description, actor_id, created_at, idempotency_key, idempotency_fingerprint, is_payment_reversal)
    values (reversal_id, original.cash_day_id, 'expense', payment.amount, 'Reversión PED-' || lpad(target_order.public_number::text, 6, '0'), actor.id, event_time, 'payment-reversal:' || payment.id::text, fingerprint, true);
  else
    event_time := clock_timestamp();
  end if;
  update public.order_payments set reversal_cash_movement_id = reversal_id, reversed_at = event_time where id = payment.id returning public.order_payments.* into payment;
  update public.orders set current_stage_id = restored_stage.id, updated_at = event_time where id = target_order.id returning * into target_order;
  insert into public.order_stage_events(order_id, from_stage_id, to_stage_id, actor_id, created_at, idempotency_key, idempotency_fingerprint)
  values(target_order.id, paid_stage.id, restored_stage.id, actor.id, event_time, 'payment-reversal:' || payment.id::text, fingerprint);
  insert into public.order_payment_events(order_payment_id, event_type, order_snapshot, payment_snapshot, stage, actor_id, occurred_at, idempotency_key, fingerprint)
  values(payment.id, 'reversed', jsonb_build_object('id', target_order.id, 'public_number', target_order.public_number, 'from_stage_id', paid_stage.id, 'to_stage_id', restored_stage.id, 'updated_at', target_order.updated_at), jsonb_build_object('id', payment.id, 'amount', payment.amount, 'cash_movement_id', payment.cash_movement_id, 'reversal_cash_movement_id', payment.reversal_cash_movement_id, 'reversed_at', event_time), restored_stage.code, actor.id, event_time, normalized_key, fingerprint)
  returning id into reversal_event_id;
  return query select target_order.id, payment.id, payment.reversal_cash_movement_id, reversal_event_id, paid_stage.id, restored_stage.id, restored_stage.code, target_order.updated_at, payment.amount;
end;
$$;

revoke all on function public.reverse_order_payment(uuid, uuid, timestamptz, text, text) from public, anon;
grant execute on function public.reverse_order_payment(uuid, uuid, timestamptz, text, text) to authenticated;

commit;
