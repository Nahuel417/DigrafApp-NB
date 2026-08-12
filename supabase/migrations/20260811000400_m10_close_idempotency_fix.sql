create or replace function public.close_cash_day(p_cash_day_id uuid, p_idempotency_key text)
returns table (cash_day_id uuid, closed_at timestamptz, closed_by uuid, closure_kind text, closing_balance text)
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles%rowtype; day public.cash_days%rowtype; existing public.cash_day_lifecycle_events%rowtype; balance numeric; fingerprint text; key text; event_time timestamptz; sequence_no bigint; new_event_id uuid;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then raise exception 'No tenés permiso para cerrar la caja.'; end if;
  key := btrim(coalesce(p_idempotency_key, ''));
  if p_cash_day_id is null or char_length(key) not between 1 and 200 then raise exception 'El cierre de caja no es válido.'; end if;
  fingerprint := md5(concat_ws('|', 'close_cash_day', p_cash_day_id::text));
  perform pg_advisory_xact_lock(hashtext('digraf:cash-close:' || actor.id::text || ':' || key));
  perform pg_advisory_xact_lock(hashtext('digraf:cash-rollover'));
  select * into existing from public.cash_day_lifecycle_events event where event.actor_id = actor.id and event.event_type = 'close' and event.idempotency_key = key;
  if found then
    if existing.cash_day_id <> p_cash_day_id or existing.idempotency_fingerprint <> fingerprint then raise exception 'La clave de idempotencia ya fue utilizada para otro cierre.'; end if;
    return query select existing.cash_day_id, existing.created_at, existing.actor_id, existing.closure_kind, existing.closing_balance::text; return;
  end if;
  select * into day from public.cash_days candidate where candidate.id = p_cash_day_id for update;
  if not found then raise exception 'La caja no existe.'; end if;
  if day.closed_at is not null then
    if day.closure_kind = 'manual' and day.closed_by is not null then return query select day.id, day.closed_at, day.closed_by, day.closure_kind, day.closing_balance::text; return; end if;
    raise exception 'La caja está cerrada y no admite modificaciones.';
  end if;
  select day.opening_balance + coalesce(sum(case when not item.voided then case when item.direction = 'income' then item.amount else -item.amount end else 0 end), 0::numeric) into balance from public.cash_m10_effective_movements(day.id) item;
  event_time := clock_timestamp();
  update public.cash_days set closed_at = event_time, closed_by = actor.id, closure_kind = 'manual', closing_balance = balance, closure_idempotency_key = key, closure_idempotency_fingerprint = fingerprint where id = day.id returning * into day;
  select coalesce(max(event.sequence_no), 0) + 1 into sequence_no from public.cash_day_lifecycle_events event where event.cash_day_id = day.id;
  insert into public.cash_day_lifecycle_events (cash_day_id, sequence_no, event_type, closure_kind, closing_balance, actor_id, created_at, idempotency_key, idempotency_fingerprint) values (day.id, sequence_no, 'close', 'manual', balance, actor.id, event_time, key, fingerprint) returning id into new_event_id;
  return query select day.id, event_time, actor.id, 'manual', balance::text;
end; $$;
