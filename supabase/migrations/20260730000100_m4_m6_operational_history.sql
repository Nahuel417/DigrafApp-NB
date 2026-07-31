alter table public.order_change_events
  add column change_note text check (change_note is null or char_length(btrim(change_note)) between 1 and 300);

revoke select on table public.order_change_events from authenticated;

drop function public.update_order_description(uuid, text, timestamptz, text);
drop function public.update_order(uuid, text, integer, public.order_type, date, date, text, numeric, numeric, boolean, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], timestamptz, text);

create function public.update_order_description(
  p_order_id uuid,
  p_description text,
  p_change_note text,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns table (order_id uuid, updated_at timestamptz, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  existing_event public.order_change_events%rowtype;
  normalized_description text;
  normalized_change_note text;
  request_fingerprint text;
  new_event_id uuid;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password
    or actor.role not in ('super_admin', 'admin', 'attention', 'employee') then
    raise exception 'No tenés permiso para editar la descripción del pedido.';
  end if;

  if p_order_id is null or p_expected_updated_at is null
    or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'La solicitud de edición no es válida.';
  end if;

  normalized_description := nullif(btrim(coalesce(p_description, '')), '');
  normalized_change_note := nullif(btrim(coalesce(p_change_note, '')), '');
  if normalized_description is not null and char_length(normalized_description) > 5000 then
    raise exception 'La descripción no puede superar los 5000 caracteres.';
  end if;
  if normalized_change_note is not null and char_length(normalized_change_note) > 300 then
    raise exception 'El comentario del cambio no puede superar los 300 caracteres.';
  end if;

  request_fingerprint := md5(concat_ws('|', p_order_id::text, coalesce(normalized_description, ''), coalesce(normalized_change_note, ''), p_expected_updated_at::text));
  select * into existing_event from public.order_change_events
  where actor_id = actor.id and idempotency_key = p_idempotency_key;
  if found then
    if existing_event.idempotency_fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra edición.';
    end if;
    return query select existing_event.order_id, existing_event.order_updated_at, existing_event.id;
    return;
  end if;

  select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  if target_order.updated_at <> p_expected_updated_at then
    raise exception 'El pedido cambió en otra sesión. Actualizalo e intentá nuevamente.';
  end if;
  if target_order.description is not distinct from normalized_description then
    raise exception 'No hay cambios para guardar';
  end if;

  update public.orders set description = normalized_description, updated_at = now()
  where id = target_order.id returning * into target_order;
  insert into public.order_change_events (order_id, actor_id, action, details, change_note, order_updated_at, idempotency_key, idempotency_fingerprint)
  values (
    target_order.id, actor.id, 'order_updated',
    jsonb_build_object('version', 1, 'changes', jsonb_build_array(jsonb_build_object('field', 'description'))),
    normalized_change_note, target_order.updated_at, p_idempotency_key, request_fingerprint
  ) returning id into new_event_id;
  return query select target_order.id, target_order.updated_at, new_event_id;
end;
$$;

create function public.update_order(
  p_order_id uuid,
  p_customer_name text,
  p_quantity integer,
  p_order_type public.order_type,
  p_order_date date,
  p_promised_delivery_date date,
  p_description text,
  p_total_amount numeric,
  p_deposit_amount numeric,
  p_deposit_paid boolean,
  p_garment_upper_id uuid,
  p_garment_lower_id uuid,
  p_neckline_id uuid,
  p_upper_pattern_id uuid,
  p_lower_pattern_id uuid,
  p_fabric_id uuid,
  p_extra_ids uuid[],
  p_change_note text,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns table (order_id uuid, updated_at timestamptz, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  target_financials public.order_financials%rowtype;
  existing_event public.order_change_events%rowtype;
  selected public.catalog_items%rowtype;
  normalized_customer_name text;
  normalized_description text;
  normalized_change_note text;
  request_fingerprint text;
  event_details jsonb := jsonb_build_object('version', 1, 'changes', '[]'::jsonb);
  new_event_id uuid;
  new_extra_id uuid;
  preserved_garment_upper boolean;
  preserved_garment_lower boolean;
  preserved_neckline boolean;
  preserved_upper_pattern boolean;
  preserved_lower_pattern boolean;
  preserved_fabric boolean;
  current_garment_upper_id uuid;
  current_garment_lower_id uuid;
  current_neckline_id uuid;
  current_upper_pattern_id uuid;
  current_lower_pattern_id uuid;
  current_fabric_id uuid;
  current_extra_ids uuid[];
  normalized_extra_ids uuid[];
  specifications_changed boolean;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password
    or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para editar datos sensibles del pedido.';
  end if;
  if p_order_id is null or p_order_type is null or p_order_date is null or p_promised_delivery_date is null or p_expected_updated_at is null
    or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'La solicitud de edición no es válida.';
  end if;

  normalized_customer_name := btrim(coalesce(p_customer_name, ''));
  normalized_description := nullif(btrim(coalesce(p_description, '')), '');
  normalized_change_note := nullif(btrim(coalesce(p_change_note, '')), '');
  if char_length(normalized_customer_name) not between 2 and 200 then raise exception 'El cliente o equipo debe tener entre 2 y 200 caracteres.'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
  if p_promised_delivery_date < p_order_date then raise exception 'La fecha prometida no puede ser anterior a la fecha del pedido.'; end if;
  if normalized_description is not null and char_length(normalized_description) > 5000 then raise exception 'La descripción no puede superar los 5000 caracteres.'; end if;
  if normalized_change_note is not null and char_length(normalized_change_note) > 300 then raise exception 'El comentario del cambio no puede superar los 300 caracteres.'; end if;
  if p_total_amount is null or p_total_amount < 0 then raise exception 'El total debe ser mayor o igual a cero.'; end if;
  if p_deposit_amount is null or p_deposit_amount < 0 then raise exception 'La seña debe ser mayor o igual a cero.'; end if;
  if p_deposit_amount > p_total_amount then raise exception 'La seña no puede superar el total.'; end if;
  if p_total_amount <> round(p_total_amount, 2) or p_deposit_amount <> round(p_deposit_amount, 2) then raise exception 'Los importes deben tener como máximo dos decimales.'; end if;
  if p_deposit_paid is null then raise exception 'Indicá si la seña fue abonada.'; end if;

  request_fingerprint := md5(concat_ws('|', p_order_id::text, normalized_customer_name, p_quantity::text, p_order_type::text, p_order_date::text, p_promised_delivery_date::text, coalesce(normalized_description, ''), p_total_amount::text, p_deposit_amount::text, p_deposit_paid::text, coalesce(p_garment_upper_id::text, ''), coalesce(p_garment_lower_id::text, ''), coalesce(p_neckline_id::text, ''), coalesce(p_upper_pattern_id::text, ''), coalesce(p_lower_pattern_id::text, ''), coalesce(p_fabric_id::text, ''), coalesce((select string_agg(extra_value::text, ',' order by extra_value) from unnest(coalesce(p_extra_ids, array[]::uuid[])) as extra_values(extra_value)), ''), coalesce(normalized_change_note, ''), p_expected_updated_at::text));
  select * into existing_event from public.order_change_events where actor_id = actor.id and idempotency_key = p_idempotency_key;
  if found then
    if existing_event.idempotency_fingerprint <> request_fingerprint then raise exception 'La clave de idempotencia ya fue utilizada para otra edición.'; end if;
    return query select existing_event.order_id, existing_event.order_updated_at, existing_event.id;
    return;
  end if;

  select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  if target_order.updated_at <> p_expected_updated_at then raise exception 'El pedido cambió en otra sesión. Actualizalo e intentá nuevamente.'; end if;
  select * into target_financials from public.order_financials financials where financials.order_id = target_order.id for update;
  if not found then raise exception 'Los importes del pedido no están disponibles.'; end if;

  select item.catalog_item_id into current_garment_upper_id from public.order_catalog_items item where item.order_id = target_order.id and item.selection_key = 'garment_upper' and item.catalog_item_id is not null;
  select item.catalog_item_id into current_garment_lower_id from public.order_catalog_items item where item.order_id = target_order.id and item.selection_key = 'garment_lower' and item.catalog_item_id is not null;
  select item.catalog_item_id into current_neckline_id from public.order_catalog_items item where item.order_id = target_order.id and item.selection_key = 'neckline' and item.catalog_item_id is not null;
  select item.catalog_item_id into current_upper_pattern_id from public.order_catalog_items item where item.order_id = target_order.id and item.selection_key = 'upper_pattern' and item.catalog_item_id is not null;
  select item.catalog_item_id into current_lower_pattern_id from public.order_catalog_items item where item.order_id = target_order.id and item.selection_key = 'lower_pattern' and item.catalog_item_id is not null;
  select item.catalog_item_id into current_fabric_id from public.order_catalog_items item where item.order_id = target_order.id and item.selection_key = 'fabric' and item.catalog_item_id is not null;
  select coalesce(array_agg(item.catalog_item_id order by item.catalog_item_id), array[]::uuid[]) into current_extra_ids from public.order_catalog_items item where item.order_id = target_order.id and item.selection_key = 'extra' and item.catalog_item_id is not null;
  select coalesce(array_agg(distinct extra_value order by extra_value), array[]::uuid[]) into normalized_extra_ids from unnest(coalesce(p_extra_ids, array[]::uuid[])) as extra_values(extra_value);

  select exists (select 1 from public.order_catalog_items item where item.order_id = target_order.id and item.selection_key = 'garment_upper' and item.catalog_item_id is null) into preserved_garment_upper;
  select exists (select 1 from public.order_catalog_items item where item.order_id = target_order.id and item.selection_key = 'garment_lower' and item.catalog_item_id is null) into preserved_garment_lower;
  select exists (select 1 from public.order_catalog_items item where item.order_id = target_order.id and item.selection_key = 'neckline' and item.catalog_item_id is null) into preserved_neckline;
  select exists (select 1 from public.order_catalog_items item where item.order_id = target_order.id and item.selection_key = 'upper_pattern' and item.catalog_item_id is null) into preserved_upper_pattern;
  select exists (select 1 from public.order_catalog_items item where item.order_id = target_order.id and item.selection_key = 'lower_pattern' and item.catalog_item_id is null) into preserved_lower_pattern;
  select exists (select 1 from public.order_catalog_items item where item.order_id = target_order.id and item.selection_key = 'fabric' and item.catalog_item_id is null) into preserved_fabric;

  if p_order_type = 'set' then
    if not (p_garment_upper_id is not null or preserved_garment_upper) or not (p_garment_lower_id is not null or preserved_garment_lower) or not (p_neckline_id is not null or preserved_neckline) or not (p_upper_pattern_id is not null or preserved_upper_pattern) or not (p_lower_pattern_id is not null or preserved_lower_pattern) then raise exception 'Un conjunto requiere prendas, cuello y ambos moldes.'; end if;
  elsif (p_garment_upper_id is not null or preserved_garment_upper) = (p_garment_lower_id is not null or preserved_garment_lower) then
    raise exception 'Una prenda individual debe ser superior o inferior.';
  elsif (p_garment_upper_id is not null or preserved_garment_upper) and (not (p_neckline_id is not null or preserved_neckline) or not (p_upper_pattern_id is not null or preserved_upper_pattern) or p_lower_pattern_id is not null) then
    raise exception 'La prenda superior requiere cuello y molde superior.';
  elsif (p_garment_lower_id is not null or preserved_garment_lower) and (p_neckline_id is not null or not (p_lower_pattern_id is not null or preserved_lower_pattern) or p_upper_pattern_id is not null) then
    raise exception 'La prenda inferior requiere molde inferior y no lleva cuello.';
  end if;
  if not (p_fabric_id is not null or preserved_fabric) then raise exception 'Seleccioná una tela.'; end if;

  if p_garment_upper_id is not null then select * into selected from public.catalog_items where id = p_garment_upper_id and is_active; if not found or selected.kind <> 'garment' or selected.garment_layer <> 'upper' then raise exception 'Seleccioná una prenda superior activa.'; end if; end if;
  if p_garment_lower_id is not null then select * into selected from public.catalog_items where id = p_garment_lower_id and is_active; if not found or selected.kind <> 'garment' or selected.garment_layer <> 'lower' then raise exception 'Seleccioná una prenda inferior activa.'; end if; end if;
  if p_neckline_id is not null then select * into selected from public.catalog_items where id = p_neckline_id and is_active; if not found or selected.kind <> 'neckline' then raise exception 'Seleccioná un cuello activo.'; end if; end if;
  if p_upper_pattern_id is not null then select * into selected from public.catalog_items where id = p_upper_pattern_id and is_active; if not found or selected.kind <> 'upper_pattern' then raise exception 'Seleccioná un molde superior activo.'; end if; end if;
  if p_lower_pattern_id is not null then select * into selected from public.catalog_items where id = p_lower_pattern_id and is_active; if not found or selected.kind <> 'lower_pattern' then raise exception 'Seleccioná un molde inferior activo.'; end if; end if;
  if p_fabric_id is not null then select * into selected from public.catalog_items where id = p_fabric_id and is_active; if not found or selected.kind <> 'fabric' then raise exception 'Seleccioná una tela activa.'; end if; end if;
  for new_extra_id in select extra_value from unnest(normalized_extra_ids) as extra_values(extra_value) loop select * into selected from public.catalog_items where id = new_extra_id and is_active; if not found or selected.kind <> 'extra' then raise exception 'Uno de los extras seleccionados no está disponible.'; end if; end loop;

  specifications_changed := not ((p_garment_upper_id is not distinct from current_garment_upper_id) and (p_garment_lower_id is not distinct from current_garment_lower_id) and (p_neckline_id is not distinct from current_neckline_id) and (p_upper_pattern_id is not distinct from current_upper_pattern_id) and (p_lower_pattern_id is not distinct from current_lower_pattern_id) and (p_fabric_id is not distinct from current_fabric_id) and normalized_extra_ids = current_extra_ids);
  if target_order.customer_name is not distinct from normalized_customer_name and target_order.quantity is not distinct from p_quantity and target_order.order_type is not distinct from p_order_type and target_order.order_date is not distinct from p_order_date and target_order.promised_delivery_date is not distinct from p_promised_delivery_date and target_order.description is not distinct from normalized_description and target_financials.total_amount is not distinct from p_total_amount and target_financials.deposit_amount is not distinct from p_deposit_amount and target_financials.deposit_paid is not distinct from p_deposit_paid and not specifications_changed then
    raise exception 'No hay cambios para guardar';
  end if;

  if target_order.customer_name is distinct from normalized_customer_name then event_details := jsonb_set(event_details, '{changes}', event_details->'changes' || jsonb_build_array(jsonb_build_object('field', 'customer_name', 'previous', target_order.customer_name, 'next', normalized_customer_name))); end if;
  if target_order.quantity is distinct from p_quantity then event_details := jsonb_set(event_details, '{changes}', event_details->'changes' || jsonb_build_array(jsonb_build_object('field', 'quantity', 'previous', target_order.quantity, 'next', p_quantity))); end if;
  if target_order.order_type is distinct from p_order_type then event_details := jsonb_set(event_details, '{changes}', event_details->'changes' || jsonb_build_array(jsonb_build_object('field', 'order_type', 'previous', target_order.order_type, 'next', p_order_type))); end if;
  if target_order.order_date is distinct from p_order_date then event_details := jsonb_set(event_details, '{changes}', event_details->'changes' || jsonb_build_array(jsonb_build_object('field', 'order_date', 'previous', target_order.order_date, 'next', p_order_date))); end if;
  if target_order.promised_delivery_date is distinct from p_promised_delivery_date then event_details := jsonb_set(event_details, '{changes}', event_details->'changes' || jsonb_build_array(jsonb_build_object('field', 'promised_delivery_date', 'previous', target_order.promised_delivery_date, 'next', p_promised_delivery_date))); end if;
  if target_order.description is distinct from normalized_description then event_details := jsonb_set(event_details, '{changes}', event_details->'changes' || jsonb_build_array(jsonb_build_object('field', 'description'))); end if;
  if target_financials.total_amount is distinct from p_total_amount then event_details := jsonb_set(event_details, '{changes}', event_details->'changes' || jsonb_build_array(jsonb_build_object('field', 'total_amount', 'previous', target_financials.total_amount, 'next', p_total_amount))); end if;
  if target_financials.deposit_amount is distinct from p_deposit_amount then event_details := jsonb_set(event_details, '{changes}', event_details->'changes' || jsonb_build_array(jsonb_build_object('field', 'deposit_amount', 'previous', target_financials.deposit_amount, 'next', p_deposit_amount))); end if;
  if target_financials.deposit_paid is distinct from p_deposit_paid then event_details := jsonb_set(event_details, '{changes}', event_details->'changes' || jsonb_build_array(jsonb_build_object('field', 'deposit_paid', 'previous', target_financials.deposit_paid, 'next', p_deposit_paid))); end if;
  if specifications_changed then event_details := jsonb_set(event_details, '{changes}', event_details->'changes' || jsonb_build_array(jsonb_build_object('field', 'specifications'))); end if;

  update public.orders set customer_name = normalized_customer_name, quantity = p_quantity, order_type = p_order_type, order_date = p_order_date, promised_delivery_date = p_promised_delivery_date, description = normalized_description, updated_at = now() where id = target_order.id returning * into target_order;
  update public.order_financials financials set total_amount = p_total_amount, deposit_amount = p_deposit_amount, deposit_paid = p_deposit_paid, updated_at = now() where financials.order_id = target_order.id;
  delete from public.order_catalog_items item where item.order_id = target_order.id and item.catalog_item_id is not null;
  if p_garment_upper_id is not null then select * into selected from public.catalog_items where id = p_garment_upper_id; insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name) values (target_order.id, selected.id, 'garment_upper', selected.kind, selected.garment_layer, selected.name); end if;
  if p_garment_lower_id is not null then select * into selected from public.catalog_items where id = p_garment_lower_id; insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name) values (target_order.id, selected.id, 'garment_lower', selected.kind, selected.garment_layer, selected.name); end if;
  if p_neckline_id is not null then select * into selected from public.catalog_items where id = p_neckline_id; insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name) values (target_order.id, selected.id, 'neckline', selected.kind, selected.garment_layer, selected.name); end if;
  if p_upper_pattern_id is not null then select * into selected from public.catalog_items where id = p_upper_pattern_id; insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name) values (target_order.id, selected.id, 'upper_pattern', selected.kind, selected.garment_layer, selected.name); end if;
  if p_lower_pattern_id is not null then select * into selected from public.catalog_items where id = p_lower_pattern_id; insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name) values (target_order.id, selected.id, 'lower_pattern', selected.kind, selected.garment_layer, selected.name); end if;
  if p_fabric_id is not null then select * into selected from public.catalog_items where id = p_fabric_id; insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name) values (target_order.id, selected.id, 'fabric', selected.kind, selected.garment_layer, selected.name); end if;
  for new_extra_id in select extra_value from unnest(normalized_extra_ids) as extra_values(extra_value) loop select * into selected from public.catalog_items where id = new_extra_id; insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name) values (target_order.id, selected.id, 'extra', selected.kind, selected.garment_layer, selected.name); end loop;

  insert into public.order_change_events (order_id, actor_id, action, details, change_note, order_updated_at, idempotency_key, idempotency_fingerprint)
  values (target_order.id, actor.id, 'order_updated', event_details, normalized_change_note, target_order.updated_at, p_idempotency_key, request_fingerprint) returning id into new_event_id;
  return query select target_order.id, target_order.updated_at, new_event_id;
