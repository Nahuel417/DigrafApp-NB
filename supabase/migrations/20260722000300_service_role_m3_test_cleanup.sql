grant select, insert, update, delete on table public.workflow_stages to service_role;
grant select, insert, update, delete on table public.catalog_items to service_role;
grant select, insert, update, delete on table public.catalog_item_events to service_role;
grant select, insert, update, delete on table public.orders to service_role;
grant select, insert, update, delete on table public.order_financials to service_role;
grant select, insert, update, delete on table public.order_catalog_items to service_role;
grant select, insert, update, delete on table public.order_stage_events to service_role;
grant usage, select on sequence public.orders_public_number_seq to service_role;
