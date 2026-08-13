create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  amount numeric(14, 2) not null check (amount >= 0),
  cash_movement_id uuid references public.cash_movements (id),
  actor_id uuid not null references public.profiles (id),
  confirmed_at timestamptz not null default clock_timestamp(),
  reversed_at timestamptz,
  reversal_cash_movement_id uuid references public.cash_movements (id),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 200),
  fingerprint text not null check (char_length(fingerprint) = 32),
  constraint order_payments_cash_movement_check check (
    (amount = 0 and cash_movement_id is null)
    or (amount > 0 and cash_movement_id is not null)
  )
);

create table public.order_payment_events (
  id uuid primary key default gen_random_uuid(),
  order_payment_id uuid not null references public.order_payments (id),
  event_type text not null check (event_type in ('confirmed', 'reversed')),
  order_snapshot jsonb not null check (jsonb_typeof(order_snapshot) = 'object'),
  payment_snapshot jsonb not null check (jsonb_typeof(payment_snapshot) = 'object'),
  stage text not null check (char_length(btrim(stage)) between 1 and 80),
  actor_id uuid not null references public.profiles (id),
  occurred_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 200),
  fingerprint text not null check (char_length(fingerprint) = 32)
);

create index order_payments_order_confirmed_at_idx
  on public.order_payments (order_id, confirmed_at desc);

create index order_payments_actor_confirmed_at_idx
  on public.order_payments (actor_id, confirmed_at desc);

create index order_payments_idempotency_key_idx
  on public.order_payments (idempotency_key);

create unique index order_payments_active_order_idx
  on public.order_payments (order_id)
  where reversed_at is null;

create unique index order_payments_actor_idempotency_key_idx
  on public.order_payments (actor_id, idempotency_key);

create index order_payment_events_payment_occurred_at_idx
  on public.order_payment_events (order_payment_id, occurred_at desc, id);

create index order_payment_events_order_occurred_at_idx
  on public.order_payment_events ((order_snapshot->>'id'), occurred_at desc, id);

create index order_payment_events_actor_occurred_at_idx
  on public.order_payment_events (actor_id, occurred_at desc, id);

alter table public.order_payments enable row level security;
alter table public.order_payment_events enable row level security;

revoke all on table public.order_payments from anon, authenticated;
revoke all on table public.order_payment_events from anon, authenticated;
grant select on table public.order_payments to authenticated;
grant select on table public.order_payment_events to authenticated;
grant select, insert, update, delete on table public.order_payments to service_role;
grant select, insert, update, delete on table public.order_payment_events to service_role;

create policy "Financial roles can read order payments"
on public.order_payments
for select
to authenticated
using ((select public.current_active_role()) in ('super_admin', 'admin', 'attention'));

create policy "Financial roles can read order payment events"
on public.order_payment_events
for select
to authenticated
using ((select public.current_active_role()) in ('super_admin', 'admin', 'attention'));

create or replace function public.m11_payment_fingerprint(
  p_order_id uuid,
  p_expected_updated_at timestamptz
)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws('|', 'confirm_order_payment', p_order_id::text, p_expected_updated_at::text));
$$;

revoke all on function public.m11_payment_fingerprint(uuid, timestamptz) from public, anon, authenticated;

create function public.get_order_board()
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
declare
  actor public.profiles%rowtype;
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
    target_order.customer_name,
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
  order by target_order.public_number;
end;
$$;

revoke all on function public.get_order_board() from public, anon, authenticated;
grant execute on function public.get_order_board() to authenticated;

