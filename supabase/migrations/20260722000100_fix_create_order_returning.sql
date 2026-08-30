do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.create_order(text, integer, public.order_type, date, date, text, text, text, boolean, text, text, text, text, text, text, uuid[], text)'::regprocedure
  ) into definition;

  if position('returning id, public_number into new_order_id, new_public_number;' in definition) > 0 then
    execute replace(
      definition,
      'returning id, public_number into new_order_id, new_public_number;',
      'returning orders.id, orders.public_number into new_order_id, new_public_number;'
    );
  elsif position('returning orders.id, orders.public_number into new_order_id, new_public_number;' in definition) = 0 then
    raise exception 'La definición esperada de create_order no está instalada.';
  end if;
end;
$$;
