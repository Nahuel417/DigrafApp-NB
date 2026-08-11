create or replace function public.get_current_cash_summary()
returns table (cash_day_id uuid, operational_date date, opening_balance numeric(14, 2), opening_updated_at timestamptz, current_balance numeric(14, 2), movements jsonb, categories jsonb)
language plpgsql security definer set search_path = ''
as $$
declare current_day public.cash_days%rowtype; current_operational_date date;
begin
  if not public.cash_current_actor_is_operational() then
    raise exception 'No tenés permiso para consultar la caja.';
  end if;
  current_operational_date := (now() at time zone 'America/Argentina/Cordoba')::date; perform pg_advisory_xact_lock(hashtext('digraf:cash-day:' || current_operational_date::text)); perform public.ensure_current_cash_day();
  select * into current_day
  from public.cash_days
  where public.cash_days.operational_date = current_operational_date
  for update;
  return query
  select
    current_day.id,
    current_day.operational_date,
    current_day.opening_balance,
    current_day.opening_updated_at,
    (
      current_day.opening_balance
      + coalesce((
        select sum(case when movement.direction = 'income' then movement.amount else -movement.amount end)
        from public.cash_movements as movement
        where movement.cash_day_id = current_day.id
      ), 0::numeric)
    )::numeric(14, 2),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', movement.id,
          'direction', movement.direction,
          'amount', movement.amount,
          'description', movement.description,
          'expense_category_id', movement.expense_category_id,
          'expense_category_code', movement.expense_category_code,
          'expense_category_name', movement.expense_category_name,
          'actor_id', movement.actor_id,
          'created_at', movement.created_at
        )
        order by movement.created_at, movement.id
      )
      from public.cash_movements as movement
      where movement.cash_day_id = current_day.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', category.id,
          'code', category.code,
          'name', category.name
        )
        order by category.code
      )
      from public.cash_expense_categories as category
      where category.is_active
    ), '[]'::jsonb);
