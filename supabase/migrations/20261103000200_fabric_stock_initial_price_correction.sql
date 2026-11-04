create or replace function public.execute_stock_operation(
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
  v_response jsonb;
  v_price_text text;
  v_price numeric(14, 2);
  v_item_id uuid;
  v_opening_movement public.stock_movements%rowtype;
begin
  if p_action = 'create' then
    v_price_text := p_data ->> 'price';
    if v_price_text is null or v_price_text !~ '^[0-9]{1,12}([.,][0-9]{1,2})?$' then
      raise exception 'El precio por rollo debe ser mayor que cero y tener hasta dos decimales.';
    end if;
    v_price := replace(v_price_text, ',', '.')::numeric;
    if v_price <= 0 then
      raise exception 'El precio por rollo debe ser mayor que cero.';
    end if;
  end if;

  v_response := public.execute_stock_operation_without_opening_price(p_action, p_data, p_key);

  if p_action = 'create' then
    v_item_id := (v_response ->> 'item_id')::uuid;
    select * into strict v_opening_movement
    from public.stock_movements as movement
    where movement.item_id = v_item_id
      and movement.kind = 'opening'
    order by movement.created_at desc, movement.id desc
    limit 1;

    if not exists (
      select 1 from public.stock_purchase_prices as purchase_price
      where purchase_price.movement_id = v_opening_movement.id
    ) then
      insert into public.stock_purchase_prices (item_id, movement_id, amount, actor_id)
      values (v_opening_movement.item_id, v_opening_movement.id, v_price, v_opening_movement.actor_id);
    end if;
  end if;

  return v_response;
end;
$$;

revoke all on function public.execute_stock_operation(text, jsonb, uuid) from public, anon;
grant execute on function public.execute_stock_operation(text, jsonb, uuid) to authenticated;
