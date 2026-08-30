drop policy "Operational users can read current cash days" on public.cash_days;
drop policy "Operational users can read cash opening events" on public.cash_opening_events;
drop policy "Operational users can read cash movements" on public.cash_movements;

create policy "Operational users can read current cash days" on public.cash_days
for select to authenticated using (
  (select public.cash_current_actor_is_operational())
  and operational_date = (now() at time zone 'America/Argentina/Cordoba')::date
);

create policy "Operational users can read current cash opening events" on public.cash_opening_events
for select to authenticated using (
  (select public.cash_current_actor_is_operational())
  and exists (select 1 from public.cash_days as day
    where day.id = cash_opening_events.cash_day_id
      and day.operational_date = (now() at time zone 'America/Argentina/Cordoba')::date)
);

create policy "Operational users can read current cash movements" on public.cash_movements
for select to authenticated using (
  (select public.cash_current_actor_is_operational())
  and exists (select 1 from public.cash_days as day
    where day.id = cash_movements.cash_day_id
      and day.operational_date = (now() at time zone 'America/Argentina/Cordoba')::date)
);
