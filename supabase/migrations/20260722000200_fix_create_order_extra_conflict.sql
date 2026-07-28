do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.create_order(text, integer, public.order_type, date, date, text, text, text, boolean, text, text, text, text, text, text, uuid[], text)'::regprocedure
  ) into definition;

  if position('on conflict (order_id, selection_key, catalog_item_id) do nothing;' in definition) > 0 then
    execute replace(
      definition,
      'on conflict (order_id, selection_key, catalog_item_id) do nothing;',
      'on conflict on constraint order_catalog_items_order_id_selection_key_catalog_item_id_key do nothing;'
    );
  elsif position('on conflict on constraint order_catalog_items_order_id_selection_key_catalog_item_id_key do nothing;' in definition) = 0 then
    raise exception 'La definición esperada de create_order no está instalada.';
  end if;
end;
$$;
