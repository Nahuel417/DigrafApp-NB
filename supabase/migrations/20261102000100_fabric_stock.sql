create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  quantity numeric(14, 1) not null default 0 check (quantity >= 0 and quantity * 2 = trunc(quantity * 2)),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles (id),
  updated_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index stock_items_normalized_name_key
  on public.stock_items (lower(btrim(name)));

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.stock_items (id),
  kind text not null check (kind in ('opening', 'purchase', 'consumption')),
  quantity numeric(14, 1) not null check (
    quantity >= 0
    and quantity * 2 = trunc(quantity * 2)
    and (kind = 'opening' or quantity > 0)
  ),
  movement_date date not null,
  actor_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (id, item_id)
);

create index stock_movements_item_date_idx
  on public.stock_movements (item_id, movement_date desc, created_at desc, id desc);

create table public.stock_purchase_prices (
  item_id uuid not null,
  movement_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  actor_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (movement_id),
  foreign key (movement_id, item_id) references public.stock_movements (id, item_id)
);

create table public.stock_movement_cancellations (
  item_id uuid not null,
  movement_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 2 and 500),
  actor_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (movement_id),
  foreign key (movement_id, item_id) references public.stock_movements (id, item_id)
);

create table public.stock_item_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.stock_items (id),
  actor_id uuid not null references public.profiles (id),
  action text not null check (action in ('created', 'renamed', 'activated', 'deactivated')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index stock_item_events_item_created_idx
  on public.stock_item_events (item_id, created_at desc, id desc);

create table public.stock_requests (
  actor_id uuid not null references public.profiles (id),
  request_key uuid not null,
  action text not null check (action in ('create', 'purchase', 'consumption', 'cancel', 'rename', 'activate')),
  fingerprint text not null check (char_length(fingerprint) = 32),
  item_id uuid not null references public.stock_items (id),
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  primary key (actor_id, request_key)
);

create index stock_requests_item_created_idx
  on public.stock_requests (item_id, created_at desc);

alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_purchase_prices enable row level security;
alter table public.stock_movement_cancellations enable row level security;
alter table public.stock_item_events enable row level security;
alter table public.stock_requests enable row level security;

revoke all on table public.stock_items from anon, authenticated;
revoke all on table public.stock_movements from anon, authenticated;
revoke all on table public.stock_purchase_prices from anon, authenticated;
revoke all on table public.stock_movement_cancellations from anon, authenticated;
revoke all on table public.stock_item_events from anon, authenticated;
revoke all on table public.stock_requests from anon, authenticated;

grant select on table public.stock_items to authenticated;
grant select on table public.stock_movements to authenticated;
grant select on table public.stock_purchase_prices to authenticated;
grant select on table public.stock_movement_cancellations to authenticated;
grant select on table public.stock_item_events to authenticated;
grant select on table public.stock_requests to authenticated;

grant all on table public.stock_items to service_role;
grant all on table public.stock_movements to service_role;
grant all on table public.stock_purchase_prices to service_role;
grant all on table public.stock_movement_cancellations to service_role;
grant all on table public.stock_item_events to service_role;
grant all on table public.stock_requests to service_role;

create function public.stock_current_active_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select profile.role
  from public.profiles as profile
  where profile.id = (select auth.uid())
    and profile.role = (select public.current_active_role())
    and not profile.must_change_password
$$;

revoke all on function public.stock_current_active_role() from public, anon;
grant execute on function public.stock_current_active_role() to authenticated;

create policy "Operational users can read fabric stock"
on public.stock_items
for select
to authenticated
using ((select public.stock_current_active_role()) is not null);

create policy "Operational users can read fabric stock movements"
on public.stock_movements
for select
to authenticated
using ((select public.stock_current_active_role()) is not null);

create policy "Managers can read fabric purchase prices"
on public.stock_purchase_prices
for select
to authenticated
using ((select public.stock_current_active_role()) in ('super_admin', 'admin'));

create policy "Operational users can read fabric movement cancellations"
on public.stock_movement_cancellations
for select
to authenticated
using ((select public.stock_current_active_role()) is not null);

create policy "Operational users can read fabric stock events"
on public.stock_item_events
for select
to authenticated
using ((select public.stock_current_active_role()) is not null);

create policy "Managers can read fabric stock requests"
on public.stock_requests
for select
to authenticated
using ((select public.stock_current_active_role()) in ('super_admin', 'admin'));

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

revoke all on function public.execute_stock_operation(text, jsonb, uuid) from public, anon;
grant execute on function public.execute_stock_operation(text, jsonb, uuid) to authenticated;