end;
$$;
create or replace function public.set_cash_opening(p_amount numeric, p_expected_opening_updated_at timestamptz, p_idempotency_key text)
returns table (cash_day_id uuid, opening_balance numeric(14, 2), opening_updated_at timestamptz, event_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  actor public.profiles%rowtype; current_day public.cash_days%rowtype; existing_event public.cash_opening_events%rowtype;
  normalized_amount numeric(14, 2); previous_opening_balance numeric(14, 2); request_fingerprint text; current_operational_date date; new_event_id uuid;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para modificar la apertura de caja.';
  end if;

  if p_amount is null or p_amount = 'NaN'::numeric or p_amount < 0 or p_amount <> round(p_amount, 2) or p_expected_opening_updated_at is null or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'La apertura de caja no es válida.';
  end if;

  normalized_amount := p_amount;
  request_fingerprint := md5(concat_ws('|', 'set_cash_opening', normalized_amount::text, p_expected_opening_updated_at::text));
  perform pg_advisory_xact_lock(hashtext('digraf:cash-opening:' || actor.id::text || ':' || p_idempotency_key));

  select * into existing_event
  from public.cash_opening_events
  where cash_opening_events.actor_id = actor.id
    and cash_opening_events.idempotency_key = p_idempotency_key;

  if found then
    if existing_event.idempotency_fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra apertura.';
    end if;

    return query
    select
      day.id,
      day.opening_balance,
      day.opening_updated_at,
      existing_event.id
    from public.cash_days as day
    where day.id = existing_event.cash_day_id;
    return;
  end if;

  current_operational_date := (now() at time zone 'America/Argentina/Cordoba')::date;
  perform public.ensure_current_cash_day();

  select * into current_day
  from public.cash_days
  where public.cash_days.operational_date = current_operational_date
  for update;

  if current_day.opening_updated_at <> p_expected_opening_updated_at then
    raise exception 'La apertura cambió en otra sesión. Actualizá la caja e intentá nuevamente.';
  end if;

  previous_opening_balance := current_day.opening_balance;
  update public.cash_days
  set opening_balance = normalized_amount,
      opening_updated_at = now()
  where public.cash_days.id = current_day.id
  returning * into current_day;

  insert into public.cash_opening_events (cash_day_id, previous_amount, new_amount, actor_id, idempotency_key, idempotency_fingerprint)
  values (current_day.id, previous_opening_balance, normalized_amount, actor.id, p_idempotency_key, request_fingerprint)
  returning id into new_event_id;

  return query
  select current_day.id, current_day.opening_balance, current_day.opening_updated_at, new_event_id;
end;
$$;

create or replace function public.create_cash_movement(p_direction text, p_amount numeric, p_description text, p_expense_category_id uuid, p_idempotency_key text)
returns table (movement_id uuid, cash_day_id uuid, direction text, amount numeric(14, 2), description text, expense_category_id uuid, expense_category_code text, expense_category_name text, actor_id uuid, created_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  actor public.profiles%rowtype; current_day public.cash_days%rowtype; existing_movement public.cash_movements%rowtype; selected_category public.cash_expense_categories%rowtype;
  normalized_amount numeric(14, 2); normalized_description text; request_fingerprint text; current_operational_date date; new_movement public.cash_movements%rowtype;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then
    raise exception 'No tenés permiso para crear movimientos de caja.';
  end if;

  normalized_description := nullif(btrim(coalesce(p_description, '')), '');
  if p_direction is null or p_direction not in ('income', 'expense') or p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 or p_amount <> round(p_amount, 2) or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'El movimiento de caja no es válido.';
  end if;

  if p_direction = 'income' then
    if normalized_description is null or char_length(normalized_description) not between 2 and 500 then
      raise exception 'El ingreso debe tener una descripción válida.';
    end if;
    if p_expense_category_id is not null then
      raise exception 'Un ingreso no puede tener categoría de egreso.';
    end if;
  elsif p_expense_category_id is null then
    raise exception 'El egreso debe tener una categoría activa.';
  end if;

  normalized_amount := p_amount;
  request_fingerprint := md5(concat_ws('|', 'create_cash_movement', p_direction, normalized_amount::text, coalesce(normalized_description, ''), coalesce(p_expense_category_id::text, '')));
  perform pg_advisory_xact_lock(hashtext('digraf:cash-movement:' || actor.id::text || ':' || p_idempotency_key));

  select * into existing_movement
  from public.cash_movements
  where cash_movements.actor_id = actor.id
    and cash_movements.idempotency_key = p_idempotency_key;

  if found then
    if existing_movement.idempotency_fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otro movimiento.';
    end if;

    return query
    select
      existing_movement.id,
      existing_movement.cash_day_id,
      existing_movement.direction,
      existing_movement.amount,
      existing_movement.description,
      existing_movement.expense_category_id,
      existing_movement.expense_category_code,
      existing_movement.expense_category_name,
      existing_movement.actor_id,
      existing_movement.created_at;
    return;
  end if;

  current_operational_date := (now() at time zone 'America/Argentina/Cordoba')::date;
  perform public.ensure_current_cash_day();

  select * into current_day
  from public.cash_days
  where public.cash_days.operational_date = current_operational_date
  for update;

  if p_direction = 'expense' then
    select * into selected_category
    from public.cash_expense_categories
    where id = p_expense_category_id
      and is_active
    for key share;

    if not found then
      raise exception 'La categoría de egreso no está disponible.';
    end if;
  end if;

  insert into public.cash_movements (cash_day_id, direction, amount, description, expense_category_id, expense_category_code, expense_category_name, actor_id, idempotency_key, idempotency_fingerprint)
  values (current_day.id, p_direction, normalized_amount, normalized_description, case when p_direction = 'expense' then selected_category.id end, case when p_direction = 'expense' then selected_category.code end, case when p_direction = 'expense' then selected_category.name end, actor.id, p_idempotency_key, request_fingerprint)
  returning * into new_movement;

  return query
  select
    new_movement.id,
    new_movement.cash_day_id,
    new_movement.direction,
    new_movement.amount,
    new_movement.description,
    new_movement.expense_category_id,
    new_movement.expense_category_code,
    new_movement.expense_category_name,
    new_movement.actor_id,
    new_movement.created_at;
end;
$$;

revoke all on function public.get_current_cash_summary() from public, anon, authenticated;
revoke all on function public.set_cash_opening(numeric, timestamptz, text) from public, anon, authenticated;
revoke all on function public.create_cash_movement(text, numeric, text, uuid, text) from public, anon, authenticated;
grant execute on function public.get_current_cash_summary() to authenticated;
grant execute on function public.set_cash_opening(numeric, timestamptz, text) to authenticated;
grant execute on function public.create_cash_movement(text, numeric, text, uuid, text) to authenticated;

revoke update, delete on table public.cash_movements from authenticated;
