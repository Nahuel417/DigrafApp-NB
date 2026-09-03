alter table public.cash_days drop constraint if exists cash_days_operational_date_key;

create unique index if not exists cash_days_open_operational_date_key
  on public.cash_days (operational_date)
  where closed_at is null;

drop policy if exists "Operational users can read current cash days" on public.cash_days;
create policy "Operational users can read current cash days"
  on public.cash_days for select to authenticated
  using (
    (select public.cash_current_actor_is_operational())
    and operational_date = (now() at time zone 'America/Argentina/Cordoba')::date
    and closed_at is null
  );

drop policy if exists "Operational users can read current cash opening events" on public.cash_opening_events;
create policy "Operational users can read current cash opening events"
  on public.cash_opening_events for select to authenticated
  using (
    (select public.cash_current_actor_is_operational())
    and exists (
      select 1
      from public.cash_days as day
      where day.id = cash_opening_events.cash_day_id
        and day.operational_date = (now() at time zone 'America/Argentina/Cordoba')::date
        and day.closed_at is null
    )
  );

drop policy if exists "Operational users can read current cash movements" on public.cash_movements;
create policy "Operational users can read current cash movements"
  on public.cash_movements for select to authenticated
  using (
    (select public.cash_current_actor_is_operational())
    and exists (
      select 1
      from public.cash_days as day
      where day.id = cash_movements.cash_day_id
        and day.operational_date = (now() at time zone 'America/Argentina/Cordoba')::date
        and day.closed_at is null
    )
  );

drop policy if exists "Operational users can read current cash movement events" on public.cash_movement_events;
create policy "Operational users can read current cash movement events"
  on public.cash_movement_events for select to authenticated
  using (
    (select public.cash_current_actor_is_operational())
    and exists (
      select 1
      from public.cash_days as day
      where day.id = cash_movement_events.cash_day_id
        and day.operational_date = (now() at time zone 'America/Argentina/Cordoba')::date
        and day.closed_at is null
    )
  );

