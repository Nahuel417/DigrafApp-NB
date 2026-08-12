create table public.cash_day_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  cash_day_id uuid not null references public.cash_days (id),
  sequence_no bigint not null check (sequence_no > 0),
  event_type text not null check (event_type in ('close', 'reopen')),
  closure_kind text,
  closing_balance numeric(14, 2),
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default clock_timestamp(),
  reason text,
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 200),
  idempotency_fingerprint text not null check (char_length(idempotency_fingerprint) = 32),
  unique (cash_day_id, sequence_no),
  check ((event_type = 'close' and closure_kind in ('manual', 'rollover', 'migration') and closing_balance is not null and (closure_kind <> 'rollover' or actor_id is null) and reason is null) or (event_type = 'reopen' and closure_kind is null and closing_balance is null and actor_id is not null and char_length(btrim(reason)) between 2 and 500))
);
create unique index cash_day_lifecycle_events_request_idx on public.cash_day_lifecycle_events (coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, idempotency_key);
create index cash_day_lifecycle_events_day_sequence_idx on public.cash_day_lifecycle_events (cash_day_id, sequence_no);
alter table public.cash_day_lifecycle_events enable row level security;
revoke all on table public.cash_day_lifecycle_events from anon, authenticated;
grant select on table public.cash_day_lifecycle_events to authenticated;
grant select, insert, update, delete on table public.cash_day_lifecycle_events to service_role;
create policy "Operational users can read cash lifecycle events" on public.cash_day_lifecycle_events for select to authenticated using ((select public.cash_current_actor_is_operational()));

insert into public.cash_day_lifecycle_events (cash_day_id, sequence_no, event_type, closure_kind, closing_balance, actor_id, created_at, idempotency_key, idempotency_fingerprint)
select day.id, 1, 'close', day.closure_kind, day.closing_balance, case when day.closure_kind = 'rollover' then null else day.closed_by end, day.closed_at, 'm10-migration-close:' || day.id::text, md5(concat_ws('|', 'close_cash_day', day.id::text, day.closure_kind))
from public.cash_days day
where day.closed_at is not null and not exists (select 1 from public.cash_day_lifecycle_events event where event.cash_day_id = day.id);

create or replace function public.cash_m10_guard_open_day()
returns trigger language plpgsql security definer set search_path = '' as $$
declare day_id uuid; is_closed boolean;
begin
  if (select auth.uid()) is null then return coalesce(new, old); end if;
  day_id := case when tg_table_name = 'cash_days' then coalesce(new.id, old.id) else coalesce(new.cash_day_id, old.cash_day_id) end;
  select closed_at is not null into is_closed from public.cash_days where id = day_id;
  if is_closed and not (tg_table_name = 'cash_days' and tg_op = 'UPDATE' and current_setting('digraf.m10_reopen', true) = day_id::text) then raise exception 'La caja está cerrada y no admite modificaciones.'; end if;
  return coalesce(new, old);
end; $$;
create or replace function public.cash_m10_guard_lifecycle_append_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and tg_op <> 'INSERT' then raise exception 'El historial de caja es inmutable.'; end if;
  return coalesce(new, old);
end; $$;
create trigger cash_day_lifecycle_events_append_only before update or delete on public.cash_day_lifecycle_events for each row execute function public.cash_m10_guard_lifecycle_append_only();

