alter table public.cash_days add column closed_at timestamptz, add column closed_by uuid references public.profiles (id), add column closure_kind text, add column closing_balance numeric(14, 2), add column closure_idempotency_key text, add column closure_idempotency_fingerprint text;
alter table public.cash_days add constraint cash_days_closure_check check ((closed_at is null and closed_by is null and closure_kind is null and closing_balance is null and closure_idempotency_key is null and closure_idempotency_fingerprint is null) or (closed_at is not null and closure_kind in ('manual', 'rollover', 'migration') and closing_balance is not null and (closure_kind = 'migration' or closed_by is not null) and ((closure_idempotency_key is null and closure_idempotency_fingerprint is null) or (char_length(btrim(closure_idempotency_key)) between 1 and 200 and char_length(closure_idempotency_fingerprint) = 32))));
create table public.cash_movement_events (
  id uuid primary key default gen_random_uuid(),
  cash_day_id uuid not null references public.cash_days (id),
  movement_id uuid not null references public.cash_movements (id),
  event_type text not null check (event_type in ('correction', 'void')),
  previous_state jsonb not null,
  new_state jsonb,
  reason text,
  actor_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 200),
  idempotency_fingerprint text not null check (char_length(idempotency_fingerprint) = 32),
  unique (actor_id, idempotency_key), check ((event_type = 'correction' and new_state is not null) or (event_type = 'void' and new_state is null))
);
create unique index cash_movement_events_one_void_idx on public.cash_movement_events (movement_id) where event_type = 'void';
create index cash_movement_events_day_created_at_idx on public.cash_movement_events (cash_day_id, created_at, id);
create index cash_movement_events_movement_created_at_idx on public.cash_movement_events (movement_id, created_at desc, id);
create index cash_movement_events_idempotency_idx on public.cash_movement_events (actor_id, idempotency_key);
create unique index cash_days_closure_idempotency_key_idx on public.cash_days (closure_idempotency_key) where closure_idempotency_key is not null;

update public.cash_days as day
set closed_at = now(), closure_kind = 'migration',
    closing_balance = day.opening_balance + coalesce((select sum(case when movement.direction = 'income' then movement.amount else -movement.amount end)
      from public.cash_movements as movement where movement.cash_day_id = day.id), 0::numeric)
where day.operational_date < (now() at time zone 'America/Argentina/Cordoba')::date and day.closed_at is null;

alter table public.cash_movement_events enable row level security;
revoke all on table public.cash_movement_events from anon, authenticated;
grant select on table public.cash_movement_events to authenticated;
grant select, insert, update, delete on table public.cash_movement_events to service_role;

create or replace function public.cash_m10_effective_movements(p_day_id uuid)
returns table (movement_id uuid, cash_day_id uuid, direction text, amount numeric(14, 2), description text, expense_category_id uuid, expense_category_code text, expense_category_name text, actor_id uuid, created_at timestamptz, voided boolean)
language sql stable security definer set search_path = ''
as $$
  select movement.id, movement.cash_day_id,
    case when event.new_state ? 'direction' then event.new_state->>'direction' else movement.direction end,
    case when event.new_state ? 'amount' then (event.new_state->>'amount')::numeric(14, 2) else movement.amount end,
    case when event.new_state ? 'description' then event.new_state->>'description' else movement.description end,
    case when event.new_state ? 'expense_category_id' then nullif(event.new_state->>'expense_category_id', '')::uuid else movement.expense_category_id end,
    case when event.new_state ? 'expense_category_code' then event.new_state->>'expense_category_code' else movement.expense_category_code end,
    case when event.new_state ? 'expense_category_name' then event.new_state->>'expense_category_name' else movement.expense_category_name end,
    movement.actor_id, movement.created_at, coalesce(event.event_type = 'void', false)
  from public.cash_movements as movement
  left join lateral (select e.event_type, e.new_state from public.cash_movement_events as e
    where e.movement_id = movement.id order by e.created_at desc, e.id desc limit 1) as event on true
  where movement.cash_day_id = p_day_id;
