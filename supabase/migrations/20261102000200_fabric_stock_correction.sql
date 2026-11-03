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
  actor public.profiles%rowtype;
  item public.stock_items%rowtype;
  movement public.stock_movements%rowtype;
  existing_request public.stock_requests%rowtype;
  request_fingerprint text;
  response jsonb;
  v_item_id uuid;
  v_movement_id uuid;
  movement_date date;
  movement_date_text text;
  v_quantity numeric(14, 1);
  quantity_text text;
  price numeric(14, 2);
  price_text text;
  v_name text;
  reason text;
  active boolean;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para administrar el stock de telas.';
  end if;

  if p_key is null
    or p_data is null
    or jsonb_typeof(p_data) <> 'object'
    or p_action is null
    or p_action not in ('create', 'purchase', 'consumption', 'cancel', 'rename', 'activate') then
    raise exception 'La operación de stock no es válida.';
  end if;

  request_fingerprint := md5(p_action || ':' || p_data::text);

  select * into existing_request
  from public.stock_requests
  where actor_id = actor.id and request_key = p_key;

  if found then
    if existing_request.fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra operación de stock.';
    end if;
    return existing_request.response;
  end if;

  if p_action in ('create', 'purchase', 'consumption') then
    movement_date_text := p_data ->> 'date';
    if movement_date_text is null or movement_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'La fecha de stock debe ser válida y no puede ser futura.';
    end if;
    begin
      movement_date := movement_date_text::date;
    exception when others then
      raise exception 'La fecha de stock debe ser válida y no puede ser futura.';
    end;
    if to_char(movement_date, 'YYYY-MM-DD') <> movement_date_text
      or movement_date > (now() at time zone 'America/Argentina/Cordoba')::date then
      raise exception 'La fecha de stock debe ser válida y no puede ser futura.';
    end if;

    quantity_text := p_data ->> 'quantity';
    if quantity_text is null or quantity_text !~ '^[0-9]{1,12}([.]0|[.]5)?$' then
      raise exception 'La cantidad debe ser un número de rollos enteros o medios.';
    end if;
    v_quantity := quantity_text::numeric;
    if p_action <> 'create' and v_quantity <= 0 then
      raise exception 'La cantidad debe ser mayor que cero.';
    end if;
  end if;

  if p_action = 'create' then
    v_name := btrim(p_data ->> 'name');
    if v_name is null or char_length(v_name) not between 2 and 100 then
      raise exception 'El nombre de la tela debe tener entre 2 y 100 caracteres.';
    end if;
    if exists (select 1 from public.stock_items where lower(btrim(stock_items.name)) = lower(v_name)) then
      raise exception 'Ya existe una tela con ese nombre.';
    end if;

    insert into public.stock_items (name, quantity, created_by, updated_by)
    values (v_name, v_quantity, actor.id, actor.id)
    returning * into item;
    v_item_id := item.id;

    insert into public.stock_movements (item_id, kind, quantity, movement_date, actor_id)
    values (item.id, 'opening', v_quantity, movement_date, actor.id);

    insert into public.stock_item_events (item_id, actor_id, action, details)
    values (item.id, actor.id, 'created', jsonb_build_object('name', v_name, 'opening_quantity', v_quantity, 'movement_date', movement_date));
  else
    if p_data ->> 'itemId' is null or p_data ->> 'itemId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'La tela seleccionada no es válida.';
    end if;
    v_item_id := (p_data ->> 'itemId')::uuid;

    select * into item
    from public.stock_items
    where id = v_item_id
    for update;
    if not found then
      raise exception 'La tela seleccionada no existe.';
    end if;

    if p_action in ('purchase', 'consumption', 'cancel') and not item.is_active then
      raise exception 'La tela está desactivada y no admite movimientos.';
    end if;

    if p_action in ('purchase', 'consumption') then
      if p_action = 'purchase' then
        price_text := p_data ->> 'price';
        if price_text is null or price_text !~ '^[0-9]{1,12}([.,][0-9]{1,2})?$' then
          raise exception 'El precio por rollo debe ser mayor que cero y tener hasta dos decimales.';
        end if;
        price := replace(price_text, ',', '.')::numeric;
        if price <= 0 then
          raise exception 'El precio por rollo debe ser mayor que cero.';
        end if;
      end if;

      if p_action = 'consumption' and item.quantity < v_quantity then
        raise exception 'El stock disponible no alcanza para registrar la salida.';
      end if;

      insert into public.stock_movements (item_id, kind, quantity, movement_date, actor_id)
      values (item.id, p_action, v_quantity, movement_date, actor.id)
      returning * into movement;

      update public.stock_items
      set quantity = case when p_action = 'purchase' then item.quantity + v_quantity else item.quantity - v_quantity end,
          updated_by = actor.id,
          updated_at = now()
      where id = item.id;

      if p_action = 'purchase' then
        insert into public.stock_purchase_prices (item_id, movement_id, amount, actor_id)
        values (item.id, movement.id, price, actor.id);
      end if;
    elsif p_action = 'cancel' then
      if p_data ->> 'movementId' is null or p_data ->> 'movementId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        raise exception 'El movimiento seleccionado no es válido.';
      end if;
      v_movement_id := (p_data ->> 'movementId')::uuid;
      select * into movement
      from public.stock_movements
      where id = v_movement_id and stock_movements.item_id = item.id
      for update;
      if not found then
        raise exception 'El movimiento seleccionado no existe.';
      end if;
      if exists (select 1 from public.stock_movement_cancellations where stock_movement_cancellations.movement_id = movement.id) then
        raise exception 'El movimiento ya fue anulado.';
      end if;

      reason := btrim(p_data ->> 'reason');
      if reason is null or char_length(reason) not between 2 and 500 then
        raise exception 'El motivo de anulación debe tener entre 2 y 500 caracteres.';
      end if;

      if movement.kind in ('opening', 'purchase') and item.quantity < movement.quantity then
        raise exception 'No se puede anular el movimiento porque el saldo quedaría negativo.';
      end if;

      update public.stock_items
      set quantity = case when movement.kind = 'consumption' then item.quantity + movement.quantity else item.quantity - movement.quantity end,
          updated_by = actor.id,
          updated_at = now()
      where id = item.id;

      insert into public.stock_movement_cancellations (item_id, movement_id, reason, actor_id)
      values (item.id, movement.id, reason, actor.id);
    elsif p_action = 'rename' then
      v_name := btrim(p_data ->> 'name');
      if v_name is null or char_length(v_name) not between 2 and 100 then
        raise exception 'El nombre de la tela debe tener entre 2 y 100 caracteres.';
      end if;
      if exists (
        select 1 from public.stock_items
        where id <> item.id and lower(btrim(stock_items.name)) = lower(v_name)
      ) then
        raise exception 'Ya existe una tela con ese nombre.';
      end if;

      insert into public.stock_item_events (item_id, actor_id, action, details)
      values (item.id, actor.id, 'renamed', jsonb_build_object('previous_name', item.name, 'name', v_name));
      update public.stock_items
      set name = v_name,
          updated_by = actor.id,
          updated_at = now()
      where id = item.id;
    elsif p_action = 'activate' then
      if p_data ->> 'active' is null or p_data ->> 'active' not in ('true', 'false') then
        raise exception 'El estado de la tela no es válido.';
      end if;
      active := (p_data ->> 'active')::boolean;
      if not active and item.quantity <> 0 then
        raise exception 'Solo se puede desactivar una tela sin stock.';
      end if;
      if active <> item.is_active then
        insert into public.stock_item_events (item_id, actor_id, action, details)
        values (
          item.id,
          actor.id,
          case when active then 'activated' else 'deactivated' end,
          jsonb_build_object('previous_active', item.is_active, 'is_active', active)
        );
        update public.stock_items
        set is_active = active,
            updated_by = actor.id,
            updated_at = now()
        where id = item.id;
      end if;
    end if;
  end if;

  response := jsonb_build_object('item_id', v_item_id);
  insert into public.stock_requests (actor_id, request_key, action, fingerprint, item_id, response)
  values (actor.id, p_key, p_action, request_fingerprint, v_item_id, response);

  return response;
exception
  when unique_violation then
    if p_action in ('create', 'rename') then
      raise exception 'Ya existe una tela con ese nombre.';
    end if;
    raise;
end;
$$;
