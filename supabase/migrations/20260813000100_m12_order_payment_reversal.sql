begin;

-- M12 adds only reversal behavior. Existing payment columns and indexes are reused.
set local search_path = '';

alter table public.cash_movements
  add column is_payment_reversal boolean not null default false;

alter table public.cash_movements
  drop constraint cash_movements_description_check,
  drop constraint cash_movements_category_snapshot_check;

alter table public.cash_movements
  add constraint cash_movements_description_check check (
    (is_payment_reversal and direction = 'expense' and char_length(btrim(description)) between 2 and 500)
    or (not is_payment_reversal and char_length(btrim(description)) between 2 and 500)
  ),
  add constraint cash_movements_category_snapshot_check check (
    (direction = 'income' and expense_category_id is null and expense_category_code is null and expense_category_name is null)
    or (direction = 'expense' and is_payment_reversal and expense_category_id is null and expense_category_code is null and expense_category_name is null)
    or (direction = 'expense' and not is_payment_reversal and expense_category_id is not null and expense_category_code is not null and expense_category_name is not null)
  );

create or replace function public.m12_reversal_link_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_count integer;
  payment public.order_payments%rowtype;
  original public.cash_movements%rowtype;
begin
  if new.is_payment_reversal then
    select count(*) into linked_count
    from public.order_payments linked_payment
    where linked_payment.reversal_cash_movement_id = new.id;
    if linked_count <> 1 then
      raise exception 'La contrapartida de reversión debe estar vinculada a un solo pago.';
    end if;
    select linked_payment.* into payment from public.order_payments linked_payment where linked_payment.reversal_cash_movement_id = new.id;
    select original_movement.* into original from public.cash_movements original_movement where original_movement.id = payment.cash_movement_id;
    if not found or original.cash_day_id <> new.cash_day_id or new.amount <> original.amount or new.amount <= 0 then
      raise exception 'La contrapartida de reversión no coincide con el ingreso original.';
    end if;
    if new.description <> 'Reversión PED-' || lpad((select target_order.public_number::text from public.orders target_order where target_order.id = payment.order_id), 6, '0') then
      raise exception 'La descripción de la contrapartida de reversión no es válida.';
    end if;
  end if;
  return new;
end;
$$;

create constraint trigger m12_payment_reversal_link_check
after insert or update on public.cash_movements
deferrable initially deferred
for each row execute function public.m12_reversal_link_check();

revoke all on function public.m12_reversal_link_check() from public, anon, authenticated;

create unique index order_payment_events_reversed_unique_idx
  on public.order_payment_events (order_payment_id)
  where event_type = 'reversed';

create or replace function public.m12_reversal_fingerprint(
  p_order_id uuid,
  p_payment_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws('|', 'reverse_order_payment:v1', p_order_id::text, p_payment_id::text, p_expected_updated_at::text, regexp_replace(lower(btrim(coalesce(p_reason, ''))), '\s+', ' ', 'g')));
$$;

revoke all on function public.m12_reversal_fingerprint(uuid, uuid, timestamptz, text) from public, anon, authenticated;

