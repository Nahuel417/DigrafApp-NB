begin;

drop function if exists public.get_order_board(text);

create function public.get_order_board(p_search text default '')
returns table (
  id uuid,
  public_number bigint,
  customer_name text,
  team_name text,
  label public.order_label,
  quantity integer,
  promised_delivery_date date,
  current_stage_id uuid,
  updated_at timestamptz,
  image_updated_at timestamptz,
  product_name text,
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
    target_order.promised_delivery_date,
    target_order.current_stage_id,
    target_order.updated_at,
    design_image.updated_at,
    product_names.product_name,
    case when actor.role in ('super_admin', 'admin', 'attention') then financials.total_amount else null end,
    payment.confirmed_at
  from public.orders target_order
  left join public.order_financials financials on financials.order_id = target_order.id
  left join lateral (
    select image.updated_at
    from public.order_design_images image
    where image.order_id = target_order.id
      and image.is_primary = true
    limit 1
  ) design_image on true
  left join lateral (
    select string_agg(
      case
        when line.line_type = 'set' and jsonb_typeof(line.configuration) = 'object' then
          coalesce(
            nullif(array_to_string(array_remove(array[
              nullif(line.configuration->'upper'->>'product_name', ''),
              nullif(line.configuration->'lower'->>'product_name', '')
            ], null), ' + '), ''),
            line.product_name_snapshot
          )
        else line.product_name_snapshot
      end,
      ' + ' order by line.position
    ) as product_name
    from public.order_lines line
    where line.order_id = target_order.id
  ) product_names on true
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

create function public.get_order_board_snapshot(p_order_id uuid)
returns table (
  id uuid,
  public_number bigint,
  customer_name text,
  team_name text,
  label public.order_label,
  quantity integer,
  promised_delivery_date date,
  current_stage_id uuid,
  updated_at timestamptz,
  image_updated_at timestamptz,
  product_name text,
  total_amount numeric(14, 2),
  payment_confirmed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where public.profiles.id = (select auth.uid());
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
    target_order.promised_delivery_date,
    target_order.current_stage_id,
    target_order.updated_at,
    design_image.updated_at,
    product_names.product_name,
    case when actor.role in ('super_admin', 'admin', 'attention') then financials.total_amount else null end,
    payment.confirmed_at
  from public.orders target_order
  left join public.order_financials financials on financials.order_id = target_order.id
  left join lateral (
    select image.updated_at
    from public.order_design_images image
    where image.order_id = target_order.id and image.is_primary = true
    limit 1
  ) design_image on true
  left join lateral (
    select string_agg(
      case
        when line.line_type = 'set' and jsonb_typeof(line.configuration) = 'object' then coalesce(
          nullif(array_to_string(array_remove(array[
            nullif(line.configuration->'upper'->>'product_name', ''),
            nullif(line.configuration->'lower'->>'product_name', '')
          ], null), ' + '), ''), line.product_name_snapshot)
        else line.product_name_snapshot
      end,
      ' + ' order by line.position
    ) as product_name
    from public.order_lines line
    where line.order_id = target_order.id
  ) product_names on true
  left join public.order_payments payment
    on payment.order_id = target_order.id and payment.reversed_at is null
  where target_order.id = p_order_id
    and target_order.lifecycle_state = 'active'
  limit 1;
end;
$$;

revoke all on function public.get_order_board(text) from public, anon, authenticated;
grant execute on function public.get_order_board(text) to authenticated;
revoke all on function public.get_order_board_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.get_order_board_snapshot(uuid) to authenticated;

commit;
