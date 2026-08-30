begin;

set local search_path = '';

alter table public.orders
  add column lifecycle_state text not null default 'active',
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles (id),
  add column cancellation_reason text,
  add constraint orders_lifecycle_state_check check (lifecycle_state in ('active', 'cancelled')),
  add constraint orders_cancellation_fields_check check (
    (lifecycle_state = 'active' and cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or (lifecycle_state = 'cancelled' and cancelled_at is not null and cancelled_by is not null and cancellation_reason is not null and char_length(btrim(cancellation_reason)) between 2 and 500)
  );

create index orders_active_stage_created_at_idx
  on public.orders (current_stage_id, created_at desc)
  where lifecycle_state = 'active';

create index orders_cancelled_at_idx
  on public.orders (cancelled_at desc)
  where lifecycle_state = 'cancelled';

create table public.order_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  actor_id uuid not null references public.profiles (id),
  event_type text not null check (event_type in ('cancelled', 'restored')),
  from_state text not null check (from_state in ('active', 'cancelled')),
  to_state text not null check (to_state in ('active', 'cancelled')),
  reason text not null check (char_length(btrim(reason)) between 2 and 500),
  occurred_at timestamptz not null default clock_timestamp(),
  version integer not null default 1 check (version = 1),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 200),
  fingerprint text not null check (char_length(fingerprint) = 32),
  result_snapshot jsonb not null check (jsonb_typeof(result_snapshot) = 'object'),
  unique (actor_id, idempotency_key)
);

create index order_lifecycle_events_order_occurred_at_idx
  on public.order_lifecycle_events (order_id, occurred_at desc, id);

create index order_lifecycle_events_actor_occurred_at_idx
  on public.order_lifecycle_events (actor_id, occurred_at desc, id);

alter table public.order_lifecycle_events enable row level security;

revoke all on table public.order_lifecycle_events from public, anon, authenticated, service_role;
grant select, update, delete on table public.order_lifecycle_events to service_role;
grant select on table public.order_lifecycle_events to authenticated;

create policy "Managers can read order lifecycle events"
on public.order_lifecycle_events
for select
to authenticated
using ((select public.current_active_role()) in ('super_admin', 'admin'));

create function public.m15_prevent_lifecycle_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'El evento de ciclo de vida es inmutable.';
end;
$$;

create trigger order_lifecycle_events_append_only
before update or delete on public.order_lifecycle_events
for each row execute function public.m15_prevent_lifecycle_event_mutation();

revoke all on function public.m15_prevent_lifecycle_event_mutation() from public, anon, authenticated;

create function public.m15_reject_cancelled_order_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid;
begin
  if (select auth.role()) = 'service_role' then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'orders' then
    target_order_id := coalesce(new.id, old.id);
    if tg_op = 'UPDATE' and old.lifecycle_state = 'cancelled' and new.lifecycle_state = 'active' then
      return new;
    end if;
  elsif tg_table_name in ('order_financials', 'order_catalog_items', 'order_stage_events', 'order_change_events', 'order_comments', 'order_design_images', 'order_design_image_events') then
    target_order_id := coalesce(new.order_id, old.order_id);
  elsif tg_table_name = 'order_payments' then
    target_order_id := coalesce(new.order_id, old.order_id);
  elsif tg_table_name = 'order_payment_events' then
    select payment.order_id into target_order_id
    from public.order_payments payment
    where payment.id = coalesce(new.order_payment_id, old.order_payment_id);
  end if;

  if target_order_id is not null and exists (
    select 1 from public.orders target_order where target_order.id = target_order_id and target_order.lifecycle_state = 'cancelled'
  ) then
    raise exception 'El pedido está anulado y se encuentra congelado.';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.m15_reject_cancelled_order_mutation() from public, anon, authenticated;

create trigger orders_reject_cancelled_mutation
before update on public.orders
for each row execute function public.m15_reject_cancelled_order_mutation();

create trigger order_financials_reject_cancelled_mutation
before insert or update or delete on public.order_financials
for each row execute function public.m15_reject_cancelled_order_mutation();

create trigger order_catalog_items_reject_cancelled_mutation
before insert or update or delete on public.order_catalog_items
for each row execute function public.m15_reject_cancelled_order_mutation();

create trigger order_stage_events_reject_cancelled_mutation
before insert or update or delete on public.order_stage_events
for each row execute function public.m15_reject_cancelled_order_mutation();

create trigger order_change_events_reject_cancelled_mutation
before insert or update or delete on public.order_change_events
for each row execute function public.m15_reject_cancelled_order_mutation();