create or replace function public.ensure_current_cash_day()
returns table (cash_day_id uuid, operational_date date, opening_balance numeric(14, 2), opening_updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_date date; prior public.cash_days%rowtype; event_time timestamptz; sequence_no bigint;
begin
  v_date := (now() at time zone 'America/Argentina/Cordoba')::date; perform pg_advisory_xact_lock(hashtext('digraf:cash-rollover'));
  for prior in select candidate.* from public.cash_days candidate where candidate.operational_date < v_date and candidate.closed_at is null and coalesce((select event.event_type from public.cash_day_lifecycle_events event where event.cash_day_id = candidate.id order by event.sequence_no desc limit 1), '') <> 'reopen' order by candidate.operational_date, candidate.id for update loop
    event_time := clock_timestamp();
    update public.cash_days set closed_at = event_time, closed_by = null, closure_kind = 'rollover', closing_balance = prior.opening_balance + coalesce((select sum(case when not item.voided then case when item.direction = 'income' then item.amount else -item.amount end else 0 end) from public.cash_m10_effective_movements(prior.id) item), 0::numeric), closure_idempotency_key = null, closure_idempotency_fingerprint = null where id = prior.id returning * into prior;
    select coalesce(max(event.sequence_no), 0) + 1 into sequence_no from public.cash_day_lifecycle_events event where event.cash_day_id = prior.id;
    insert into public.cash_day_lifecycle_events (cash_day_id, sequence_no, event_type, closure_kind, closing_balance, actor_id, created_at, idempotency_key, idempotency_fingerprint) values (prior.id, sequence_no, 'close', 'rollover', prior.closing_balance, null, event_time, 'rollover:' || prior.id::text || ':' || v_date::text, md5(concat_ws('|', 'rollover', prior.id::text, v_date::text)));
  end loop;
  insert into public.cash_days (operational_date) values (v_date) on conflict on constraint cash_days_operational_date_key do nothing;
  return query select day.id, day.operational_date, day.opening_balance, day.opening_updated_at from public.cash_days day where day.operational_date = v_date;
end; $$;

drop function public.get_current_cash_summary();
create function public.get_current_cash_summary()
returns table (cash_day_id uuid, operational_date date, opening_balance numeric(14, 2), opening_updated_at timestamptz, current_balance text, movements jsonb, categories jsonb, closed_at timestamptz, closed_by uuid, closed_by_display_name text, closure_kind text, closing_balance numeric(14, 2))
language plpgsql security definer set search_path = '' as $$
declare day public.cash_days%rowtype; v_date date;
begin
  if not public.cash_current_actor_is_operational() then raise exception 'No tenés permiso para consultar la caja.'; end if;
  v_date := (now() at time zone 'America/Argentina/Cordoba')::date; perform public.ensure_current_cash_day(); select * into day from public.cash_days candidate where candidate.operational_date = v_date for update;
  return query select day.id, day.operational_date, day.opening_balance, day.opening_updated_at, (day.opening_balance + coalesce((select sum(case when not item.voided then case when item.direction = 'income' then item.amount else -item.amount end else 0 end) from public.cash_m10_effective_movements(day.id) item), 0::numeric))::text,
    coalesce((select jsonb_agg(jsonb_build_object('id', item.movement_id, 'direction', item.direction, 'amount', item.amount, 'description', item.description, 'expense_category_id', item.expense_category_id, 'expense_category_code', item.expense_category_code, 'expense_category_name', item.expense_category_name, 'actor_id', item.actor_id, 'actor_display_name', coalesce((select profile.display_name from public.profiles profile where profile.id = item.actor_id), 'Sistema'), 'created_at', item.created_at) order by item.created_at, item.movement_id) from public.cash_m10_effective_movements(day.id) item where not item.voided), '[]'::jsonb), coalesce((select jsonb_agg(jsonb_build_object('id', category.id, 'code', category.code, 'name', category.name) order by category.code) from public.cash_expense_categories category where category.is_active), '[]'::jsonb), day.closed_at, day.closed_by, (select profile.display_name from public.profiles profile where profile.id = day.closed_by), day.closure_kind, day.closing_balance;
end; $$;

create or replace function public.reopen_cash_day(p_cash_day_id uuid, p_reason text, p_idempotency_key text)
returns table (cash_day_id uuid, event_id uuid, sequence_no bigint, reopened_at timestamptz, reopened_by uuid, reason text)
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles%rowtype; day public.cash_days%rowtype; existing public.cash_day_lifecycle_events%rowtype; normalized_reason text; key text; fingerprint text; next_sequence bigint; reopened_at timestamptz; new_event_id uuid;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin', 'attention') then raise exception 'No tenés permiso para reabrir la caja.'; end if;
  normalized_reason := nullif(btrim(coalesce(p_reason, '')), ''); key := btrim(coalesce(p_idempotency_key, '')); if p_cash_day_id is null or normalized_reason is null or char_length(normalized_reason) not between 2 and 500 or char_length(key) not between 1 and 200 then raise exception 'La reapertura de caja no es válida.'; end if;
  fingerprint := md5(concat_ws('|', 'reopen_cash_day', p_cash_day_id::text, normalized_reason)); perform pg_advisory_xact_lock(hashtext('digraf:cash-reopen:' || actor.id::text || ':' || key)); perform pg_advisory_xact_lock(hashtext('digraf:cash-rollover'));
  select * into existing from public.cash_day_lifecycle_events event where event.actor_id = actor.id and event.event_type = 'reopen' and event.idempotency_key = key;
  if found then if existing.cash_day_id <> p_cash_day_id or existing.idempotency_fingerprint <> fingerprint then raise exception 'La clave de idempotencia ya fue utilizada para otra reapertura.'; end if; return query select existing.cash_day_id, existing.id, existing.sequence_no, existing.created_at, existing.actor_id, existing.reason; return; end if;
  select * into day from public.cash_days candidate where candidate.id = p_cash_day_id for update; if not found then raise exception 'La caja no existe.'; end if; if day.closed_at is null then raise exception 'La caja ya está abierta.'; end if;
  perform set_config('digraf.m10_reopen', day.id::text, true); select coalesce(max(event.sequence_no), 0) + 1 into next_sequence from public.cash_day_lifecycle_events event where event.cash_day_id = day.id; reopened_at := clock_timestamp();
  update public.cash_days set closed_at = null, closed_by = null, closure_kind = null, closing_balance = null, closure_idempotency_key = null, closure_idempotency_fingerprint = null where id = day.id;
  insert into public.cash_day_lifecycle_events (cash_day_id, sequence_no, event_type, actor_id, created_at, reason, idempotency_key, idempotency_fingerprint) values (day.id, next_sequence, 'reopen', actor.id, reopened_at, normalized_reason, key, fingerprint) returning id into new_event_id;
  return query select day.id, new_event_id, next_sequence, reopened_at, actor.id, normalized_reason;
end; $$;

create or replace function public.close_cash_day(p_cash_day_id uuid, p_idempotency_key text)
returns table (cash_day_id uuid, closed_at timestamptz, closed_by uuid, closure_kind text, closing_balance text)
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles%rowtype; day public.cash_days%rowtype; existing public.cash_day_lifecycle_events%rowtype; balance numeric; fingerprint text; key text; event_time timestamptz; sequence_no bigint; new_event_id uuid;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update; if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then raise exception 'No tenés permiso para cerrar la caja.'; end if;
  key := btrim(coalesce(p_idempotency_key, '')); if p_cash_day_id is null or char_length(key) not between 1 and 200 then raise exception 'El cierre de caja no es válido.'; end if; fingerprint := md5(concat_ws('|', 'close_cash_day', p_cash_day_id::text)); perform pg_advisory_xact_lock(hashtext('digraf:cash-close:' || actor.id::text || ':' || key)); perform pg_advisory_xact_lock(hashtext('digraf:cash-rollover'));
  select * into existing from public.cash_day_lifecycle_events event where event.actor_id = actor.id and event.event_type = 'close' and event.idempotency_key = key;
  if found then if existing.cash_day_id <> p_cash_day_id or existing.idempotency_fingerprint <> fingerprint then raise exception 'La clave de idempotencia ya fue utilizada para otro cierre.'; end if; return query select existing.cash_day_id, existing.created_at, existing.actor_id, existing.closure_kind, existing.closing_balance::text; return; end if;
  select * into day from public.cash_days candidate where candidate.id = p_cash_day_id for update; if not found then raise exception 'La caja no existe.'; end if; if day.closed_at is not null then raise exception 'La caja está cerrada y no admite modificaciones.'; end if;
  select day.opening_balance + coalesce(sum(case when not item.voided then case when item.direction = 'income' then item.amount else -item.amount end else 0 end), 0::numeric) into balance from public.cash_m10_effective_movements(day.id) item; event_time := clock_timestamp(); update public.cash_days set closed_at = event_time, closed_by = actor.id, closure_kind = 'manual', closing_balance = balance, closure_idempotency_key = key, closure_idempotency_fingerprint = fingerprint where id = day.id returning * into day;
  select coalesce(max(event.sequence_no), 0) + 1 into sequence_no from public.cash_day_lifecycle_events event where event.cash_day_id = day.id; insert into public.cash_day_lifecycle_events (cash_day_id, sequence_no, event_type, closure_kind, closing_balance, actor_id, created_at, idempotency_key, idempotency_fingerprint) values (day.id, sequence_no, 'close', 'manual', balance, actor.id, event_time, key, fingerprint) returning id into new_event_id;
  return query select day.id, event_time, actor.id, 'manual', balance::text;
end; $$;

drop function public.list_closed_cash_days();
create function public.list_closed_cash_days()
returns table (cash_day_id uuid, operational_date date, closed_at timestamptz, closed_by uuid, closed_by_display_name text, closure_kind text, closing_balance text)
language plpgsql security definer set search_path = '' as $$ begin
  if not public.cash_current_actor_is_operational() then raise exception 'No tenés permiso para consultar la caja.'; end if;
  return query select day.id, day.operational_date, day.closed_at, day.closed_by, (select profile.display_name from public.profiles profile where profile.id = day.closed_by), day.closure_kind, day.closing_balance::text from public.cash_days day where day.closed_at is not null order by day.operational_date desc, day.id desc;
end; $$;

drop function public.get_cash_day_summary(uuid);
create function public.get_cash_day_summary(p_cash_day_id uuid)
returns table (cash_day_id uuid, operational_date date, opening_balance numeric(14, 2), opening_updated_at timestamptz, closed_at timestamptz, closed_by uuid, closed_by_display_name text, closure_kind text, closing_balance text, movements jsonb, events jsonb, lifecycle_events jsonb)
language plpgsql security definer set search_path = '' as $$ declare day public.cash_days%rowtype;
begin
  if not public.cash_current_actor_is_operational() then raise exception 'No tenés permiso para consultar la caja.'; end if; select * into day from public.cash_days where id = p_cash_day_id; if not found then raise exception 'La caja no existe.'; end if; if day.closed_at is null then raise exception 'La caja seleccionada todavía está abierta.'; end if;
  return query select day.id, day.operational_date, day.opening_balance, day.opening_updated_at, day.closed_at, day.closed_by, (select profile.display_name from public.profiles profile where profile.id = day.closed_by), day.closure_kind, day.closing_balance::text,
    coalesce((select jsonb_agg(jsonb_build_object('id', item.movement_id, 'direction', item.direction, 'amount', item.amount, 'description', item.description, 'expense_category_id', item.expense_category_id, 'expense_category_code', item.expense_category_code, 'expense_category_name', item.expense_category_name, 'actor_id', item.actor_id, 'actor_display_name', coalesce((select profile.display_name from public.profiles profile where profile.id = item.actor_id), 'Sistema'), 'created_at', item.created_at) order by item.created_at, item.movement_id) from public.cash_m10_effective_movements(day.id) item where not item.voided), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id', event.id, 'movement_id', event.movement_id, 'event_type', event.event_type, 'previous_state', event.previous_state, 'new_state', event.new_state, 'reason', event.reason, 'actor_id', event.actor_id, 'actor_display_name', coalesce((select profile.display_name from public.profiles profile where profile.id = event.actor_id), 'Sistema'), 'created_at', event.created_at) order by event.created_at, event.id) from public.cash_movement_events event where event.cash_day_id = day.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id', event.id, 'sequence_no', event.sequence_no, 'event_type', event.event_type, 'closure_kind', event.closure_kind, 'closing_balance', event.closing_balance, 'actor_id', event.actor_id, 'actor_display_name', coalesce((select profile.display_name from public.profiles profile where profile.id = event.actor_id), 'Sistema'), 'created_at', event.created_at, 'reason', event.reason) order by event.sequence_no) from public.cash_day_lifecycle_events event where event.cash_day_id = day.id), '[]'::jsonb);
end; $$;

revoke all on function public.reopen_cash_day(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reopen_cash_day(uuid, text, text) to authenticated;
