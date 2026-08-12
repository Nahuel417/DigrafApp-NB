create or replace function public.cash_m10_guard_open_day()
returns trigger language plpgsql security definer set search_path = '' as $$
declare day_id uuid; is_closed boolean;
begin
  if (select auth.uid()) is null then return coalesce(new, old); end if;
  if tg_table_name = 'cash_days' then
    day_id := coalesce(new.id, old.id);
  else
    day_id := coalesce(new.cash_day_id, old.cash_day_id);
  end if;
  select closed_at is not null into is_closed from public.cash_days where id = day_id;
  if is_closed and not (tg_table_name = 'cash_days' and tg_op = 'UPDATE' and current_setting('digraf.m10_reopen', true) = day_id::text) then
    raise exception 'La caja está cerrada y no admite modificaciones.';
  end if;
  return coalesce(new, old);
end; $$;