create trigger order_comments_reject_cancelled_mutation
before insert or update or delete on public.order_comments
for each row execute function public.m15_reject_cancelled_order_mutation();

create trigger order_design_images_reject_cancelled_mutation
before insert or update or delete on public.order_design_images
for each row execute function public.m15_reject_cancelled_order_mutation();

create trigger order_design_image_events_reject_cancelled_mutation
before insert or update or delete on public.order_design_image_events
for each row execute function public.m15_reject_cancelled_order_mutation();

create trigger order_payments_reject_cancelled_mutation
before insert or update or delete on public.order_payments
for each row execute function public.m15_reject_cancelled_order_mutation();

create trigger order_payment_events_reject_cancelled_mutation
before insert or update or delete on public.order_payment_events
for each row execute function public.m15_reject_cancelled_order_mutation();

drop policy "Operational users can read orders" on public.orders;
create policy "Operational users can read orders"
on public.orders
for select
to authenticated
using (
  (select public.current_active_role()) is not null
  and (lifecycle_state = 'active' or (select public.current_active_role()) in ('super_admin', 'admin'))
);

drop policy "Operational users can read order specifications" on public.order_catalog_items;
create policy "Operational users can read order specifications"
on public.order_catalog_items
for select
to authenticated
using (
  (select public.current_active_role()) is not null
  and (
    (select public.current_active_role()) in ('super_admin', 'admin')
    or exists (select 1 from public.orders target_order where target_order.id = order_catalog_items.order_id and target_order.lifecycle_state = 'active')
  )
);

drop policy "Operational users can read stage history" on public.order_stage_events;
create policy "Operational users can read stage history"
on public.order_stage_events
for select
to authenticated
using (
  (select public.current_active_role()) is not null
  and (
    (select public.current_active_role()) in ('super_admin', 'admin')
    or exists (select 1 from public.orders target_order where target_order.id = order_stage_events.order_id and target_order.lifecycle_state = 'active')
  )
);

drop policy "Financial roles can read order finances" on public.order_financials;
create policy "Financial roles can read order finances"
on public.order_financials
for select
to authenticated
using (
  (select public.current_active_role()) in ('super_admin', 'admin', 'attention')
  and (
    (select public.current_active_role()) in ('super_admin', 'admin')
    or exists (select 1 from public.orders target_order where target_order.id = order_financials.order_id and target_order.lifecycle_state = 'active')
  )
);

drop policy "Operational users can read order change events" on public.order_change_events;
create policy "Operational users can read order change events"
on public.order_change_events
for select
to authenticated
using (
  (select public.current_active_role()) is not null
  and (
    (select public.current_active_role()) in ('super_admin', 'admin')
    or exists (select 1 from public.orders target_order where target_order.id = order_change_events.order_id and target_order.lifecycle_state = 'active')
  )
);

drop policy "Operational users can read order comments" on public.order_comments;
create policy "Operational users can read order comments"
on public.order_comments
for select
to authenticated
using (
  (select public.current_active_role()) is not null
  and (
    (select public.current_active_role()) in ('super_admin', 'admin')
    or exists (select 1 from public.orders target_order where target_order.id = order_comments.order_id and target_order.lifecycle_state = 'active')
  )
);

drop policy "Operational users can read order design images" on public.order_design_images;
create policy "Operational users can read order design images"
on public.order_design_images
for select
to authenticated
using (
  (select public.current_active_role()) is not null
  and (
    (select public.current_active_role()) in ('super_admin', 'admin')
    or exists (select 1 from public.orders target_order where target_order.id = order_design_images.order_id and target_order.lifecycle_state = 'active')
  )
);

drop policy "Operational users can read order design image events" on public.order_design_image_events;
create policy "Operational users can read order design image events"
on public.order_design_image_events
for select
to authenticated
using (
  (select public.current_active_role()) is not null
  and (
    (select public.current_active_role()) in ('super_admin', 'admin')
    or exists (select 1 from public.orders target_order where target_order.id = order_design_image_events.order_id and target_order.lifecycle_state = 'active')
  )
);

drop policy "Financial roles can read order payments" on public.order_payments;
create policy "Financial roles can read order payments"
on public.order_payments
for select
to authenticated
using (
  (select public.current_active_role()) in ('super_admin', 'admin', 'attention')
  and (
    (select public.current_active_role()) in ('super_admin', 'admin')
    or exists (select 1 from public.orders target_order where target_order.id = order_payments.order_id and target_order.lifecycle_state = 'active')
  )
);

