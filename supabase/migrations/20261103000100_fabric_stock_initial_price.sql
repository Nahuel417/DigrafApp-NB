alter function public.execute_stock_operation(text, jsonb, uuid)
  rename to execute_stock_operation_without_opening_price;

revoke all on function public.execute_stock_operation_without_opening_price(text, jsonb, uuid)
  from public, anon, authenticated;

create function public.execute_stock_operation(
  p_action text,
  p_data jsonb,
  p_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  response jsonb;
  price_text text;
  price numeric(14, 2);
  item_id uuid;
  opening_movement public.stock_movements%rowtype;
begin
  if p_action = 'create' then
    price_text := p_data ->> 'price';
    if price_text is null or price_text !~ '^[0-9]{1,12}([.,][0-9]{1,2})?$' then
      raise exception 'El precio por rollo debe ser mayor que cero y tener hasta dos decimales.';
    end if;
    price := replace(price_text, ',', '.')::numeric;
    if price <= 0 then
      raise exception 'El precio por rollo debe ser mayor que cero.';
    end if;
  end if;

  response := public.execute_stock_operation_without_opening_price(p_action, p_data, p_key);

  if p_action = 'create' then
    item_id := (response ->> 'item_id')::uuid;
    select * into strict opening_movement
    from public.stock_movements
    where stock_movements.item_id = item_id
      and stock_movements.kind = 'opening'
    order by stock_movements.created_at desc, stock_movements.id desc
    limit 1;

    if not exists (
      select 1 from public.stock_purchase_prices
      where stock_purchase_prices.movement_id = opening_movement.id
    ) then
      insert into public.stock_purchase_prices (item_id, movement_id, amount, actor_id)
      values (opening_movement.item_id, opening_movement.id, price, opening_movement.actor_id);
    end if;
  end if;

  return response;
end;
$$;

revoke all on function public.execute_stock_operation(text, jsonb, uuid) from public, anon;
grant execute on function public.execute_stock_operation(text, jsonb, uuid) to authenticated;
