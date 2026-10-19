begin;

create table public.order_incidents (
  id uuid primary key,
  order_id uuid not null references public.orders(id),
  kind text not null check (kind in ('internal', 'complaint_without_return', 'complaint_with_return')),
  reasons text[] not null check (
    cardinality(reasons) between 1 and 4 and array_position(reasons, null) is null
    and reasons <@ array['sewing', 'design', 'incomplete', 'calendering']::text[]
  ),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp()
);
create index order_incidents_order_created_idx on public.order_incidents(order_id, created_at, id);

-- Each revision is a complete classification snapshot; previous values are never overwritten.
create table public.order_incident_events (
  request_id uuid primary key,
  incident_id uuid not null references public.order_incidents(id),
  version integer not null check (version > 0),
  kind text not null check (kind in ('internal', 'complaint_without_return', 'complaint_with_return')),
  reasons text[] not null check (
    cardinality(reasons) between 1 and 4 and array_position(reasons, null) is null
    and reasons <@ array['sewing', 'design', 'incomplete', 'calendering']::text[]
  ),
  actor_id uuid not null references public.profiles(id),
  occurred_at timestamptz not null default clock_timestamp(),
  unique (incident_id, version)
);
alter table public.order_incidents enable row level security;
alter table public.order_incident_events enable row level security;
revoke all on public.order_incidents, public.order_incident_events from public, anon, authenticated;
grant select on public.order_incidents, public.order_incident_events to authenticated, service_role;

create policy order_incidents_read on public.order_incidents for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active and not p.must_change_password)
  and exists (select 1 from public.orders o where o.id = order_id)
);
create policy order_incident_events_read on public.order_incident_events for select to authenticated using (
  exists (select 1 from public.order_incidents i where i.id = incident_id)
);

create function public.save_order_incident(
  p_order_id uuid, p_incident_id uuid, p_kind text, p_reasons text[], p_expected_version integer, p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles%rowtype;
  target_order public.orders%rowtype;
  incident public.order_incidents%rowtype;
  previous_request public.order_incident_events%rowtype;
  normalized_reasons text[];
  next_version integer;
begin
  actor := public.pr1a_assert_actor(array['super_admin', 'admin', 'attention', 'employee']::public.app_role[]);
  if p_order_id is null or p_incident_id is null or p_request_id is null or p_expected_version is null or p_expected_version < 0
    or p_kind is null or p_kind not in ('internal', 'complaint_without_return', 'complaint_with_return')
    or p_reasons is null or cardinality(p_reasons) not between 1 and 4 or array_position(p_reasons, null) is not null
    or not (p_reasons <@ array['sewing', 'design', 'incomplete', 'calendering']::text[]) then
    raise exception 'La incidencia no es válida. Seleccione un tipo y al menos un motivo.';
  end if;
  if actor.role = 'employee' and (p_kind <> 'internal' or p_expected_version <> 0) then
    raise exception 'No tiene permiso para registrar reclamos ni corregir incidencias.';
  end if;
  select array_agg(distinct reason order by reason) into normalized_reasons from unnest(p_reasons) reason;

  -- Share the order lock with cancellation/purge; an incident cannot race a lifecycle freeze.
  select * into target_order from public.orders where id = p_order_id for update;
  if not found or target_order.lifecycle_state not in ('active', 'archived_delivered')
    or (target_order.lifecycle_state = 'archived_delivered' and actor.role = 'employee') then
    raise exception 'El pedido no está disponible para registrar o corregir incidencias.';
  end if;

  select * into previous_request from public.order_incident_events where request_id = p_request_id;
  if found then
    if previous_request.incident_id <> p_incident_id or previous_request.kind <> p_kind
      or previous_request.reasons <> normalized_reasons or previous_request.version <> p_expected_version + 1
      or previous_request.actor_id <> actor.id
      or not exists (select 1 from public.order_incidents where id = p_incident_id and order_id = p_order_id) then
      raise exception 'La solicitud ya fue utilizada para otra incidencia.';
    end if;
    return jsonb_build_object('id', p_incident_id, 'version', previous_request.version);
  end if;

  select * into incident from public.order_incidents where id = p_incident_id for update;
  if p_expected_version = 0 then
    if found then raise exception 'La incidencia ya existe. Actualice el pedido.'; end if;
    insert into public.order_incidents(id, order_id, kind, reasons)
    values (p_incident_id, p_order_id, p_kind, normalized_reasons);
    next_version := 1;
  else
    if not found or incident.order_id <> p_order_id then raise exception 'La incidencia no está disponible.'; end if;
    if incident.version <> p_expected_version then raise exception 'La incidencia cambió en otra sesión. Actualice el pedido.'; end if;
    if incident.kind = p_kind and incident.reasons = normalized_reasons then raise exception 'No hay cambios para guardar.'; end if;
    next_version := incident.version + 1;
    update public.order_incidents set kind = p_kind, reasons = normalized_reasons, version = next_version where id = p_incident_id;
  end if;
  insert into public.order_incident_events(request_id, incident_id, version, kind, reasons, actor_id)
  values (p_request_id, p_incident_id, next_version, p_kind, normalized_reasons, actor.id);
  return jsonb_build_object('id', p_incident_id, 'version', next_version);
end;
$$;
revoke all on function public.save_order_incident(uuid, uuid, text, text[], integer, uuid) from public, anon, service_role;
grant execute on function public.save_order_incident(uuid, uuid, text, text[], integer, uuid) to authenticated;

comment on table public.order_incidents is 'Classification only; retained with the order tombstone after purge for future metrics.';
comment on table public.order_incident_events is 'Append-only revision snapshots with server-owned technical actor and timestamp.';
notify pgrst, 'reload schema';
commit;