create function public.confirm_order_payment(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns table (
  order_id uuid,
  public_number bigint,
  from_stage_id uuid,
  to_stage_id uuid,
  stage_code text,
  updated_at timestamptz,
  payment_id uuid,
  cash_movement_id uuid,
  event_id uuid,
  confirmed_at timestamptz,
  amount numeric(14, 2)
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  source_stage public.workflow_stages%rowtype;
  paid_stage public.workflow_stages%rowtype;
  financials public.order_financials%rowtype;
  current_day public.cash_days%rowtype;
  existing_payment public.order_payments%rowtype;
  existing_event public.order_payment_events%rowtype;
  request_fingerprint text;
  normalized_key text;
  event_time timestamptz;
  new_payment_id uuid;
  new_cash_movement_id uuid;
  new_stage_event_id uuid;
  new_payment_event_id uuid;
  cash_key text;
  cash_fingerprint text;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para confirmar pagos.';
  end if;

  normalized_key := btrim(coalesce(p_idempotency_key, ''));
  if p_order_id is null
    or p_expected_updated_at is null
    or char_length(normalized_key) not between 1 and 200 then
    raise exception 'La confirmación de pago no es válida.';
  end if;

  request_fingerprint := public.m11_payment_fingerprint(p_order_id, p_expected_updated_at);
  perform pg_advisory_xact_lock(hashtext('digraf:payment-actor:' || actor.id::text || ':' || normalized_key));

  select * into existing_payment
  from public.order_payments payment
  where payment.actor_id = actor.id
    and payment.idempotency_key = normalized_key;

  if found then
    if existing_payment.fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra confirmación de pago.';
    end if;

    select * into existing_event
    from public.order_payment_events payment_event
    where payment_event.order_payment_id = existing_payment.id
      and payment_event.event_type = 'confirmed'
    order by payment_event.occurred_at, payment_event.id
    limit 1;

    return query
    select
      existing_payment.order_id,
      (existing_event.order_snapshot->>'public_number')::bigint,
      (existing_event.order_snapshot->>'from_stage_id')::uuid,
      (existing_event.order_snapshot->>'to_stage_id')::uuid,
      existing_event.stage,
      (existing_event.order_snapshot->>'updated_at')::timestamptz,
      existing_payment.id,
      existing_payment.cash_movement_id,
      existing_event.id,
      existing_payment.confirmed_at,
      existing_payment.amount;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('digraf:payment-order:' || p_order_id::text));

  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'El pedido seleccionado no existe.';
  end if;

  if target_order.updated_at <> p_expected_updated_at then
    raise exception 'El pedido cambió en otra sesión. Actualizá el tablero e intentá nuevamente.';
  end if;

  select * into source_stage
  from public.workflow_stages
  where id = target_order.current_stage_id
  for key share;

  if not found or source_stage.code = 'paid' then
    raise exception 'El pedido ya está pagado.';
  end if;

  select * into paid_stage
  from public.workflow_stages
  where code = 'paid'
    and is_active
  for key share;

  if not found then
    raise exception 'La etapa Pagado no está disponible.';
  end if;

  if exists (
    select 1
    from public.order_payments payment
    where payment.order_id = target_order.id
      and payment.reversed_at is null
  ) then
    raise exception 'El pedido ya está pagado.';
  end if;

  select target_financials.* into financials
  from public.order_financials target_financials
  where target_financials.order_id = target_order.id
  for update;

  if not found then
    raise exception 'El pedido no tiene importes disponibles.';
  end if;

  new_payment_id := gen_random_uuid();
  event_time := clock_timestamp();

  if financials.total_amount > 0 then
    perform public.ensure_current_cash_day();

    select * into current_day
    from public.cash_days
    where operational_date = (now() at time zone 'America/Argentina/Cordoba')::date
    for update;

    if not found or current_day.closed_at is not null then
      raise exception 'La caja está cerrada y no admite nuevas cobranzas.';
    end if;

    new_cash_movement_id := gen_random_uuid();
    cash_key := 'order-payment:' || new_payment_id::text;
    cash_fingerprint := md5(concat_ws('|', 'confirm_order_payment', target_order.id::text, financials.total_amount::text));

    insert into public.cash_movements (
      id,
      cash_day_id,
      direction,
      amount,
      description,
      expense_category_id,
      expense_category_code,
      expense_category_name,
      actor_id,
      created_at,
      idempotency_key,
      idempotency_fingerprint
    )
    values (
      new_cash_movement_id,
      current_day.id,
      'income',
      financials.total_amount,
      'Cobro PED-' || lpad(target_order.public_number::text, 6, '0'),
      null,
      null,
      null,
      actor.id,
      event_time,
      cash_key,
      cash_fingerprint
    );
  else
    new_cash_movement_id := null;
  end if;

  insert into public.order_payments (
    id,
    order_id,
    amount,
    cash_movement_id,
    actor_id,
    confirmed_at,
    idempotency_key,
    fingerprint
  )
  values (
    new_payment_id,
    target_order.id,
    financials.total_amount,
    new_cash_movement_id,
    actor.id,
    event_time,
    normalized_key,
    request_fingerprint
  );

  update public.orders
  set current_stage_id = paid_stage.id,
      updated_at = event_time
  where id = target_order.id
  returning * into target_order;

  insert into public.order_stage_events (
    order_id,
    from_stage_id,
    to_stage_id,
    actor_id,
    created_at,
    idempotency_key,
    idempotency_fingerprint
  )
  values (
    target_order.id,
    source_stage.id,
    paid_stage.id,
    actor.id,
    event_time,
    'payment:' || new_payment_id::text,
    request_fingerprint
  )
  returning id into new_stage_event_id;

  insert into public.order_payment_events (
    order_payment_id,
    event_type,
    order_snapshot,
    payment_snapshot,
    stage,
    actor_id,
    occurred_at,
    idempotency_key,
    fingerprint
  )
  values (
    new_payment_id,
    'confirmed',
    jsonb_build_object(
      'id', target_order.id,
      'public_number', target_order.public_number,
      'customer_name', target_order.customer_name,
      'from_stage_id', source_stage.id,
      'to_stage_id', paid_stage.id,
      'updated_at', target_order.updated_at
    ),
    jsonb_build_object(
      'id', new_payment_id,
      'amount', financials.total_amount,
      'cash_movement_id', new_cash_movement_id,
      'confirmed_at', event_time
    ),
    paid_stage.code,
    actor.id,
    event_time,
    normalized_key,
    request_fingerprint
  )
  returning id into new_payment_event_id;

  return query
  select
    target_order.id,
    target_order.public_number,
    source_stage.id,
    paid_stage.id,
    paid_stage.code,
    target_order.updated_at,
    new_payment_id,
    new_cash_movement_id,
    new_payment_event_id,
    event_time,
    financials.total_amount;
end;
$$;

revoke all on function public.confirm_order_payment(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.confirm_order_payment(uuid, timestamptz, text) to authenticated;

drop function public.get_order_timeline(uuid);

create function public.get_order_timeline(p_order_id uuid)
returns table (
  event_id uuid,
  event_type text,
  actor_display_name text,
  occurred_at timestamptz,
  details jsonb,
  comment_body text,
  change_note text,
  from_stage_id uuid,
  to_stage_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid());

  if not found or not actor.is_active or actor.must_change_password then
    raise exception 'No tenés permiso para ver el historial del pedido.';
  end if;

  if p_order_id is null or not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'El pedido seleccionado no existe.';
  end if;

  return query
  select * from (
    select
      stage_event.id,
      'stage_moved'::text,
      profile.display_name,
      stage_event.created_at,
      '{}'::jsonb,
      null::text,
      null::text,
      stage_event.from_stage_id,
      stage_event.to_stage_id
    from public.order_stage_events stage_event
    join public.profiles profile on profile.id = stage_event.actor_id
    where stage_event.order_id = p_order_id
    union all
    select
      change_event.id,
      change_event.action,
      profile.display_name,
      change_event.created_at,
      case
        when actor.role = 'employee'
          and exists (
            select 1
            from jsonb_array_elements(coalesce(change_event.details->'changes', '[]'::jsonb)) item
            where item->>'field' in ('total_amount', 'deposit_amount', 'deposit_paid')
          )
          then jsonb_build_object('version', 1, 'changes', jsonb_build_array(jsonb_build_object('field', 'order_updated')))
        else change_event.details
      end,
      null::text,
      case
        when actor.role = 'employee'
          and exists (
            select 1
            from jsonb_array_elements(coalesce(change_event.details->'changes', '[]'::jsonb)) item
            where item->>'field' in ('total_amount', 'deposit_amount', 'deposit_paid')
          )
          then null
        else change_event.change_note
      end,
      null::uuid,
      null::uuid
    from public.order_change_events change_event
    join public.profiles profile on profile.id = change_event.actor_id
    where change_event.order_id = p_order_id
    union all
    select
      comment.id,
      'commented'::text,
      profile.display_name,
      comment.created_at,
      '{}'::jsonb,
      comment.body,
      null::text,
      null::uuid,
      null::uuid
    from public.order_comments comment
    join public.profiles profile on profile.id = comment.actor_id
    where comment.order_id = p_order_id
    union all
    select
      payment_event.id,
      'payment_confirmed'::text,
      profile.display_name,
      payment_event.occurred_at,
      case
        when actor.role in ('super_admin', 'admin', 'attention') then payment_event.payment_snapshot
        else jsonb_build_object('version', 1, 'payment_confirmed', true)
      end,
      null::text,
      null::text,
      null::uuid,
      null::uuid
    from public.order_payment_events payment_event
    join public.profiles profile on profile.id = payment_event.actor_id
    join public.order_payments payment on payment.id = payment_event.order_payment_id
    where payment.order_id = p_order_id
      and payment_event.event_type = 'confirmed'
  ) as timeline(event_id, event_type, actor_display_name, occurred_at, details, comment_body, change_note, from_stage_id, to_stage_id)
  order by timeline.occurred_at desc, timeline.event_type asc, timeline.event_id asc;
end;
$$;

revoke all on function public.get_order_timeline(uuid) from public, anon;
grant execute on function public.get_order_timeline(uuid) to authenticated;

revoke insert, update, delete on table public.order_payments from authenticated;
revoke insert, update, delete on table public.order_payment_events from authenticated;