$$;
revoke all on function public.cash_m10_effective_movements(uuid) from public, anon, authenticated;

create or replace function public.cash_m10_guard_open_day()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare day_id uuid; is_closed boolean;
begin
  if (select auth.uid()) is null then return coalesce(new, old); end if;
  if tg_table_name = 'cash_days' then
    day_id := coalesce(new.id, old.id);
  elsif tg_table_name = 'cash_movement_events' then
    day_id := coalesce(new.cash_day_id, old.cash_day_id);
  else
    day_id := coalesce(new.cash_day_id, old.cash_day_id);
  end if;
  select closed_at is not null into is_closed from public.cash_days where id = day_id;
  if is_closed then raise exception 'La caja está cerrada y no admite modificaciones.'; end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.cash_m10_guard_event_append_only()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and tg_op <> 'INSERT' then raise exception 'El historial de caja es inmutable.'; end if;
  return coalesce(new, old);
end;
$$;

create trigger cash_days_m10_open_guard before update or delete on public.cash_days for each row execute function public.cash_m10_guard_open_day();
create trigger cash_opening_events_m10_open_guard before insert or update or delete on public.cash_opening_events for each row execute function public.cash_m10_guard_open_day();
create trigger cash_movements_m10_open_guard before insert or update or delete on public.cash_movements for each row execute function public.cash_m10_guard_open_day();
create trigger cash_movement_events_m10_open_guard before insert on public.cash_movement_events for each row execute function public.cash_m10_guard_open_day();
create trigger cash_movement_events_m10_append_only before update or delete on public.cash_movement_events for each row execute function public.cash_m10_guard_event_append_only();

drop policy "Operational users can read current cash days" on public.cash_days;
drop policy "Operational users can read current cash opening events" on public.cash_opening_events;
drop policy "Operational users can read current cash movements" on public.cash_movements;
create policy "Operational users can read current cash days" on public.cash_days for select to authenticated using ((select public.cash_current_actor_is_operational()) and operational_date = (now() at time zone 'America/Argentina/Cordoba')::date);
create policy "Operational users can read current cash opening events" on public.cash_opening_events for select to authenticated using ((select public.cash_current_actor_is_operational()) and exists (select 1 from public.cash_days as day where day.id = cash_opening_events.cash_day_id and day.operational_date = (now() at time zone 'America/Argentina/Cordoba')::date));
create policy "Operational users can read current cash movements" on public.cash_movements for select to authenticated using ((select public.cash_current_actor_is_operational()) and exists (select 1 from public.cash_days as day where day.id = cash_movements.cash_day_id and day.operational_date = (now() at time zone 'America/Argentina/Cordoba')::date));
create policy "Operational users can read current cash movement events" on public.cash_movement_events for select to authenticated using ((select public.cash_current_actor_is_operational()) and exists (select 1 from public.cash_days as day where day.id = cash_movement_events.cash_day_id and day.operational_date = (now() at time zone 'America/Argentina/Cordoba')::date));

