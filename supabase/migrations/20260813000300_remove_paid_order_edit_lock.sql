drop trigger if exists enforce_paid_order_edit_lock_on_orders on public.orders;
drop trigger if exists enforce_paid_order_edit_lock_on_design_images on public.order_design_images;
drop function if exists public.enforce_paid_order_edit_lock();
drop function if exists public.assert_paid_order_editable(uuid, uuid);
