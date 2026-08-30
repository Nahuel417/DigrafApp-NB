create or replace function public.ensure_current_cash_day()
returns table (
  cash_day_id uuid,
  operational_date date,
  opening_balance numeric(14, 2),
  opening_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operational_date date;
begin
  v_operational_date := (now() at time zone 'America/Argentina/Cordoba')::date;

  insert into public.cash_days (operational_date)
  values (v_operational_date)
  on conflict on constraint cash_days_operational_date_key do nothing;

  return query
  select
    day.id,
    day.operational_date,
    day.opening_balance,
    day.opening_updated_at
  from public.cash_days as day
  where day.operational_date = v_operational_date;
end;
$$;

revoke all on function public.ensure_current_cash_day() from public, anon, authenticated;
grant execute on function public.ensure_current_cash_day() to service_role;