drop policy "Financial roles can read order payment events" on public.order_payment_events;
create policy "Financial roles can read order payment events"
on public.order_payment_events
for select
to authenticated
using (
  (select public.current_active_role()) in ('super_admin', 'admin', 'attention')
  and (
    (select public.current_active_role()) in ('super_admin', 'admin')
    or exists (
      select 1
      from public.order_payments payment
      join public.orders target_order on target_order.id = payment.order_id
      where payment.id = order_payment_events.order_payment_id
        and target_order.lifecycle_state = 'active'
    )
  )
);

drop policy "Operational users can read order design objects" on storage.objects;
create policy "Operational users can read order design objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'order-designs'
  and (select public.current_active_role()) is not null
  and name ~ '^orders/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
  and exists (
    select 1
    from public.orders target_order
    where target_order.id::text = split_part(name, '/', 2)
      and (target_order.lifecycle_state = 'active' or (select public.current_active_role()) in ('super_admin', 'admin'))
  )
);

create or replace function public.m15_cancel_fingerprint(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws('|', 'cancel_order:v1', p_order_id::text, p_expected_updated_at::text, p_reason));
$$;

create or replace function public.m15_restore_fingerprint(
  p_order_id uuid,
  p_expected_updated_at timestamptz
)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws('|', 'restore_order:v1', p_order_id::text, p_expected_updated_at::text));
$$;

revoke all on function public.m15_cancel_fingerprint(uuid, timestamptz, text), public.m15_restore_fingerprint(uuid, timestamptz) from public, anon, authenticated;

create function public.cancel_order(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_idempotency_key text
)
returns table (
  order_id uuid,
  public_number bigint,
  lifecycle_state text,
  current_stage_id uuid,
  cancelled_at timestamptz,
  updated_at timestamptz,
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  existing_event public.order_lifecycle_events%rowtype;
  normalized_key text;
  normalized_reason text;
  request_fingerprint text;
  event_time timestamptz;
  new_event_id uuid;
  result_snapshot jsonb;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para anular pedidos.';
  end if;

  normalized_key := btrim(coalesce(p_idempotency_key, ''));
  normalized_reason := regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g');
  if p_order_id is null or p_expected_updated_at is null or char_length(normalized_key) not between 1 and 200 or char_length(normalized_reason) not between 2 and 500 then
    raise exception 'El motivo de anulación debe tener entre 2 y 500 caracteres.';
  end if;

  request_fingerprint := public.m15_cancel_fingerprint(p_order_id, p_expected_updated_at, normalized_reason);
  perform pg_advisory_xact_lock(hashtext('digraf:m15:actor:' || actor.id::text || ':' || normalized_key));
  select * into existing_event
  from public.order_lifecycle_events event
  where event.actor_id = actor.id and event.idempotency_key = normalized_key;
  if found then
    if existing_event.fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra anulación.';
    end if;
    return query select
      (existing_event.result_snapshot->>'order_id')::uuid,
      (existing_event.result_snapshot->>'public_number')::bigint,
      existing_event.result_snapshot->>'lifecycle_state',
      (existing_event.result_snapshot->>'current_stage_id')::uuid,
      (existing_event.result_snapshot->>'cancelled_at')::timestamptz,
      (existing_event.result_snapshot->>'updated_at')::timestamptz,
      existing_event.id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('digraf:m15:order:' || p_order_id::text));
  select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  if target_order.updated_at <> p_expected_updated_at then
    raise exception 'El pedido cambió en otra sesión. Actualizá el tablero e intentá nuevamente.';
  end if;
  if target_order.lifecycle_state = 'cancelled' then
    raise exception 'El pedido ya está anulado.';
  end if;
  if exists (select 1 from public.order_payments payment where payment.order_id = target_order.id and payment.reversed_at is null for update) then
    raise exception 'El pedido tiene un pago activo. Revertí el pago mediante M12 antes de anularlo.';
  end if;

  event_time := clock_timestamp();
  update public.orders
  set lifecycle_state = 'cancelled', cancelled_at = event_time, cancelled_by = actor.id, cancellation_reason = normalized_reason, updated_at = event_time
  where id = target_order.id
  returning * into target_order;

  result_snapshot := jsonb_build_object(
    'order_id', target_order.id,
    'public_number', target_order.public_number,
    'lifecycle_state', target_order.lifecycle_state,
    'current_stage_id', target_order.current_stage_id,
    'cancelled_at', target_order.cancelled_at,
    'updated_at', target_order.updated_at
  );
  insert into public.order_lifecycle_events (order_id, actor_id, event_type, from_state, to_state, reason, occurred_at, idempotency_key, fingerprint, result_snapshot)
  values (target_order.id, actor.id, 'cancelled', 'active', 'cancelled', normalized_reason, event_time, normalized_key, request_fingerprint, result_snapshot)
  returning id into new_event_id;

  return query select target_order.id, target_order.public_number, target_order.lifecycle_state, target_order.current_stage_id, target_order.cancelled_at, target_order.updated_at, new_event_id;
