do $$
declare
  actor_id uuid;
  stage_id uuid;
  legacy_order_id uuid := gen_random_uuid();
  first_image_id uuid := gen_random_uuid();
  second_image_id uuid := gen_random_uuid();
begin
  select profile.id
  into actor_id
  from public.profiles profile
  where profile.role = 'super_admin'
    and profile.is_active
  order by profile.id
  limit 1;

  select stage.id
  into stage_id
  from public.workflow_stages stage
  where stage.code = 'received'
  limit 1;

  if actor_id is null or stage_id is null then
    raise exception 'La prueba requiere un perfil Super admin y la etapa received.';
  end if;

  insert into public.orders (
    id,
    customer_name,
    quantity,
    order_type,
    order_date,
    promised_delivery_date,
    current_stage_id,
    created_by,
    idempotency_key,
    idempotency_fingerprint
  )
  values (
    legacy_order_id,
    'Legacy image migration test',
    1,
    'individual',
    date '2026-08-01',
    date '2026-08-02',
    stage_id,
    actor_id,
    'pr2-legacy-primary-' || legacy_order_id::text,
    md5(legacy_order_id::text)
  );

  insert into public.order_design_images (
    id,
    order_id,
    object_path,
    content_type,
    byte_size,
    uploaded_by,
    created_at,
    is_primary
  )
  values
    (
      first_image_id,
      legacy_order_id,
      'orders/' || legacy_order_id::text || '/' || first_image_id::text || '.png',
      'image/png',
      1024,
      actor_id,
      timestamptz '2026-08-01 00:00:00+00',
      false
    ),
    (
      second_image_id,
      legacy_order_id,
      'orders/' || legacy_order_id::text || '/' || second_image_id::text || '.png',
      'image/png',
      1024,
      actor_id,
      timestamptz '2026-08-02 00:00:00+00',
      false
    );

  with legacy_primary_candidates as (
    select distinct on (image.order_id) image.id
    from public.order_design_images image
    where not image.is_primary
      and not exists (
        select 1
        from public.order_design_images primary_image
        where primary_image.order_id = image.order_id
          and primary_image.is_primary
      )
    order by image.order_id, image.created_at, image.id
  )
  update public.order_design_images image
  set is_primary = true
  from legacy_primary_candidates candidate
  where image.id = candidate.id;

  if (select count(*) from public.order_design_images image where image.order_id = legacy_order_id and image.is_primary) <> 1 then
    raise exception 'El backfill debe dejar exactamente una primaria.';
  end if;

  if not exists (
    select 1
    from public.order_design_images image
    where image.id = first_image_id
      and image.is_primary
  ) then
    raise exception 'El backfill debe elegir la imagen más antigua como primaria.';
  end if;

  delete from public.order_design_images image
  where image.order_id = legacy_order_id;
  delete from public.orders order_row
  where order_row.id = legacy_order_id;
end;
$$;