create or replace function public.ensure_current_cash_day()
returns table (cash_day_id uuid, operational_date date, opening_balance numeric(14, 2), opening_updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare v_date date; prior public.cash_days%rowtype;
begin
  v_date := (now() at time zone 'America/Argentina/Cordoba')::date;
  perform pg_advisory_xact_lock(hashtext('digraf:cash-rollover'));
  for prior in select candidate.* from public.cash_days as candidate where candidate.operational_date < v_date and candidate.closed_at is null order by candidate.operational_date, candidate.id for update loop
    if (select auth.uid()) is not null then
      update public.cash_days set closed_at = clock_timestamp(), closed_by = (select auth.uid()), closure_kind = 'rollover',
        closing_balance = prior.opening_balance + coalesce((select sum(case when not effective.voided then case when effective.direction = 'income' then effective.amount else -effective.amount end else 0 end)
          from public.cash_m10_effective_movements(prior.id) as effective), 0::numeric) where id = prior.id;
    end if;
  end loop;
  insert into public.cash_days (operational_date) values (v_date) on conflict on constraint cash_days_operational_date_key do nothing;
  return query select day.id, day.operational_date, day.opening_balance, day.opening_updated_at from public.cash_days as day where day.operational_date = v_date;
end;
$$;
revoke all on function public.ensure_current_cash_day() from public, anon, authenticated;
grant execute on function public.ensure_current_cash_day() to service_role;

drop function public.get_current_cash_summary();
create function public.get_current_cash_summary()
returns table (cash_day_id uuid, operational_date date, opening_balance numeric(14, 2), opening_updated_at timestamptz, current_balance text, movements jsonb, categories jsonb, closed_at timestamptz, closed_by uuid, closure_kind text, closing_balance numeric(14, 2))
language plpgsql security definer set search_path = ''
as $$
declare day public.cash_days%rowtype; v_date date;
begin
  if not public.cash_current_actor_is_operational() then raise exception 'No tenés permiso para consultar la caja.'; end if;
  v_date := (now() at time zone 'America/Argentina/Cordoba')::date; perform public.ensure_current_cash_day();
  select * into day from public.cash_days as candidate where candidate.operational_date = v_date for update;
  return query select day.id, day.operational_date, day.opening_balance, day.opening_updated_at,
    (day.opening_balance + coalesce((select sum(case when not item.voided then case when item.direction = 'income' then item.amount else -item.amount end else 0 end) from public.cash_m10_effective_movements(day.id) as item), 0::numeric))::text,
    coalesce((select jsonb_agg(jsonb_build_object('id', item.movement_id, 'direction', item.direction, 'amount', item.amount, 'description', item.description, 'expense_category_id', item.expense_category_id, 'expense_category_code', item.expense_category_code, 'expense_category_name', item.expense_category_name, 'actor_id', item.actor_id, 'created_at', item.created_at) order by item.created_at, item.movement_id) from public.cash_m10_effective_movements(day.id) as item where not item.voided), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id', category.id, 'code', category.code, 'name', category.name) order by category.code) from public.cash_expense_categories as category where category.is_active), '[]'::jsonb),
    day.closed_at, day.closed_by, day.closure_kind, day.closing_balance;
end;
$$;

create or replace function public.set_cash_opening(p_amount numeric, p_expected_opening_updated_at timestamptz, p_idempotency_key text)
returns table (cash_day_id uuid, opening_balance numeric(14, 2), opening_updated_at timestamptz, event_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype; day public.cash_days%rowtype; existing public.cash_opening_events%rowtype; v_date date; fp text; event_id uuid; previous_opening_balance numeric(14, 2);
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then raise exception 'No tenés permiso para modificar la apertura de caja.'; end if;
  if p_amount is null or p_amount = 'NaN'::numeric or p_amount < 0 or p_amount <> round(p_amount, 2) or p_expected_opening_updated_at is null or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then raise exception 'La apertura de caja no es válida.'; end if;
  fp := md5(concat_ws('|', 'set_cash_opening', p_amount::text, p_expected_opening_updated_at::text)); perform pg_advisory_xact_lock(hashtext('digraf:cash-opening:' || actor.id::text || ':' || p_idempotency_key));
  select * into existing from public.cash_opening_events where actor_id = actor.id and idempotency_key = p_idempotency_key;
  if found then
    if existing.idempotency_fingerprint <> fp then raise exception 'La clave de idempotencia ya fue utilizada para otra apertura.'; end if;
    return query select d.id, d.opening_balance, d.opening_updated_at, existing.id from public.cash_days d where d.id = existing.cash_day_id; return;
  end if;
  v_date := (now() at time zone 'America/Argentina/Cordoba')::date; perform public.ensure_current_cash_day(); select * into day from public.cash_days as candidate where candidate.operational_date = v_date for update;
  if day.closed_at is not null then raise exception 'La caja está cerrada y no admite modificaciones.'; end if;
  if day.opening_updated_at <> p_expected_opening_updated_at then raise exception 'La apertura cambió en otra sesión. Actualizá la caja e intentá nuevamente.'; end if;
  previous_opening_balance := day.opening_balance;
  update public.cash_days set opening_balance = p_amount, opening_updated_at = now() where id = day.id returning * into day;
  insert into public.cash_opening_events (cash_day_id, previous_amount, new_amount, actor_id, idempotency_key, idempotency_fingerprint) values (day.id, previous_opening_balance, p_amount, actor.id, p_idempotency_key, fp) returning id into event_id;
  return query select day.id, day.opening_balance, day.opening_updated_at, event_id;
end;
$$;

create or replace function public.create_cash_movement(p_direction text, p_amount numeric, p_description text, p_expense_category_id uuid, p_idempotency_key text)
returns table (movement_id uuid, cash_day_id uuid, direction text, amount numeric(14, 2), description text, expense_category_id uuid, expense_category_code text, expense_category_name text, actor_id uuid, created_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype; day public.cash_days%rowtype; existing public.cash_movements%rowtype; category public.cash_expense_categories%rowtype; item public.cash_movements%rowtype; v_date date; description text; fp text;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then raise exception 'No tenés permiso para crear movimientos de caja.'; end if;
  description := nullif(btrim(coalesce(p_description, '')), '');
  if p_direction not in ('income', 'expense') or p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 or p_amount <> round(p_amount, 2) or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then raise exception 'El movimiento de caja no es válido.'; end if;
  if p_direction = 'income' and (description is null or char_length(description) not between 2 and 500) then raise exception 'El ingreso debe tener una descripción válida.'; end if;
  if p_direction = 'income' and p_expense_category_id is not null then raise exception 'Un ingreso no puede tener categoría de egreso.'; end if;
  if p_direction = 'expense' and p_expense_category_id is null then raise exception 'El egreso debe tener una categoría activa.'; end if;
  fp := md5(concat_ws('|', 'create_cash_movement', p_direction, p_amount::text, coalesce(description, ''), coalesce(p_expense_category_id::text, ''))); perform pg_advisory_xact_lock(hashtext('digraf:cash-movement:' || actor.id::text || ':' || p_idempotency_key));
  select * into existing from public.cash_movements as candidate where candidate.actor_id = actor.id and candidate.idempotency_key = p_idempotency_key;
  if found then
    if existing.idempotency_fingerprint <> fp then raise exception 'La clave de idempotencia ya fue utilizada para otro movimiento.'; end if;
    return query select existing.id, existing.cash_day_id, existing.direction, existing.amount, existing.description, existing.expense_category_id, existing.expense_category_code, existing.expense_category_name, existing.actor_id, existing.created_at; return;
  end if;
  v_date := (now() at time zone 'America/Argentina/Cordoba')::date; perform public.ensure_current_cash_day(); select * into day from public.cash_days as candidate where candidate.operational_date = v_date for update;
  if day.closed_at is not null then raise exception 'La caja está cerrada y no admite modificaciones.'; end if;
  if p_direction = 'expense' then select * into category from public.cash_expense_categories where id = p_expense_category_id and is_active for key share; if not found then raise exception 'La categoría de egreso no está disponible.'; end if; end if;
  insert into public.cash_movements (cash_day_id, direction, amount, description, expense_category_id, expense_category_code, expense_category_name, actor_id, idempotency_key, idempotency_fingerprint) values (day.id, p_direction, p_amount, description, case when p_direction = 'expense' then category.id end, case when p_direction = 'expense' then category.code end, case when p_direction = 'expense' then category.name end, actor.id, p_idempotency_key, fp) returning * into item;
  return query select item.id, item.cash_day_id, item.direction, item.amount, item.description, item.expense_category_id, item.expense_category_code, item.expense_category_name, item.actor_id, item.created_at;
end;
$$;

create or replace function public.correct_cash_movement(p_movement_id uuid, p_direction text, p_amount numeric, p_description text, p_expense_category_id uuid, p_idempotency_key text)
returns table (movement_id uuid, cash_day_id uuid, direction text, amount numeric(14, 2), description text, expense_category_id uuid, expense_category_code text, expense_category_name text, actor_id uuid, created_at timestamptz, event_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype; day public.cash_days%rowtype; movement public.cash_movements%rowtype; current jsonb; event public.cash_movement_events%rowtype; category public.cash_expense_categories%rowtype; description text; fp text; v_day uuid;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then raise exception 'No tenés permiso para corregir movimientos de caja.'; end if;
  description := nullif(btrim(coalesce(p_description, '')), '');
  if p_movement_id is null or p_direction not in ('income', 'expense') or p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 or p_amount <> round(p_amount, 2) or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then raise exception 'La corrección de caja no es válida.'; end if;
  if p_direction = 'income' and (description is null or char_length(description) not between 2 and 500) then raise exception 'El ingreso debe tener una descripción válida.'; end if;
  if p_direction = 'income' and p_expense_category_id is not null then raise exception 'Un ingreso no puede tener categoría de egreso.'; end if;
  if p_direction = 'expense' and p_expense_category_id is null then raise exception 'El egreso debe tener una categoría activa.'; end if;
  fp := md5(concat_ws('|', 'correct_cash_movement', p_movement_id::text, p_direction, p_amount::text, coalesce(description, ''), coalesce(p_expense_category_id::text, ''))); perform pg_advisory_xact_lock(hashtext('digraf:cash-correction:' || actor.id::text || ':' || p_idempotency_key));
  select * into event from public.cash_movement_events as candidate where candidate.actor_id = actor.id and candidate.idempotency_key = p_idempotency_key;
  if found then
    if event.event_type <> 'correction' or event.idempotency_fingerprint <> fp then raise exception 'La clave de idempotencia ya fue utilizada para otra corrección.'; end if;
    return query select item.movement_id, item.cash_day_id, item.direction, item.amount, item.description, item.expense_category_id, item.expense_category_code, item.expense_category_name, item.actor_id, item.created_at, event.id from public.cash_m10_effective_movements(event.cash_day_id) item where item.movement_id = event.movement_id and not item.voided; return;
  end if;
  select candidate.cash_day_id into v_day from public.cash_movements as candidate where candidate.id = p_movement_id;
  if not found then raise exception 'El movimiento de caja no existe.'; end if;
  perform public.ensure_current_cash_day(); select * into day from public.cash_days as candidate where candidate.id = v_day for update; select * into movement from public.cash_movements as candidate where candidate.id = p_movement_id for update;
  if day.closed_at is not null then raise exception 'La caja está cerrada y no admite modificaciones.'; end if;
  select jsonb_build_object('direction', item.direction, 'amount', item.amount, 'description', item.description, 'expense_category_id', item.expense_category_id, 'expense_category_code', item.expense_category_code, 'expense_category_name', item.expense_category_name) into current from public.cash_m10_effective_movements(day.id) item where item.movement_id = movement.id and not item.voided;
  if current is null then raise exception 'El movimiento ya fue anulado.'; end if;
  if p_direction = 'expense' then select * into category from public.cash_expense_categories where id = p_expense_category_id and is_active for key share; if not found then raise exception 'La categoría de egreso no está disponible.'; end if; end if;
  insert into public.cash_movement_events (cash_day_id, movement_id, event_type, previous_state, new_state, actor_id, created_at, idempotency_key, idempotency_fingerprint) values (day.id, movement.id, 'correction', current, jsonb_build_object('direction', p_direction, 'amount', p_amount, 'description', description, 'expense_category_id', case when p_direction = 'expense' then category.id else null end, 'expense_category_code', case when p_direction = 'expense' then category.code else null end, 'expense_category_name', case when p_direction = 'expense' then category.name else null end), actor.id, clock_timestamp(), p_idempotency_key, fp) returning * into event;
  return query select item.movement_id, item.cash_day_id, item.direction, item.amount, item.description, item.expense_category_id, item.expense_category_code, item.expense_category_name, item.actor_id, item.created_at, event.id from public.cash_m10_effective_movements(day.id) item where item.movement_id = movement.id;
end;
$$;

create or replace function public.void_cash_movement(p_movement_id uuid, p_reason text, p_idempotency_key text)
returns table (movement_id uuid, cash_day_id uuid, voided boolean, event_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype; day public.cash_days%rowtype; movement public.cash_movements%rowtype; current jsonb; event public.cash_movement_events%rowtype; reason text; fp text; v_day uuid;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then raise exception 'No tenés permiso para anular movimientos de caja.'; end if;
  reason := nullif(btrim(coalesce(p_reason, '')), '');
  if p_movement_id is null or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then raise exception 'La anulación de caja no es válida.'; end if;
  if actor.role = 'attention' and (reason is null or char_length(reason) not between 2 and 500) then raise exception 'Atención debe indicar un motivo de anulación de 2 a 500 caracteres.'; end if;
  if reason is not null and char_length(reason) > 500 then raise exception 'El motivo de anulación no puede superar los 500 caracteres.'; end if;
  fp := md5(concat_ws('|', 'void_cash_movement', p_movement_id::text, coalesce(reason, ''))); perform pg_advisory_xact_lock(hashtext('digraf:cash-void:' || actor.id::text || ':' || p_idempotency_key));
  select * into event from public.cash_movement_events as candidate where candidate.actor_id = actor.id and candidate.idempotency_key = p_idempotency_key;
  if found then
    if event.event_type <> 'void' or event.idempotency_fingerprint <> fp then raise exception 'La clave de idempotencia ya fue utilizada para otra anulación.'; end if;
    return query select event.movement_id, event.cash_day_id, true, event.id; return;
  end if;
  select candidate.cash_day_id into v_day from public.cash_movements as candidate where candidate.id = p_movement_id;
  if not found then raise exception 'El movimiento de caja no existe.'; end if;
  perform public.ensure_current_cash_day(); select * into day from public.cash_days as candidate where candidate.id = v_day for update; select * into movement from public.cash_movements as candidate where candidate.id = p_movement_id for update;
  if day.closed_at is not null then raise exception 'La caja está cerrada y no admite modificaciones.'; end if;
  select jsonb_build_object('direction', item.direction, 'amount', item.amount, 'description', item.description, 'expense_category_id', item.expense_category_id, 'expense_category_code', item.expense_category_code, 'expense_category_name', item.expense_category_name) into current from public.cash_m10_effective_movements(day.id) item where item.movement_id = movement.id and not item.voided;
  if current is null then raise exception 'El movimiento ya fue anulado.'; end if;
  insert into public.cash_movement_events (cash_day_id, movement_id, event_type, previous_state, reason, actor_id, created_at, idempotency_key, idempotency_fingerprint) values (day.id, movement.id, 'void', current, reason, actor.id, clock_timestamp(), p_idempotency_key, fp) returning * into event;
  return query select event.movement_id, event.cash_day_id, true, event.id;
end;
$$;

create or replace function public.close_cash_day(p_cash_day_id uuid, p_idempotency_key text)
returns table (cash_day_id uuid, closed_at timestamptz, closed_by uuid, closure_kind text, closing_balance text)
language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype; day public.cash_days%rowtype; existing_key_day public.cash_days%rowtype; balance numeric; request_fingerprint text;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then raise exception 'No tenés permiso para cerrar la caja.'; end if;
  if p_cash_day_id is null or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then raise exception 'El cierre de caja no es válido.'; end if;
  request_fingerprint := md5(concat_ws('|', 'close_cash_day', p_cash_day_id::text));
  perform pg_advisory_xact_lock(hashtext('digraf:cash-close:' || actor.id::text || ':' || p_idempotency_key)); perform pg_advisory_xact_lock(hashtext('digraf:cash-rollover'));
  select * into existing_key_day from public.cash_days as candidate where candidate.closure_idempotency_key = p_idempotency_key;
  if found then
    if existing_key_day.closure_idempotency_fingerprint <> request_fingerprint or existing_key_day.id <> p_cash_day_id then raise exception 'La clave de idempotencia ya fue utilizada para otro cierre.'; end if;
    return query select existing_key_day.id, existing_key_day.closed_at, existing_key_day.closed_by, existing_key_day.closure_kind, existing_key_day.closing_balance::text; return;
  end if;
  select * into day from public.cash_days where id = p_cash_day_id for update;
  if not found then raise exception 'La caja no existe.'; end if;
  if day.closed_at is null then
    select day.opening_balance + coalesce(sum(case when not item.voided then case when item.direction = 'income' then item.amount else -item.amount end else 0 end), 0::numeric) into balance from public.cash_m10_effective_movements(day.id) item;
    update public.cash_days set closed_at = clock_timestamp(), closed_by = actor.id, closure_kind = 'manual', closing_balance = balance, closure_idempotency_key = p_idempotency_key, closure_idempotency_fingerprint = request_fingerprint where id = day.id returning * into day;
  end if;
  return query select day.id, day.closed_at, day.closed_by, day.closure_kind, day.closing_balance::text;
end;
$$;

create or replace function public.list_closed_cash_days()
returns table (cash_day_id uuid, operational_date date, closed_at timestamptz, closed_by uuid, closure_kind text, closing_balance text)
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.cash_current_actor_is_operational() then raise exception 'No tenés permiso para consultar la caja.'; end if;
  return query select day.id, day.operational_date, day.closed_at, day.closed_by, day.closure_kind, day.closing_balance::text from public.cash_days day where day.closed_at is not null order by day.operational_date desc, day.id desc;
end;
$$;

create or replace function public.get_cash_day_summary(p_cash_day_id uuid)
returns table (cash_day_id uuid, operational_date date, opening_balance numeric(14, 2), opening_updated_at timestamptz, closed_at timestamptz, closed_by uuid, closure_kind text, closing_balance text, movements jsonb, events jsonb)
language plpgsql security definer set search_path = ''
as $$
declare day public.cash_days%rowtype;
begin
  if not public.cash_current_actor_is_operational() then raise exception 'No tenés permiso para consultar la caja.'; end if;
  select * into day from public.cash_days where id = p_cash_day_id;
  if not found then raise exception 'La caja no existe.'; end if;
  if day.closed_at is null then raise exception 'La caja seleccionada todavía está abierta.'; end if;
  return query select day.id, day.operational_date, day.opening_balance, day.opening_updated_at, day.closed_at, day.closed_by, day.closure_kind, day.closing_balance::text,
    coalesce((select jsonb_agg(jsonb_build_object('id', item.movement_id, 'direction', item.direction, 'amount', item.amount, 'description', item.description, 'expense_category_id', item.expense_category_id, 'expense_category_code', item.expense_category_code, 'expense_category_name', item.expense_category_name, 'actor_id', item.actor_id, 'created_at', item.created_at) order by item.created_at, item.movement_id) from public.cash_m10_effective_movements(day.id) item where not item.voided), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id', event.id, 'movement_id', event.movement_id, 'event_type', event.event_type, 'previous_state', event.previous_state, 'new_state', event.new_state, 'reason', event.reason, 'actor_id', event.actor_id, 'created_at', event.created_at) order by event.created_at, event.id) from public.cash_movement_events event where event.cash_day_id = day.id), '[]'::jsonb);
end;
$$;

revoke all on function public.get_current_cash_summary(), public.set_cash_opening(numeric, timestamptz, text), public.create_cash_movement(text, numeric, text, uuid, text), public.correct_cash_movement(uuid, text, numeric, text, uuid, text), public.void_cash_movement(uuid, text, text), public.close_cash_day(uuid, text), public.list_closed_cash_days(), public.get_cash_day_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_current_cash_summary(), public.set_cash_opening(numeric, timestamptz, text), public.create_cash_movement(text, numeric, text, uuid, text), public.correct_cash_movement(uuid, text, numeric, text, uuid, text), public.void_cash_movement(uuid, text, text), public.close_cash_day(uuid, text), public.list_closed_cash_days(), public.get_cash_day_summary(uuid) to authenticated;