end;
$$;

drop function public.get_order_timeline(uuid);

create function public.get_order_timeline(p_order_id uuid)
returns table (
  event_id uuid,
  event_type text,
  actor_display_name text,
  occurred_at timestamptz,
  details jsonb,
  comment_body text,
  change_note text,
  from_stage_id uuid,
  to_stage_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id = (select auth.uid());
  if not found or not actor.is_active or actor.must_change_password then raise exception 'No tenés permiso para ver el historial del pedido.'; end if;
  if p_order_id is null or not exists (select 1 from public.orders where id = p_order_id) then raise exception 'El pedido seleccionado no existe.'; end if;
  return query
  select * from (
    select stage_event.id, 'stage_moved'::text, profile.display_name, stage_event.created_at, '{}'::jsonb, null::text, null::text, stage_event.from_stage_id, stage_event.to_stage_id
    from public.order_stage_events stage_event join public.profiles profile on profile.id = stage_event.actor_id where stage_event.order_id = p_order_id
    union all
    select change_event.id, change_event.action, profile.display_name, change_event.created_at,
      case when actor.role = 'employee' and exists (select 1 from jsonb_array_elements(coalesce(change_event.details->'changes', '[]'::jsonb)) item where item->>'field' in ('total_amount', 'deposit_amount', 'deposit_paid'))
        then jsonb_build_object('version', 1, 'changes', jsonb_build_array(jsonb_build_object('field', 'order_updated')))
        else change_event.details end,
      null::text,
      case when actor.role = 'employee' and exists (select 1 from jsonb_array_elements(coalesce(change_event.details->'changes', '[]'::jsonb)) item where item->>'field' in ('total_amount', 'deposit_amount', 'deposit_paid')) then null else change_event.change_note end,
      null::uuid, null::uuid
    from public.order_change_events change_event join public.profiles profile on profile.id = change_event.actor_id where change_event.order_id = p_order_id
    union all
    select comment.id, 'commented'::text, profile.display_name, comment.created_at, '{}'::jsonb, comment.body, null::text, null::uuid, null::uuid
    from public.order_comments comment join public.profiles profile on profile.id = comment.actor_id where comment.order_id = p_order_id
  ) as timeline(event_id, event_type, actor_display_name, occurred_at, details, comment_body, change_note, from_stage_id, to_stage_id)
  order by timeline.occurred_at desc, timeline.event_type asc, timeline.event_id asc;
end;
$$;

revoke all on function public.update_order_description(uuid, text, text, timestamptz, text) from public;
revoke all on function public.update_order(uuid, text, integer, public.order_type, date, date, text, numeric, numeric, boolean, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], text, timestamptz, text) from public;
revoke all on function public.get_order_timeline(uuid) from public;
grant execute on function public.update_order_description(uuid, text, text, timestamptz, text) to authenticated;
grant execute on function public.update_order(uuid, text, integer, public.order_type, date, date, text, numeric, numeric, boolean, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], text, timestamptz, text) to authenticated;
grant execute on function public.get_order_timeline(uuid) to authenticated;