end;
$$;

create function public.restore_order(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns table (
  order_id uuid,
  public_number bigint,
  lifecycle_state text,
  current_stage_id uuid,
  cancelled_at timestamptz,
  updated_at timestamptz,
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  existing_event public.order_lifecycle_events%rowtype;
  normalized_key text;
  request_fingerprint text;
  event_time timestamptz;
  new_event_id uuid;
  result_snapshot jsonb;
begin
  select * into actor from public.profiles where id = (select auth.uid()) for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para restaurar pedidos.';
  end if;

  normalized_key := btrim(coalesce(p_idempotency_key, ''));
  if p_order_id is null or p_expected_updated_at is null or char_length(normalized_key) not between 1 and 200 then
    raise exception 'La solicitud de restauración no es válida.';
  end if;
  request_fingerprint := public.m15_restore_fingerprint(p_order_id, p_expected_updated_at);
  perform pg_advisory_xact_lock(hashtext('digraf:m15:actor:' || actor.id::text || ':' || normalized_key));
  select * into existing_event
  from public.order_lifecycle_events event
  where event.actor_id = actor.id and event.idempotency_key = normalized_key;
  if found then
    if existing_event.fingerprint <> request_fingerprint then
      raise exception 'La clave de idempotencia ya fue utilizada para otra restauración.';
    end if;
    return query select
      (existing_event.result_snapshot->>'order_id')::uuid,
      (existing_event.result_snapshot->>'public_number')::bigint,
      existing_event.result_snapshot->>'lifecycle_state',
      (existing_event.result_snapshot->>'current_stage_id')::uuid,
      null::timestamptz,
      (existing_event.result_snapshot->>'updated_at')::timestamptz,
      existing_event.id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('digraf:m15:order:' || p_order_id::text));
  select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido seleccionado no existe.'; end if;
  if target_order.updated_at <> p_expected_updated_at then
    raise exception 'El pedido cambió en otra sesión. Actualizá el Archivo e intentá nuevamente.';
  end if;
  if target_order.lifecycle_state <> 'cancelled' then
    raise exception 'El pedido no está anulado.';
  end if;
  if clock_timestamp() >= target_order.cancelled_at + interval '30 days' then
    raise exception 'La ventana de restauración de 30 días ya venció.';
  end if;

  event_time := clock_timestamp();
  update public.orders
  set lifecycle_state = 'active', cancelled_at = null, cancelled_by = null, cancellation_reason = null, updated_at = event_time
  where id = target_order.id
  returning * into target_order;

  result_snapshot := jsonb_build_object(
    'order_id', target_order.id,
    'public_number', target_order.public_number,
    'lifecycle_state', target_order.lifecycle_state,
    'current_stage_id', target_order.current_stage_id,
    'updated_at', target_order.updated_at
  );
  insert into public.order_lifecycle_events (order_id, actor_id, event_type, from_state, to_state, reason, occurred_at, idempotency_key, fingerprint, result_snapshot)
  values (target_order.id, actor.id, 'restored', 'cancelled', 'active', coalesce(target_order.cancellation_reason, 'Restauración del pedido'), event_time, normalized_key, request_fingerprint, result_snapshot)
  returning id into new_event_id;

  return query select target_order.id, target_order.public_number, target_order.lifecycle_state, target_order.current_stage_id, target_order.cancelled_at, target_order.updated_at, new_event_id;
end;
$$;

revoke all on function public.cancel_order(uuid, timestamptz, text, text), public.restore_order(uuid, timestamptz, text) from public, anon;
grant execute on function public.cancel_order(uuid, timestamptz, text, text), public.restore_order(uuid, timestamptz, text) to authenticated;

create or replace function public.get_order_board()
returns table (
  id uuid,
  public_number bigint,
  customer_name text,
  quantity integer,
  order_type public.order_type,
  promised_delivery_date date,
  current_stage_id uuid,
  updated_at timestamptz,
  has_design_image boolean,
  image_updated_at timestamptz,
  total_amount numeric(14, 2),
  payment_confirmed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id = (select auth.uid());
  if not found or not actor.is_active or actor.must_change_password then raise exception 'No tenés permiso para consultar el tablero.'; end if;
  return query
  select target_order.id, target_order.public_number, target_order.customer_name, target_order.quantity, target_order.order_type, target_order.promised_delivery_date, target_order.current_stage_id, target_order.updated_at,
    (design_image.order_id is not null), design_image.updated_at,
    case when actor.role in ('super_admin', 'admin', 'attention') then financials.total_amount else null end,
    payment.confirmed_at
  from public.orders target_order
  left join public.order_financials financials on financials.order_id = target_order.id
  left join lateral (select image.order_id, image.updated_at from public.order_design_images image where image.order_id = target_order.id limit 1) design_image on true
  left join public.order_payments payment on payment.order_id = target_order.id and payment.reversed_at is null
  where target_order.lifecycle_state = 'active'
  order by target_order.public_number;
end;
$$;

revoke all on function public.get_order_board() from public, anon, authenticated;
grant execute on function public.get_order_board() to authenticated;

create or replace function public.get_order_timeline(p_order_id uuid)
returns table (event_id uuid, event_type text, actor_display_name text, occurred_at timestamptz, details jsonb, comment_body text, change_note text, from_stage_id uuid, to_stage_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
begin
  select * into actor from public.profiles where id = (select auth.uid());
  if not found or not actor.is_active or actor.must_change_password then raise exception 'No tenés permiso para ver el historial del pedido.'; end if;
  select * into target_order from public.orders where id = p_order_id;
  if not found or (target_order.lifecycle_state = 'cancelled' and actor.role not in ('super_admin', 'admin')) then raise exception 'El pedido seleccionado no existe.'; end if;
  return query select * from (
    select e.id, 'stage_moved'::text, p.display_name, e.created_at, '{}'::jsonb, null::text, null::text, e.from_stage_id, e.to_stage_id
    from public.order_stage_events e join public.profiles p on p.id = e.actor_id where e.order_id = p_order_id
    union all
    select e.id, e.action, p.display_name, e.created_at,
      case when actor.role = 'employee' and exists (select 1 from jsonb_array_elements(coalesce(e.details->'changes', '[]'::jsonb)) item where item->>'field' in ('total_amount', 'deposit_amount', 'deposit_paid')) then jsonb_build_object('version', 1, 'changes', jsonb_build_array(jsonb_build_object('field', 'order_updated'))) else e.details end,
      null::text,
      case when actor.role = 'employee' and exists (select 1 from jsonb_array_elements(coalesce(e.details->'changes', '[]'::jsonb)) item where item->>'field' in ('total_amount', 'deposit_amount', 'deposit_paid')) then null else e.change_note end,
      null::uuid, null::uuid
    from public.order_change_events e join public.profiles p on p.id = e.actor_id where e.order_id = p_order_id
    union all
    select e.id, 'commented'::text, p.display_name, e.created_at, '{}'::jsonb, e.body, null::text, null::uuid, null::uuid
    from public.order_comments e join public.profiles p on p.id = e.actor_id where e.order_id = p_order_id
    union all
    select e.id, case when e.event_type = 'confirmed' then 'payment_confirmed' else 'payment_reversed' end, p.display_name, e.occurred_at,
      case when actor.role in ('super_admin', 'admin', 'attention') then e.payment_snapshot else jsonb_build_object('version', 1, case when e.event_type = 'confirmed' then 'payment_confirmed' else 'payment_reversed' end, true) end,
      null::text, null::text, null::uuid, null::uuid
    from public.order_payment_events e join public.profiles p on p.id = e.actor_id join public.order_payments payment on payment.id = e.order_payment_id where payment.order_id = p_order_id and e.event_type in ('confirmed', 'reversed')
    union all
    select e.id, case when e.event_type = 'cancelled' then 'order_cancelled' else 'order_restored' end, p.display_name, e.occurred_at,
      jsonb_build_object('version', e.version, 'reason', e.reason, 'from_state', e.from_state, 'to_state', e.to_state, 'snapshot', e.result_snapshot),
      null::text, null::text, null::uuid, null::uuid
    from public.order_lifecycle_events e join public.profiles p on p.id = e.actor_id where e.order_id = p_order_id
  ) timeline(event_id, event_type, actor_display_name, occurred_at, details, comment_body, change_note, from_stage_id, to_stage_id)
  order by timeline.occurred_at desc, timeline.event_type asc, timeline.event_id asc;
end;
$$;

revoke all on function public.get_order_timeline(uuid) from public, anon;
grant execute on function public.get_order_timeline(uuid) to authenticated;

commit;
