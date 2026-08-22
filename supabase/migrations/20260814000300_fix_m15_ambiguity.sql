begin;

set local search_path = '';

create or replace function public.get_order_board()
returns table (
  id uuid,
  public_number bigint,
  customer_name text,
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
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where public.profiles.id = (select auth.uid());
  if not found or not actor.is_active or actor.must_change_password then raise exception 'No tenés permiso para consultar el tablero.'; end if;
  return query
  select target_order.id, target_order.public_number, target_order.customer_name, target_order.quantity, target_order.order_type, target_order.promised_delivery_date, target_order.current_stage_id, target_order.updated_at,
    (design_image.order_id is not null), design_image.updated_at,
    case when actor.role in ('super_admin', 'admin', 'attention') then financials.total_amount else null end,
    payment.confirmed_at
  from public.orders target_order
  left join public.order_financials financials on financials.order_id = target_order.id
  left join lateral (select image.order_id, image.updated_at from public.order_design_images image where image.order_id = target_order.id limit 1) design_image on true
  left join public.order_payments payment on payment.order_id = target_order.id and payment.reversed_at is null
  where target_order.lifecycle_state = 'active'
  order by target_order.public_number;
end;
$$;

revoke all on function public.get_order_board() from public, anon, authenticated;
grant execute on function public.get_order_board() to authenticated;

create or replace function public.get_order_timeline(p_order_id uuid)
returns table (event_id uuid, event_type text, actor_display_name text, occurred_at timestamptz, details jsonb, comment_body text, change_note text, from_stage_id uuid, to_stage_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
begin
  select * into actor from public.profiles where public.profiles.id = (select auth.uid());
  if not found or not actor.is_active or actor.must_change_password then raise exception 'No tenés permiso para ver el historial del pedido.'; end if;
  select * into target_order from public.orders where public.orders.id = p_order_id;
  if not found or (target_order.lifecycle_state = 'cancelled' and actor.role not in ('super_admin', 'admin')) then raise exception 'El pedido seleccionado no existe.'; end if;
  return query select * from (
    select e.id, 'stage_moved'::text, p.display_name, e.created_at, '{}'::jsonb, null::text, null::text, e.from_stage_id, e.to_stage_id
    from public.order_stage_events e join public.profiles p on p.id = e.actor_id where e.order_id = p_order_id
    union all
    select e.id, e.action, p.display_name, e.created_at,
      case when actor.role = 'employee' and exists (select 1 from jsonb_array_elements(coalesce(e.details->'changes', '[]'::jsonb)) item where item->>'field' in ('total_amount', 'deposit_amount', 'deposit_paid')) then jsonb_build_object('version', 1, 'changes', jsonb_build_array(jsonb_build_object('field', 'order_updated'))) else e.details end,
      null::text,
      case when actor.role = 'employee' and exists (select 1 from jsonb_array_elements(coalesce(e.details->'changes', '[]'::jsonb)) item where item->>'field' in ('total_amount', 'deposit_amount', 'deposit_paid')) then null else e.change_note end,
      null::uuid, null::uuid
    from public.order_change_events e join public.profiles p on p.id = e.actor_id where e.order_id = p_order_id
    union all
    select e.id, 'commented'::text, p.display_name, e.created_at, '{}'::jsonb, e.body, null::text, null::uuid, null::uuid
    from public.order_comments e join public.profiles p on p.id = e.actor_id where e.order_id = p_order_id
    union all
    select e.id, case when e.event_type = 'confirmed' then 'payment_confirmed' else 'payment_reversed' end, p.display_name, e.occurred_at,
      case when actor.role in ('super_admin', 'admin', 'attention') then e.payment_snapshot else jsonb_build_object('version', 1, case when e.event_type = 'confirmed' then 'payment_confirmed' else 'payment_reversed' end, true) end,
      null::text, null::text, null::uuid, null::uuid
    from public.order_payment_events e join public.profiles p on p.id = e.actor_id join public.order_payments payment on payment.id = e.order_payment_id where payment.order_id = p_order_id and e.event_type in ('confirmed', 'reversed')
    union all
    select e.id, case when e.event_type = 'cancelled' then 'order_cancelled' else 'order_restored' end, p.display_name, e.occurred_at,
      jsonb_build_object('version', e.version, 'reason', e.reason, 'from_state', e.from_state, 'to_state', e.to_state, 'snapshot', e.result_snapshot),
      null::text, null::text, null::uuid, null::uuid
    from public.order_lifecycle_events e join public.profiles p on p.id = e.actor_id where e.order_id = p_order_id
  ) timeline(event_id, event_type, actor_display_name, occurred_at, details, comment_body, change_note, from_stage_id, to_stage_id)
  order by timeline.occurred_at desc, timeline.event_type asc, timeline.event_id asc;
end;
$$;

revoke all on function public.get_order_timeline(uuid) from public, anon;
grant execute on function public.get_order_timeline(uuid) to authenticated;

commit;
