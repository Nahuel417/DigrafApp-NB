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
begin
  if tg_table_name = 'orders' then
    target_order_id := coalesce(new.id, old.id);
    if tg_op = 'UPDATE' and old.lifecycle_state = 'cancelled' and new.lifecycle_state = 'active' then
      return new;
    end if;
  elsif tg_table_name in ('order_financials', 'order_catalog_items', 'order_stage_events', 'order_change_events', 'order_comments', 'order_design_images', 'order_design_image_events') then
    target_order_id := coalesce(new.order_id, old.order_id);
  elsif tg_table_name = 'order_payments' then
    target_order_id := coalesce(new.order_id, old.order_id);
  elsif tg_table_name = 'order_payment_events' then
    select payment.order_id into target_order_id
    from public.order_payments payment
    where payment.id = coalesce(new.order_payment_id, old.order_payment_id);
  end if;

  if target_order_id is not null and exists (
    select 1 from public.orders target_order where target_order.id = target_order_id and target_order.lifecycle_state = 'cancelled'
  ) then
    raise exception 'El pedido está anulado y se encuentra congelado.';
  end if;

  return coalesce(new, old);
end;
$$;

commit;
