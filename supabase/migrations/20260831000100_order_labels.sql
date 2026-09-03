begin;

create type public.order_label as enum (
  'urgent',
  'returned',
  'review'
);

alter table public.orders
  add column label public.order_label;

alter table public.order_change_events
  drop constraint order_change_events_action_check,
  add constraint order_change_events_action_check check (action in ('order_updated', 'promised_delivery_date_changed', 'order_label_changed'));

create or replace function public.set_order_label(
  p_order_id uuid,
  p_label public.order_label,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns table (
  order_id uuid,
  label public.order_label,
  updated_at timestamptz,
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  existing_event public.order_change_events%rowtype;
  previous_label public.order_label;
  request_fingerprint text;
  new_event_id uuid;
begin
  actor := public.pr1a_assert_actor(array['super_admin', 'admin', 'attention', 'employee']::public.app_role[]);

  if p_order_id is null
    or p_expected_updated_at is null
    or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'La etiqueta del pedido no es válida.';
  end if;

  request_fingerprint := md5(concat_ws(
    '|',
    p_order_id::text,
    coalesce(p_label::text, ''),
    p_expected_updated_at::text
  ));

  select * into existing_event
  from public.order_change_events
  where actor_id = actor.id
    and idempotency_key = p_idempotency_key;

  if found then
    if existing_event.action <> 'order_label_changed'
      or existing_event.idempotency_fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra etiqueta.';
    end if;

    select * into target_order
    from public.orders
    where id = existing_event.order_id;

    if not found then
      raise exception 'El pedido seleccionado no existe.';
    end if;

    return query
    select target_order.id, target_order.label, target_order.updated_at, existing_event.id;
    return;
  end if;

  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'El pedido seleccionado no existe.';
  end if;

  if target_order.lifecycle_state <> 'active' then
    raise exception 'Solo se pueden etiquetar pedidos activos.';
  end if;

  if target_order.updated_at <> p_expected_updated_at then
    raise exception 'El pedido cambió en otra sesión. Actualizá el tablero e intentá nuevamente.';
  end if;

  if target_order.label is not distinct from p_label then
    raise exception 'El pedido ya tiene esa etiqueta.';
  end if;

  previous_label := target_order.label;
  update public.orders
  set label = p_label,
      updated_at = now()
  where id = target_order.id
  returning * into target_order;

  insert into public.order_change_events (
    order_id,
    actor_id,
    action,
    details,
    order_updated_at,
    idempotency_key,
    idempotency_fingerprint
  )
  values (
    target_order.id,
    actor.id,
    'order_label_changed',
    jsonb_build_object(
      'version', 1,
      'changes', jsonb_build_array(jsonb_build_object(
        'field', 'label',
        'previous', previous_label::text,
        'next', p_label::text
      ))
    ),
    target_order.updated_at,
    p_idempotency_key,
    request_fingerprint
  )
  returning id into new_event_id;

  return query
  select target_order.id, target_order.label, target_order.updated_at, new_event_id;
end;
$$;

revoke all on function public.set_order_label(uuid, public.order_label, timestamptz, text) from public, anon, authenticated;
grant execute on function public.set_order_label(uuid, public.order_label, timestamptz, text) to authenticated;

drop function public.get_order_board(text);

create function public.get_order_board(p_search text default '')
returns table (
  id uuid,
  public_number bigint,
  customer_name text,
  team_name text,
  label public.order_label,
  quantity integer,
  order_type public.order_type,
  promised_delivery_date date,
  current_stage_id uuid,
  updated_at timestamptz,
  has_design_image boolean,
  image_updated_at timestamptz,
  total_amount numeric(14, 2),
  payment_confirmed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  search_text text := btrim(coalesce(p_search, ''));
  search_digits text := regexp_replace(search_text, '[^0-9]', '', 'g');
begin
  select * into actor
  from public.profiles
  where public.profiles.id = (select auth.uid());

  if not found or not actor.is_active or actor.must_change_password then
    raise exception 'No tenés permiso para consultar el tablero.';
  end if;

  return query
  select
    target_order.id,
    target_order.public_number,
    coalesce(nullif(btrim(target_order.client_name), ''), target_order.customer_name),
    target_order.team_name,
    target_order.label,
    target_order.quantity,
    target_order.order_type,
    target_order.promised_delivery_date,
    target_order.current_stage_id,
    target_order.updated_at,
    (design_image.order_id is not null),
    design_image.updated_at,
    case when actor.role in ('super_admin', 'admin', 'attention') then financials.total_amount else null end,
    payment.confirmed_at
  from public.orders target_order
  left join public.order_financials financials on financials.order_id = target_order.id
  left join lateral (
    select image.order_id, image.updated_at
    from public.order_design_images image
    where image.order_id = target_order.id
    limit 1
  ) design_image on true
  left join public.order_payments payment
    on payment.order_id = target_order.id
    and payment.reversed_at is null
  where target_order.lifecycle_state = 'active'
    and (
      search_text = ''
      or coalesce(target_order.client_name, target_order.customer_name, '') ilike '%' || search_text || '%'
      or coalesce(target_order.team_name, '') ilike '%' || search_text || '%'
      or (search_digits <> '' and regexp_replace(coalesce(target_order.phone, ''), '[^0-9]', '', 'g') like '%' || search_digits || '%')
    )
  order by target_order.public_number;
end;
$$;

revoke all on function public.get_order_board(text) from public, anon, authenticated;
grant execute on function public.get_order_board(text) to authenticated;

commit;
