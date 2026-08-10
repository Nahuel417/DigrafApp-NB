drop function public.get_current_cash_summary();

create function public.get_current_cash_summary()
returns table (cash_day_id uuid, operational_date date, opening_balance numeric(14, 2), opening_updated_at timestamptz, current_balance text, movements jsonb, categories jsonb)
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
    )::text,
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

revoke all on function public.get_current_cash_summary() from public, anon, authenticated;
grant execute on function public.get_current_cash_summary() to authenticated;