create or replace function public.ensure_current_cash_day()
returns table (cash_day_id uuid, operational_date date, opening_balance numeric(14, 2), opening_updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_date date; prior public.cash_days%rowtype; event_time timestamptz; sequence_no bigint;
begin
  v_date := (now() at time zone 'America/Argentina/Cordoba')::date;
  perform pg_advisory_xact_lock(hashtext('digraf:cash-rollover'));

  for prior in
    select candidate.*
    from public.cash_days candidate
    where candidate.operational_date < v_date
      and candidate.closed_at is null
      and coalesce((
        select event.event_type
        from public.cash_day_lifecycle_events event
        where event.cash_day_id = candidate.id
        order by event.sequence_no desc
        limit 1
      ), '') <> 'reopen'
    order by candidate.operational_date, candidate.id
    for update
  loop
    event_time := clock_timestamp();
    update public.cash_days
    set closed_at = event_time,
        closed_by = null,
        closure_kind = 'rollover',
        closing_balance = prior.opening_balance + coalesce((
          select sum(case
            when not item.voided then case when item.direction = 'income' then item.amount else -item.amount end
            else 0
          end)
          from public.cash_m10_effective_movements(prior.id) item
        ), 0::numeric),
        closure_idempotency_key = null,
        closure_idempotency_fingerprint = null
    where id = prior.id
    returning * into prior;

    select coalesce(max(event.sequence_no), 0) + 1
    into sequence_no
    from public.cash_day_lifecycle_events event
    where event.cash_day_id = prior.id;

    insert into public.cash_day_lifecycle_events (
      cash_day_id, sequence_no, event_type, closure_kind, closing_balance,
      actor_id, created_at, idempotency_key, idempotency_fingerprint
    )
    values (
      prior.id, sequence_no, 'close', 'rollover', prior.closing_balance,
      null, event_time, 'rollover:' || prior.id::text || ':' || v_date::text,
      md5(concat_ws('|', 'rollover', prior.id::text, v_date::text))
    );
  end loop;

  if not exists (
    select 1
    from public.cash_days existing_day
    where existing_day.operational_date = v_date
      and existing_day.closed_at is null
  ) then
    insert into public.cash_days (operational_date) values (v_date);
  end if;

  return query
  select day.id, day.operational_date, day.opening_balance, day.opening_updated_at
  from public.cash_days day
  where day.operational_date = v_date
    and day.closed_at is null;
end; $$;

create or replace function public.get_current_cash_summary()
returns table (cash_day_id uuid, operational_date date, opening_balance numeric(14, 2), opening_updated_at timestamptz, current_balance text, movements jsonb, categories jsonb, closed_at timestamptz, closed_by uuid, closed_by_display_name text, closure_kind text, closing_balance numeric(14, 2))
language plpgsql security definer set search_path = '' as $$
declare day public.cash_days%rowtype; v_date date;
begin
  if not public.cash_current_actor_is_operational() then
    raise exception 'No tenés permiso para consultar la caja.';
  end if;

  v_date := (now() at time zone 'America/Argentina/Cordoba')::date;
  perform public.ensure_current_cash_day();
  select * into day
  from public.cash_days candidate
  where candidate.operational_date = v_date
    and candidate.closed_at is null
  for update;

  return query
  select day.id,
    day.operational_date,
    day.opening_balance,
    day.opening_updated_at,
    (day.opening_balance + coalesce((
      select sum(case when not item.voided then case when item.direction = 'income' then item.amount else -item.amount end else 0 end)
      from public.cash_m10_effective_movements(day.id) item
    ), 0::numeric))::text,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.movement_id,
        'direction', item.direction,
        'amount', item.amount,
        'description', item.description,
        'expense_category_id', item.expense_category_id,
        'expense_category_code', item.expense_category_code,
        'expense_category_name', item.expense_category_name,
        'actor_id', item.actor_id,
        'actor_display_name', coalesce((select profile.display_name from public.profiles profile where profile.id = item.actor_id), 'Sistema'),
        'created_at', item.created_at
      ) order by item.created_at desc, item.movement_id desc)
      from public.cash_m10_effective_movements(day.id) item
      where not item.voided
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', category.id, 'code', category.code, 'name', category.name) order by category.code)
      from public.cash_expense_categories category
      where category.is_active
    ), '[]'::jsonb),
    day.closed_at,
    day.closed_by,
    (select profile.display_name from public.profiles profile where profile.id = day.closed_by),
    day.closure_kind,
    day.closing_balance;
end; $$;

create or replace function public.set_cash_opening(p_amount numeric, p_expected_opening_updated_at timestamptz, p_idempotency_key text)
returns table (cash_day_id uuid, opening_balance numeric(14, 2), opening_updated_at timestamptz, event_id uuid)
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles%rowtype; day public.cash_days%rowtype; existing public.cash_opening_events%rowtype; v_date date; fp text; new_event_id uuid; previous_opening_balance numeric(14, 2);
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para modificar la apertura de caja.';
  end if;
  if p_amount is null or p_amount = 'NaN'::numeric or p_amount < 0 or p_amount <> round(p_amount, 2) or p_expected_opening_updated_at is null or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'La apertura de caja no es válida.';
  end if;

  fp := md5(concat_ws('|', 'set_cash_opening', p_amount::text, p_expected_opening_updated_at::text));
  perform pg_advisory_xact_lock(hashtext('digraf:cash-opening:' || actor.id::text || ':' || p_idempotency_key));
  select * into existing from public.cash_opening_events where actor_id = actor.id and idempotency_key = p_idempotency_key;
  if found then
    if existing.idempotency_fingerprint <> fp then
      raise exception 'La clave de idempotencia ya fue utilizada para otra apertura.';
    end if;
    return query select d.id, d.opening_balance, d.opening_updated_at, existing.id from public.cash_days d where d.id = existing.cash_day_id;
    return;
  end if;

  v_date := (now() at time zone 'America/Argentina/Cordoba')::date;
  perform public.ensure_current_cash_day();
  select * into day
  from public.cash_days candidate
  where candidate.operational_date = v_date
    and candidate.closed_at is null
  for update;
  if day.closed_at is not null then
    raise exception 'La caja está cerrada y no admite modificaciones.';
  end if;
  if day.opening_updated_at <> p_expected_opening_updated_at then
    raise exception 'La apertura cambió en otra sesión. Actualizá la caja e intentá nuevamente.';
  end if;

  previous_opening_balance := day.opening_balance;
  update public.cash_days
  set opening_balance = p_amount, opening_updated_at = now()
  where id = day.id
  returning * into day;
  insert into public.cash_opening_events (cash_day_id, previous_amount, new_amount, actor_id, idempotency_key, idempotency_fingerprint)
  values (day.id, previous_opening_balance, p_amount, actor.id, p_idempotency_key, fp)
  returning id into new_event_id;
  return query select day.id, day.opening_balance, day.opening_updated_at, new_event_id;
