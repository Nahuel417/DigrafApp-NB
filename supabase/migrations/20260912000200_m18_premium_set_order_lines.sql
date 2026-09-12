begin;
set local search_path = '';

alter type public.order_line_type add value if not exists 'premium_set';

create or replace function public.pr1a_validate_line(line jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare line_type public.order_line_type; product public.catalog_products%rowtype; upper_id uuid; lower_id uuid;
begin
  begin line_type := (line->>'line_type')::public.order_line_type; exception when invalid_text_representation then raise exception 'El tipo de renglón no es válido.'; end;
  if line_type is null then raise exception 'El tipo de renglón no es válido.'; end if;
  if coalesce((line->>'quantity')::integer, 0) <= 0 then raise exception 'La cantidad del renglón debe ser mayor que cero.'; end if;
  if line_type in ('individual','flag','bag','shield') then
    select * into product from public.catalog_products where id = nullif(line->>'product_id','')::uuid and is_active for update;
    if not found or product.kind <> (case line_type when 'individual' then 'garment' else line_type::text::public.catalog_product_kind end) then raise exception 'El producto del renglón no está activo o no corresponde.'; end if;
    perform public.pr1a_validate_option_selections(product.id, line->'options');
    if line_type = 'individual' then perform public.pr1_validate_legacy_options(line->'configuration'->'legacy_options', product.garment_layer = 'upper', product.garment_layer = 'lower'); end if;
  elsif line_type in ('set','premium_set') then
    upper_id := nullif(line->'configuration'->'upper'->>'product_id','')::uuid;
    lower_id := nullif(line->'configuration'->'lower'->>'product_id','')::uuid;
    select * into product from public.catalog_products where id = upper_id and is_active and kind = 'garment' and garment_layer = 'upper' for update;
    if not found then raise exception 'La parte superior del conjunto no está activa.'; end if;
    perform public.pr1a_validate_option_selections(product.id, line->'configuration'->'upper'->'options');
    select * into product from public.catalog_products where id = lower_id and is_active and kind = 'garment' and garment_layer = 'lower' for update;
    if not found then raise exception 'La parte inferior del conjunto no está activa.'; end if;
    perform public.pr1a_validate_option_selections(product.id, line->'configuration'->'lower'->'options');
    perform public.pr1_validate_legacy_options(line->'configuration'->'legacy_options', true, true);
  end if;
  if jsonb_typeof(coalesce(line->'shield_product_ids','[]'::jsonb)) <> 'array' then raise exception 'Los escudos seleccionados no son válidos.'; end if;
  if jsonb_array_length(coalesce(line->'shield_product_ids','[]'::jsonb)) <> (select count(*) from (select distinct value from jsonb_array_elements_text(coalesce(line->'shield_product_ids','[]'::jsonb))) distinct_values) then raise exception 'No se puede repetir un escudo.'; end if;
end;
$$;

create or replace function public.pr1a_insert_lines(target_order_id uuid, lines jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare line jsonb; line_row public.order_lines%rowtype; product public.catalog_products%rowtype; upper_product public.catalog_products%rowtype; lower_product public.catalog_products%rowtype; shield_id uuid; shield public.catalog_products%rowtype; legacy_snapshot jsonb;
begin
  for line in select value from jsonb_array_elements(lines) loop
    legacy_snapshot := public.pr1_snapshot_legacy_options(line->'configuration'->'legacy_options');
    if (line->>'line_type')::public.order_line_type in ('set','premium_set') then
      select * into upper_product from public.catalog_products where id = nullif(line->'configuration'->'upper'->>'product_id','')::uuid;
      select * into lower_product from public.catalog_products where id = nullif(line->'configuration'->'lower'->>'product_id','')::uuid;
      insert into public.order_lines(order_id, position, line_type, product_name_snapshot, quantity, color, configuration)
      values(target_order_id, (line->>'position')::integer, (line->>'line_type')::public.order_line_type, case when (line->>'line_type') = 'premium_set' then 'Conjunto premium' else 'Conjunto' end, (line->>'quantity')::integer, nullif(btrim(line->>'color'),''), jsonb_build_object(
        'upper', line->'configuration'->'upper' || jsonb_build_object('product_name', upper_product.name, 'options', public.pr1a_snapshot_options(upper_product.id, line->'configuration'->'upper'->'options')),
        'lower', line->'configuration'->'lower' || jsonb_build_object('product_name', lower_product.name, 'options', public.pr1a_snapshot_options(lower_product.id, line->'configuration'->'lower'->'options')),
        'legacy_options', legacy_snapshot
      )) returning * into line_row;
    else
      select * into product from public.catalog_products where id = nullif(line->>'product_id','')::uuid;
      insert into public.order_lines(order_id, position, line_type, product_id, product_name_snapshot, quantity, color, configuration)
      values(target_order_id, (line->>'position')::integer, (line->>'line_type')::public.order_line_type, product.id, product.name, (line->>'quantity')::integer, nullif(btrim(line->>'color'),''), jsonb_build_object(
        'product_name', product.name,
        'options', public.pr1a_snapshot_options(product.id, line->'options'),
        'legacy_options', legacy_snapshot,
        'configuration', coalesce(line->'configuration','{}'::jsonb)
      )) returning * into line_row;
    end if;
    for shield_id in select value::uuid from jsonb_array_elements_text(coalesce(line->'shield_product_ids','[]'::jsonb)) loop
      select * into shield from public.catalog_products where id = shield_id and is_active and kind = 'shield';
      if not found then raise exception 'Uno de los escudos seleccionados no está activo.'; end if;
      insert into public.order_line_shields(order_line_id, shield_product_id, shield_name_snapshot, position)
      values(line_row.id, shield.id, shield.name, (select count(*) from public.order_line_shields where order_line_id = line_row.id));
    end loop;
  end loop;
end;
$$;

create or replace function public.create_order(
  p_client_name text, p_team_name text, p_phone text, p_order_date date, p_promised_delivery_date date,
  p_description text, p_total_amount text, p_deposit_amount text, p_deposit_paid boolean,
  p_lines jsonb, p_idempotency_key text, p_dni text default null
)
returns table (order_id uuid, public_number bigint, stage_code text)
language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype; received_stage public.workflow_stages%rowtype; order_row public.orders%rowtype;
  line jsonb; line_row public.order_lines%rowtype; product public.catalog_products%rowtype; shield_id uuid; shield public.catalog_products%rowtype;
  total_amount numeric; deposit_amount numeric; fingerprint text; existing public.orders%rowtype; normalized_dni text;
begin
  actor := public.pr1a_assert_actor(array['super_admin','admin','attention']::public.app_role[]);
  normalized_dni := nullif(regexp_replace(btrim(coalesce(p_dni, '')), '[.[:space:]]', '', 'g'), '');
  if char_length(btrim(coalesce(p_client_name, ''))) not between 2 and 200 or char_length(btrim(coalesce(p_team_name, ''))) not between 2 and 200 or char_length(btrim(coalesce(p_phone, ''))) not between 6 and 40 then raise exception 'Completá cliente, equipo y teléfono.'; end if;
  if normalized_dni is not null and normalized_dni !~ '^[0-9]{7,8}$' then raise exception 'El DNI debe tener 7 u 8 dígitos.'; end if;
  if char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then raise exception 'La solicitud de creación no es válida.'; end if;
  if p_deposit_paid is null then raise exception 'Indicá si la seña fue abonada.'; end if;
  if p_order_date is null or p_promised_delivery_date is null or p_promised_delivery_date < p_order_date then raise exception 'Las fechas del pedido no son válidas.'; end if;
  if char_length(coalesce(p_description, '')) > 5000 then raise exception 'La descripción no puede superar los 5000 caracteres.'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'El pedido requiere al menos un renglón.'; end if;
  if jsonb_array_length(p_lines) < 1 then raise exception 'El pedido requiere al menos un renglón.'; end if;
  total_amount := nullif(btrim(coalesce(p_total_amount, '')), '')::numeric; deposit_amount := nullif(btrim(coalesce(p_deposit_amount, '')), '')::numeric;
  if total_amount is null or deposit_amount is null or total_amount < 0 or deposit_amount < 0 or deposit_amount > total_amount or total_amount <> round(total_amount, 2) or deposit_amount <> round(deposit_amount, 2) then raise exception 'Los importes del pedido no son válidos.'; end if;
  for line in select value from jsonb_array_elements(p_lines) loop perform public.pr1a_validate_line(line); end loop;
  fingerprint := md5(concat_ws('|', p_client_name, p_team_name, p_phone, p_order_date, p_promised_delivery_date, coalesce(p_description,''), total_amount, deposit_amount, p_deposit_paid, p_lines) || case when normalized_dni is null then '' else '|' || normalized_dni end);
  select * into existing from public.orders where created_by = actor.id and idempotency_key = p_idempotency_key for update;
  if found then if existing.idempotency_fingerprint <> fingerprint then raise exception 'La clave de creación ya fue utilizada para otro pedido.'; end if; return query select existing.id, existing.public_number, (select code from public.workflow_stages where id = existing.current_stage_id); return; end if;
  select * into received_stage from public.workflow_stages where code = 'received' and is_active;
  if not found then raise exception 'La etapa inicial del pedido no está configurada.'; end if;
  insert into public.orders (customer_name, client_name, team_name, phone, dni, quantity, order_type, order_date, promised_delivery_date, description, current_stage_id, created_by, idempotency_key, idempotency_fingerprint)
  values (null, btrim(p_client_name), btrim(p_team_name), btrim(p_phone), normalized_dni, (select sum((value->>'quantity')::integer) from jsonb_array_elements(p_lines)), (select case when count(*) = 1 and min(value->>'line_type') in ('set', 'premium_set') then 'set'::public.order_type when count(*) = 1 and min(value->>'line_type') = 'individual' then 'individual'::public.order_type else null end from jsonb_array_elements(p_lines)), p_order_date, p_promised_delivery_date, nullif(btrim(coalesce(p_description,'')),''), received_stage.id, actor.id, p_idempotency_key, fingerprint) returning * into order_row;
  insert into public.order_financials(order_id,total_amount,deposit_amount,deposit_paid) values(order_row.id,total_amount,deposit_amount,p_deposit_paid);
  perform public.pr1a_insert_lines(order_row.id, p_lines);
  insert into public.order_stage_events(order_id,from_stage_id,to_stage_id,actor_id) values(order_row.id,null,received_stage.id,actor.id);
  return query select order_row.id, order_row.public_number, received_stage.code;
end;
$$;

create or replace function public.update_order(
  p_order_id uuid,
  p_client_name text,
  p_team_name text,
  p_phone text,
  p_order_date date,
  p_promised_delivery_date date,
  p_description text,
  p_total_amount numeric,
  p_deposit_amount numeric,
  p_deposit_paid boolean,
  p_lines jsonb,
  p_change_note text,
  p_expected_updated_at timestamptz,
  p_idempotency_key text,
  p_dni text default '__keep_existing_dni__'
)
returns table(order_id uuid, updated_at timestamptz, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target public.orders%rowtype;
  financials public.order_financials%rowtype;
  event_row public.order_change_events%rowtype;
  fingerprint text;
  new_event_id uuid;
  line jsonb;
  normalized_dni text;
  dni_provided boolean := p_dni is distinct from '__keep_existing_dni__';
  event_details jsonb := jsonb_build_object('version', 1, 'changes', '[]'::jsonb, 'line_count', jsonb_array_length(p_lines));
begin
  actor := public.pr1a_assert_actor(array['super_admin', 'admin', 'attention']::public.app_role[]);
  normalized_dni := case when dni_provided then nullif(regexp_replace(btrim(coalesce(p_dni, '')), '[.[:space:]]', '', 'g'), '') else null end;
  if p_order_id is null or p_expected_updated_at is null or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then raise exception 'La solicitud de edición no es válida.'; end if;
  if char_length(btrim(coalesce(p_client_name, ''))) not between 2 and 200 or char_length(btrim(coalesce(p_team_name, ''))) not between 2 and 200 or char_length(btrim(coalesce(p_phone, ''))) not between 6 and 40 then raise exception 'Completá cliente, equipo y teléfono.'; end if;
  if dni_provided and normalized_dni is not null and normalized_dni !~ '^[0-9]{7,8}$' then raise exception 'El DNI debe tener 7 u 8 dígitos.'; end if;
  if p_order_date is null or p_promised_delivery_date is null or p_promised_delivery_date < p_order_date then raise exception 'Las fechas del pedido no son válidas.'; end if;
  if p_total_amount is null or p_deposit_amount is null or p_total_amount < 0 or p_deposit_amount < 0 or p_deposit_amount > p_total_amount or p_total_amount <> round(p_total_amount, 2) or p_deposit_amount <> round(p_deposit_amount, 2) then raise exception 'Los importes del pedido no son válidos.'; end if;
  if p_deposit_paid is null then raise exception 'Indicá si la seña fue abonada.'; end if;
  if char_length(coalesce(p_description, '')) > 5000 then raise exception 'La descripción no puede superar los 5000 caracteres.'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'El pedido requiere al menos un renglón.'; end if;
  if jsonb_array_length(p_lines) < 1 then raise exception 'El pedido requiere al menos un renglón.'; end if;
  for line in select value from jsonb_array_elements(p_lines) loop perform public.pr1a_validate_line(line); end loop;
  fingerprint := md5(concat_ws('|', p_order_id, p_client_name, p_team_name, p_phone, p_order_date, p_promised_delivery_date, coalesce(p_description, ''), p_total_amount, p_deposit_amount, p_deposit_paid, p_lines, coalesce(p_change_note, ''), p_expected_updated_at) || case when dni_provided then '|' || coalesce(normalized_dni, '') else '' end);
  select * into event_row from public.order_change_events where actor_id = actor.id and idempotency_key = p_idempotency_key;
  if found then if event_row.idempotency_fingerprint <> fingerprint then raise exception 'La clave de idempotencia ya fue utilizada para otra edición.'; end if; return query select event_row.order_id, event_row.order_updated_at, event_row.id; return; end if;
  select * into target from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  if target.updated_at <> p_expected_updated_at then raise exception 'El pedido cambió en otra sesión. Actualizalo e intentá nuevamente.'; end if;
  select * into financials from public.order_financials where public.order_financials.order_id = target.id for update;
  if not found then raise exception 'Los importes del pedido no están disponibles.'; end if;
  if target.client_name is distinct from btrim(p_client_name) then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'client_name', 'previous', target.client_name, 'next', btrim(p_client_name)))); end if;
  if target.team_name is distinct from btrim(p_team_name) then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'team_name', 'previous', target.team_name, 'next', btrim(p_team_name)))); end if;
  if target.phone is distinct from btrim(p_phone) then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'phone'))); end if;
  if dni_provided and target.dni is distinct from normalized_dni then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'dni'))); end if;
  if target.order_date is distinct from p_order_date then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'order_date', 'previous', target.order_date, 'next', p_order_date))); end if;
  if target.promised_delivery_date is distinct from p_promised_delivery_date then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'promised_delivery_date', 'previous', target.promised_delivery_date, 'next', p_promised_delivery_date))); end if;
  if target.description is distinct from nullif(btrim(coalesce(p_description, '')), '') then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'description'))); end if;
  if financials.total_amount is distinct from p_total_amount then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'total_amount', 'previous', financials.total_amount, 'next', p_total_amount))); end if;
  if financials.deposit_amount is distinct from p_deposit_amount then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'deposit_amount', 'previous', financials.deposit_amount, 'next', p_deposit_amount))); end if;
  if financials.deposit_paid is distinct from p_deposit_paid then event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'deposit_paid', 'previous', financials.deposit_paid, 'next', p_deposit_paid))); end if;
  event_details := jsonb_set(event_details, '{changes}', event_details -> 'changes' || jsonb_build_array(jsonb_build_object('field', 'specifications')));
  update public.orders set client_name = btrim(p_client_name), team_name = btrim(p_team_name), phone = btrim(p_phone), dni = case when dni_provided then normalized_dni else dni end, customer_name = null, quantity = (select sum((value ->> 'quantity')::integer) from jsonb_array_elements(p_lines)), order_type = (select case when count(*) = 1 and min(value->>'line_type') in ('set', 'premium_set') then 'set'::public.order_type when count(*) = 1 and min(value->>'line_type') = 'individual' then 'individual'::public.order_type else null end from jsonb_array_elements(p_lines)), order_date = p_order_date, promised_delivery_date = p_promised_delivery_date, description = nullif(btrim(coalesce(p_description, '')), ''), updated_at = now() where id = target.id returning * into target;
  update public.order_financials set total_amount = p_total_amount, deposit_amount = p_deposit_amount, deposit_paid = p_deposit_paid, updated_at = now() where public.order_financials.order_id = target.id;
  delete from public.order_line_shields where order_line_id in (select id from public.order_lines where public.order_lines.order_id = target.id);
  delete from public.order_lines where public.order_lines.order_id = target.id;
  perform public.pr1a_insert_lines(target.id, p_lines);
  insert into public.order_change_events(order_id, actor_id, action, details, change_note, order_updated_at, idempotency_key, idempotency_fingerprint) values(target.id, actor.id, 'order_updated', event_details, nullif(btrim(coalesce(p_change_note, '')), ''), target.updated_at, p_idempotency_key, fingerprint) returning id into new_event_id;
  return query select target.id, target.updated_at, new_event_id;
end;
$$;

commit;