create or replace function public.reverse_order_payment(
  p_order_id uuid,
  p_payment_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text,
  p_reason text default null
)
returns table (
  order_id uuid,
  payment_id uuid,
  reversal_cash_movement_id uuid,
  event_id uuid,
  from_stage_id uuid,
  to_stage_id uuid,
  stage_code text,
  updated_at timestamptz,
  amount numeric(14, 2)
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  payment public.order_payments%rowtype;
  original public.cash_movements%rowtype;
  day public.cash_days%rowtype;
  financials public.order_financials%rowtype;
  paid_stage public.workflow_stages%rowtype;
  restored_stage public.workflow_stages%rowtype;
  confirmed_event public.order_payment_events%rowtype;
  existing_event public.order_payment_events%rowtype;
  normalized_key text;
  normalized_reason text;
  fingerprint text;
  event_time timestamptz;
  reversal_id uuid;
  reversal_event_id uuid;
  restored_stage_id uuid;
  reversal_day_id uuid;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para revertir pagos.';
  end if;
  normalized_key := btrim(coalesce(p_idempotency_key, ''));
  normalized_reason := nullif(regexp_replace(lower(btrim(coalesce(p_reason, ''))), '\s+', ' ', 'g'), '');
  if p_order_id is null or p_payment_id is null or p_expected_updated_at is null or char_length(normalized_key) not between 1 and 200 then
    raise exception 'La reversión de pago no es válida.';
  end if;
  if normalized_reason is not null and char_length(normalized_reason) > 500 then
    raise exception 'El motivo de reversión no puede superar los 500 caracteres.';
  end if;
  fingerprint := public.m12_reversal_fingerprint(p_order_id, p_payment_id, p_expected_updated_at, normalized_reason);
  perform pg_advisory_xact_lock(hashtext('digraf:reversal-actor:' || actor.id::text || ':' || normalized_key));
  select * into existing_event from public.order_payment_events event
  where event.actor_id = actor.id and event.idempotency_key = normalized_key and event.event_type = 'reversed';
  if found then
    if existing_event.fingerprint <> fingerprint then raise exception 'La clave de idempotencia ya fue utilizada para otra reversión.'; end if;
     return query select replay_payment.order_id, replay_payment.id, replay_payment.reversal_cash_movement_id, existing_event.id,
       (confirmed_event_row.order_snapshot->>'to_stage_id')::uuid, (confirmed_event_row.order_snapshot->>'from_stage_id')::uuid,
       existing_event.stage, (existing_event.order_snapshot->>'updated_at')::timestamptz, replay_payment.amount
     from public.order_payments replay_payment
     join public.order_payment_events confirmed_event_row on confirmed_event_row.order_payment_id = replay_payment.id and confirmed_event_row.event_type = 'confirmed'
     where replay_payment.id = existing_event.order_payment_id;
    return;
  end if;

   perform pg_advisory_xact_lock(hashtext('digraf:cash-rollover'));
   select movement.cash_day_id into reversal_day_id
   from public.order_payments payment_for_lock
   join public.cash_movements movement on movement.id = payment_for_lock.cash_movement_id
   where payment_for_lock.id = p_payment_id and payment_for_lock.amount > 0;
   if reversal_day_id is not null then
     select * into day from public.cash_days where id = reversal_day_id for update;
   end if;
   select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
   select payment_row.* into payment from public.order_payments payment_row where payment_row.id = p_payment_id and payment_row.order_id = p_order_id for update;
   if not found then raise exception 'El pago seleccionado no existe.'; end if;
   select * into confirmed_event from public.order_payment_events event where event.order_payment_id = payment.id and event.event_type = 'confirmed' order by event.occurred_at limit 1;
   if not found or confirmed_event.order_snapshot->>'from_stage_id' is null then raise exception 'El pago no tiene etapa previa registrada.'; end if;
   restored_stage_id := (confirmed_event.order_snapshot->>'from_stage_id')::uuid;
   select * into restored_stage from public.workflow_stages where id = restored_stage_id for key share;
   if not found then raise exception 'La etapa previa del pago no está disponible.'; end if;
   select * into paid_stage from public.workflow_stages where code = 'paid' and is_active for key share;
   if not found then raise exception 'La etapa Pagado no está disponible.'; end if;
   if payment.reversed_at is not null then raise exception 'El pago ya fue revertido.'; end if;
   if target_order.updated_at <> p_expected_updated_at then raise exception 'El pedido cambió en otra sesión. Actualizá el tablero e intentá nuevamente.'; end if;
   if target_order.current_stage_id <> paid_stage.id then raise exception 'El pedido no está en la etapa Pagado.'; end if;
   select financial_row.* into financials from public.order_financials financial_row where financial_row.order_id = target_order.id for update;
   if not found or payment.amount <> financials.total_amount then raise exception 'El importe del pago no coincide con el pedido.'; end if;
   if payment.amount > 0 then
     select * into original from public.cash_movements where id = payment.cash_movement_id for key share;
     if not found or original.direction <> 'income' or day.id <> original.cash_day_id or day.closed_at is not null then raise exception 'La caja está cerrada y no admite reversiones.'; end if;
     event_time := clock_timestamp();
     reversal_id := gen_random_uuid();
     insert into public.cash_movements (id, cash_day_id, direction, amount, description, actor_id, created_at, idempotency_key, idempotency_fingerprint, is_payment_reversal)
     values (reversal_id, original.cash_day_id, 'expense', payment.amount, 'Reversión PED-' || lpad(target_order.public_number::text, 6, '0'), actor.id, event_time, 'payment-reversal:' || payment.id::text, fingerprint, true);
   else
     event_time := clock_timestamp();
   end if;
    update public.order_payments set reversal_cash_movement_id = reversal_id, reversed_at = event_time where id = payment.id returning public.order_payments.* into payment;
  update public.orders set current_stage_id = restored_stage.id, updated_at = event_time where id = target_order.id returning * into target_order;
  insert into public.order_stage_events (order_id, from_stage_id, to_stage_id, actor_id, created_at, idempotency_key, idempotency_fingerprint)
  values (target_order.id, paid_stage.id, restored_stage.id, actor.id, event_time, 'payment-reversal:' || payment.id::text, fingerprint);
  insert into public.order_payment_events (order_payment_id, event_type, order_snapshot, payment_snapshot, stage, actor_id, occurred_at, idempotency_key, fingerprint)
  values (payment.id, 'reversed', jsonb_build_object('id', target_order.id, 'public_number', target_order.public_number, 'from_stage_id', paid_stage.id, 'to_stage_id', restored_stage.id, 'updated_at', target_order.updated_at), jsonb_build_object('id', payment.id, 'amount', payment.amount, 'cash_movement_id', payment.cash_movement_id, 'reversal_cash_movement_id', payment.reversal_cash_movement_id, 'reversed_at', event_time), restored_stage.code, actor.id, event_time, normalized_key, fingerprint)
  returning id into reversal_event_id;
  return query select target_order.id, payment.id, payment.reversal_cash_movement_id, reversal_event_id, paid_stage.id, restored_stage.id, restored_stage.code, target_order.updated_at, payment.amount;
end;
$$;

revoke all on function public.reverse_order_payment(uuid, uuid, timestamptz, text, text) from public, anon;
grant execute on function public.reverse_order_payment(uuid, uuid, timestamptz, text, text) to authenticated;

create or replace function public.get_order_timeline(p_order_id uuid)
returns table (event_id uuid, event_type text, actor_display_name text, occurred_at timestamptz, details jsonb, comment_body text, change_note text, from_stage_id uuid, to_stage_id uuid)
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id = (select auth.uid());
  if not found or not actor.is_active or actor.must_change_password then raise exception 'No tenés permiso para ver el historial del pedido.'; end if;
  if p_order_id is null or not exists (select 1 from public.orders target_order where target_order.id = p_order_id) then raise exception 'El pedido seleccionado no existe.'; end if;
  return query select * from (
    select e.id, 'stage_moved'::text, p.display_name, e.created_at, '{}'::jsonb, null::text, null::text, e.from_stage_id, e.to_stage_id from public.order_stage_events e join public.profiles p on p.id = e.actor_id where e.order_id = p_order_id
    union all select e.id, e.action, p.display_name, e.created_at, case when actor.role = 'employee' and exists (select 1 from jsonb_array_elements(coalesce(e.details->'changes', '[]'::jsonb)) item where item->>'field' in ('total_amount', 'deposit_amount', 'deposit_paid')) then jsonb_build_object('version', 1, 'changes', jsonb_build_array(jsonb_build_object('field', 'order_updated'))) else e.details end, null::text, case when actor.role = 'employee' and exists (select 1 from jsonb_array_elements(coalesce(e.details->'changes', '[]'::jsonb)) item where item->>'field' in ('total_amount', 'deposit_amount', 'deposit_paid')) then null else e.change_note end, null::uuid, null::uuid from public.order_change_events e join public.profiles p on p.id = e.actor_id where e.order_id = p_order_id
    union all select e.id, 'commented'::text, p.display_name, e.created_at, '{}'::jsonb, e.body, null::text, null::uuid, null::uuid from public.order_comments e join public.profiles p on p.id = e.actor_id where e.order_id = p_order_id
    union all select e.id, case when e.event_type = 'confirmed' then 'payment_confirmed' else 'payment_reversed' end, p.display_name, e.occurred_at, case when actor.role in ('super_admin', 'admin', 'attention') then e.payment_snapshot else jsonb_build_object('version', 1, case when e.event_type = 'confirmed' then 'payment_confirmed' else 'payment_reversed' end, true) end, null::text, null::text, null::uuid, null::uuid from public.order_payment_events e join public.profiles p on p.id = e.actor_id join public.order_payments payment on payment.id = e.order_payment_id where payment.order_id = p_order_id and e.event_type in ('confirmed', 'reversed')
  ) timeline(event_id, event_type, actor_display_name, occurred_at, details, comment_body, change_note, from_stage_id, to_stage_id) order by timeline.occurred_at desc, timeline.event_type asc, timeline.event_id asc;
end; $$;
revoke all on function public.get_order_timeline(uuid) from public, anon;
grant execute on function public.get_order_timeline(uuid) to authenticated;

alter function public.correct_cash_movement(uuid, text, numeric, text, uuid, text) rename to correct_cash_movement_m10;
alter function public.void_cash_movement(uuid, text, text) rename to void_cash_movement_m10;

create or replace function public.correct_cash_movement(p_movement_id uuid, p_direction text, p_amount numeric, p_description text, p_expense_category_id uuid, p_idempotency_key text)
returns table (movement_id uuid, cash_day_id uuid, direction text, amount numeric(14, 2), description text, expense_category_id uuid, expense_category_code text, expense_category_name text, actor_id uuid, created_at timestamptz, event_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.order_payments where cash_movement_id = p_movement_id or reversal_cash_movement_id = p_movement_id) then raise exception 'El movimiento está vinculado a un pago y no admite modificaciones.'; end if;
  return query select * from public.correct_cash_movement_m10(p_movement_id, p_direction, p_amount, p_description, p_expense_category_id, p_idempotency_key);
end; $$;

create or replace function public.void_cash_movement(p_movement_id uuid, p_reason text, p_idempotency_key text)
returns table (movement_id uuid, cash_day_id uuid, voided boolean, event_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.order_payments where cash_movement_id = p_movement_id or reversal_cash_movement_id = p_movement_id) then raise exception 'El movimiento está vinculado a un pago y no admite modificaciones.'; end if;
  return query select * from public.void_cash_movement_m10(p_movement_id, p_reason, p_idempotency_key);
end; $$;

revoke all on function public.correct_cash_movement_m10(uuid, text, numeric, text, uuid, text), public.void_cash_movement_m10(uuid, text, text) from public, anon, authenticated;
grant execute on function public.correct_cash_movement(uuid, text, numeric, text, uuid, text), public.void_cash_movement(uuid, text, text) to authenticated;

commit;