end; $$;

create or replace function public.create_cash_movement(p_direction text, p_amount numeric, p_description text, p_expense_category_id uuid, p_idempotency_key text)
returns table (movement_id uuid, cash_day_id uuid, direction text, amount numeric(14, 2), description text, expense_category_id uuid, expense_category_code text, expense_category_name text, actor_id uuid, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles%rowtype; day public.cash_days%rowtype; existing public.cash_movements%rowtype; category public.cash_expense_categories%rowtype; item public.cash_movements%rowtype; v_date date; normalized_description text; fp text;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para crear movimientos de caja.';
  end if;
  normalized_description := nullif(btrim(coalesce(p_description, '')), '');
  if p_direction not in ('income', 'expense') or p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 or p_amount <> round(p_amount, 2) or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'El movimiento de caja no es válido.';
  end if;
  if p_direction = 'income' and (normalized_description is null or char_length(normalized_description) not between 2 and 500) then
    raise exception 'El ingreso debe tener una descripción válida.';
  end if;
  if p_direction = 'income' and p_expense_category_id is not null then
    raise exception 'Un ingreso no puede tener categoría de egreso.';
  end if;
  if p_direction = 'expense' and p_expense_category_id is null then
    raise exception 'El egreso debe tener una categoría activa.';
  end if;

  fp := md5(concat_ws('|', 'create_cash_movement', p_direction, p_amount::text, coalesce(normalized_description, ''), coalesce(p_expense_category_id::text, '')));
  perform pg_advisory_xact_lock(hashtext('digraf:cash-movement:' || actor.id::text || ':' || p_idempotency_key));
  select * into existing from public.cash_movements candidate where candidate.actor_id = actor.id and candidate.idempotency_key = p_idempotency_key;
  if found then
    if existing.idempotency_fingerprint <> fp then
      raise exception 'La clave de idempotencia ya fue utilizada para otro movimiento.';
    end if;
    return query select existing.id, existing.cash_day_id, existing.direction, existing.amount, existing.description, existing.expense_category_id, existing.expense_category_code, existing.expense_category_name, existing.actor_id, existing.created_at;
    return;
  end if;

  v_date := (now() at time zone 'America/Argentina/Cordoba')::date;
  perform public.ensure_current_cash_day();
  select * into day
  from public.cash_days candidate
  where candidate.operational_date = v_date
    and candidate.closed_at is null
  for update;
  if day.closed_at is not null then
    raise exception 'La caja está cerrada y no admite modificaciones.';
  end if;
  if p_direction = 'expense' then
    select * into category from public.cash_expense_categories where id = p_expense_category_id and is_active for key share;
    if not found then raise exception 'La categoría de egreso no está disponible.'; end if;
  end if;
  insert into public.cash_movements (cash_day_id, direction, amount, description, expense_category_id, expense_category_code, expense_category_name, actor_id, idempotency_key, idempotency_fingerprint)
  values (day.id, p_direction, p_amount, normalized_description, case when p_direction = 'expense' then category.id end, case when p_direction = 'expense' then category.code end, case when p_direction = 'expense' then category.name end, actor.id, p_idempotency_key, fp)
  returning * into item;
  return query select item.id, item.cash_day_id, item.direction, item.amount, item.description, item.expense_category_id, item.expense_category_code, item.expense_category_name, item.actor_id, item.created_at;
end; $$;

create or replace function public.confirm_order_payment(
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

  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  if target_order.updated_at <> p_expected_updated_at then
    raise exception 'El pedido cambió en otra sesión. Actualizá el tablero e intentá nuevamente.';
  end if;

  select * into source_stage
  from public.workflow_stages
  where id = target_order.current_stage_id
  for key share;
  if not found or source_stage.code = 'paid' then raise exception 'El pedido ya está pagado.'; end if;

  select * into paid_stage
  from public.workflow_stages
  where code = 'paid' and is_active
  for key share;
  if not found then raise exception 'La etapa Pagado no está disponible.'; end if;

  if exists (
    select 1 from public.order_payments payment
    where payment.order_id = target_order.id and payment.reversed_at is null
  ) then raise exception 'El pedido ya está pagado.'; end if;

  select target_financials.* into financials
  from public.order_financials target_financials
  where target_financials.order_id = target_order.id
  for update;
  if not found then raise exception 'El pedido no tiene importes disponibles.'; end if;

  new_payment_id := gen_random_uuid();
  event_time := clock_timestamp();

  if financials.total_amount > 0 then
    perform public.ensure_current_cash_day();
    select * into current_day
    from public.cash_days
    where operational_date = (now() at time zone 'America/Argentina/Cordoba')::date
      and closed_at is null
    for update;
    if not found then raise exception 'La caja está cerrada y no admite nuevas cobranzas.'; end if;

    new_cash_movement_id := gen_random_uuid();
    cash_key := 'order-payment:' || new_payment_id::text;
    cash_fingerprint := md5(concat_ws('|', 'confirm_order_payment', target_order.id::text, financials.total_amount::text));
    insert into public.cash_movements (
      id, cash_day_id, direction, amount, description, expense_category_id,
      expense_category_code, expense_category_name, actor_id, created_at,
      idempotency_key, idempotency_fingerprint
    )
    values (
      new_cash_movement_id, current_day.id, 'income', financials.total_amount,
      'Cobro PED-' || lpad(target_order.public_number::text, 6, '0'), null, null,
      null, actor.id, event_time, cash_key, cash_fingerprint
    );
  else
    new_cash_movement_id := null;
  end if;

  insert into public.order_payments (id, order_id, amount, cash_movement_id, actor_id, confirmed_at, idempotency_key, fingerprint)
  values (new_payment_id, target_order.id, financials.total_amount, new_cash_movement_id, actor.id, event_time, normalized_key, request_fingerprint);

  update public.orders
  set current_stage_id = paid_stage.id, updated_at = event_time
  where id = target_order.id
  returning * into target_order;

  insert into public.order_stage_events (order_id, from_stage_id, to_stage_id, actor_id, created_at, idempotency_key, idempotency_fingerprint)
  values (target_order.id, source_stage.id, paid_stage.id, actor.id, event_time, 'payment:' || new_payment_id::text, request_fingerprint);

  insert into public.order_payment_events (
    order_payment_id, event_type, order_snapshot, payment_snapshot, stage,
    actor_id, occurred_at, idempotency_key, fingerprint
  )
  values (
    new_payment_id, 'confirmed',
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
    paid_stage.code, actor.id, event_time, normalized_key, request_fingerprint
  )
  returning id into new_payment_event_id;

  return query
  select target_order.id, target_order.public_number, source_stage.id, paid_stage.id,
    paid_stage.code, target_order.updated_at, new_payment_id, new_cash_movement_id,
    new_payment_event_id, event_time, financials.total_amount;
end;
$$;
