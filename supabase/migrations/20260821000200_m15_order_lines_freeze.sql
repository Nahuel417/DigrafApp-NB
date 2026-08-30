begin;

set local search_path = '';

create or replace function public.m15_reject_cancelled_order_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid;
  old_order_id uuid;
  new_order_id uuid;
begin
  if tg_table_name = 'orders' then
    target_order_id := coalesce(new.id, old.id);
    if tg_op = 'UPDATE' and old.lifecycle_state = 'cancelled' and new.lifecycle_state = 'active' then
      return new;
    end if;
  elsif tg_table_name in ('order_financials', 'order_catalog_items', 'order_stage_events', 'order_change_events', 'order_comments', 'order_design_images', 'order_design_image_events', 'order_lines') then
    if tg_table_name = 'order_lines' then
      old_order_id := old.order_id;
      new_order_id := new.order_id;
    else
      target_order_id := coalesce(new.order_id, old.order_id);
    end if;
  elsif tg_table_name = 'order_line_shields' then
    select line.order_id into old_order_id
    from public.order_lines line
    where line.id = old.order_line_id;
    select line.order_id into new_order_id
    from public.order_lines line
    where line.id = new.order_line_id;
  elsif tg_table_name = 'order_payments' then
    target_order_id := coalesce(new.order_id, old.order_id);
  elsif tg_table_name = 'order_payment_events' then
    select payment.order_id into target_order_id
    from public.order_payments payment
    where payment.id = coalesce(new.order_payment_id, old.order_payment_id);
  end if;

  if target_order_id is not null and exists (
    select 1 from public.orders target_order where target_order.id = target_order_id and target_order.lifecycle_state = 'cancelled'
  ) or exists (
    select 1 from public.orders target_order
    where target_order.id in (old_order_id, new_order_id) and target_order.lifecycle_state = 'cancelled'
  ) then
    raise exception 'El pedido está anulado y se encuentra congelado.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists order_lines_reject_cancelled_mutation on public.order_lines;
create trigger order_lines_reject_cancelled_mutation
before insert or update or delete on public.order_lines
for each row execute function public.m15_reject_cancelled_order_mutation();

drop trigger if exists order_line_shields_reject_cancelled_mutation on public.order_line_shields;
create trigger order_line_shields_reject_cancelled_mutation
before insert or update or delete on public.order_line_shields
for each row execute function public.m15_reject_cancelled_order_mutation();

drop policy "Operational users read order lines" on public.order_lines;
create policy "Operational users read order lines"
on public.order_lines
for select
to authenticated
using (
  (select public.current_active_role()) is not null
  and (
    (select public.current_active_role()) in ('super_admin', 'admin')
    or exists (select 1 from public.orders target_order where target_order.id = order_lines.order_id and target_order.lifecycle_state = 'active')
  )
);

drop policy "Operational users read line shields" on public.order_line_shields;
create policy "Operational users read line shields"
on public.order_line_shields
for select
to authenticated
using (
  (select public.current_active_role()) is not null
  and (
    (select public.current_active_role()) in ('super_admin', 'admin')
    or exists (
      select 1
      from public.order_lines line
      join public.orders target_order on target_order.id = line.order_id
      where line.id = order_line_shields.order_line_id
        and target_order.lifecycle_state = 'active'
    )
  )
);

commit;
