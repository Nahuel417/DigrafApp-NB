begin;

alter type public.order_label add value 'ready_for_delivery';
alter type public.order_label add value 'needs_finishing';
alter type public.order_label add value 'needs_cleaning';

commit;
