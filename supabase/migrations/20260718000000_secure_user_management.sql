alter table public.profiles
add column display_name text not null default 'Sin nombre'
check (char_length(display_name) between 2 and 100);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id),
  target_user_id uuid not null references public.profiles (id),
  action text not null check (
    action in (
      'user_created',
      'user_role_changed',
      'user_deactivated',
      'user_activated',
      'password_reset_requested',
      'password_reset_succeeded',
      'password_reset_failed'
    )
  ),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_events_target_user_id_created_at_idx
on public.audit_events (target_user_id, created_at desc);

create index audit_events_actor_id_created_at_idx
on public.audit_events (actor_id, created_at desc);

alter table public.audit_events enable row level security;

revoke all on table public.audit_events from anon, authenticated;
grant select on table public.audit_events to authenticated;
grant select, insert on table public.audit_events to service_role;

create function public.current_active_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid()) and is_active
$$;

revoke all on function public.current_active_role() from public;
grant execute on function public.current_active_role() to authenticated;

drop policy "Active users can read their own profile" on public.profiles;

create policy "Active users can read their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id and is_active);

create policy "Super admins can read all profiles"
on public.profiles
for select
to authenticated
using (
  (select public.current_active_role()) = 'super_admin'
);

create policy "Admins can read attention and employee profiles"
on public.profiles
for select
to authenticated
using (
  role in ('attention', 'employee')
  and (select public.current_active_role()) = 'admin'
);

create policy "Super admins can read audit events"
on public.audit_events
for select
to authenticated
using (
  (select public.current_active_role()) = 'super_admin'
);

create policy "Admins can read managed user audit events"
on public.audit_events
for select
to authenticated
using (
  exists (
    select 1 from public.profiles target
    where target.id = audit_events.target_user_id
      and target.role in ('attention', 'employee')
  )
  and (select public.current_active_role()) = 'admin'
);

create function public.create_managed_profile(
  target_id uuid,
  target_display_name text,
  target_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found or not actor.is_active or actor.role <> 'super_admin' then
    raise exception 'No tenés permiso para crear usuarios.';
  end if;

  insert into public.profiles (id, display_name, role, is_active, must_change_password)
  values (target_id, target_display_name, target_role, true, true);

  insert into public.audit_events (actor_id, target_user_id, action, details)
  values (
    actor.id,
    target_id,
    'user_created',
    jsonb_build_object('display_name', target_display_name, 'role', target_role)
  );
end;
$$;

create function public.update_managed_profile(
  target_id uuid,
  target_role public.app_role,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target public.profiles%rowtype;
  active_super_admin_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('digraf:last-active-super-admin'));

  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found or not actor.is_active then
    raise exception 'No tenés permiso para administrar usuarios.';
  end if;

  select * into target
  from public.profiles
  where id = target_id
  for update;

  if not found then
    raise exception 'El usuario seleccionado no existe.';
  end if;

  if actor.role = 'admin' then
    if target.role not in ('attention', 'employee')
      or target_role not in ('attention', 'employee')
      or not target.is_active then
      raise exception 'No tenés permiso para realizar este cambio.';
    end if;
  elsif actor.role = 'super_admin' then
    if target.role = 'super_admin'
      and (target_role <> 'super_admin' or not target_is_active) then
      select count(*) into active_super_admin_count
      from public.profiles
      where role = 'super_admin' and is_active;

      if active_super_admin_count <= 1 then
        raise exception 'Debe existir al menos un Super admin activo.';
      end if;
    end if;
  else
    raise exception 'No tenés permiso para administrar usuarios.';
  end if;

  update public.profiles
  set role = target_role, is_active = target_is_active, updated_at = now()
  where id = target.id;

  if target.role <> target_role then
    insert into public.audit_events (actor_id, target_user_id, action, details)
    values (
      actor.id,
      target.id,
      'user_role_changed',
      jsonb_build_object('previous_role', target.role, 'next_role', target_role)
    );
  end if;

  if target.is_active <> target_is_active then
    insert into public.audit_events (actor_id, target_user_id, action, details)
    values (
      actor.id,
      target.id,
      case when target_is_active then 'user_activated' else 'user_deactivated' end,
      jsonb_build_object('previous_is_active', target.is_active, 'next_is_active', target_is_active)
    );
  end if;
end;
$$;

create function public.prepare_password_reset(target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target public.profiles%rowtype;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found or not actor.is_active or actor.role <> 'super_admin' then
    raise exception 'No tenés permiso para restablecer contraseñas.';
  end if;

  select * into target
  from public.profiles
  where id = target_id
  for update;

  if not found then
    raise exception 'El usuario seleccionado no existe.';
  end if;

  update public.profiles
  set must_change_password = true, updated_at = now()
  where id = target.id;

  insert into public.audit_events (actor_id, target_user_id, action)
  values (actor.id, target.id, 'password_reset_requested');
end;
$$;

create function public.record_password_reset_result(target_id uuid, succeeded boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid())
  for update;

  if not found or not actor.is_active or actor.role <> 'super_admin' then
    raise exception 'No tenés permiso para restablecer contraseñas.';
  end if;

  insert into public.audit_events (actor_id, target_user_id, action)
  values (
    actor.id,
    target_id,
    case when succeeded then 'password_reset_succeeded' else 'password_reset_failed' end
  );
end;
$$;

revoke all on function public.create_managed_profile(uuid, text, public.app_role) from public;
revoke all on function public.update_managed_profile(uuid, public.app_role, boolean) from public;
revoke all on function public.prepare_password_reset(uuid) from public;
revoke all on function public.record_password_reset_result(uuid, boolean) from public;

grant execute on function public.create_managed_profile(uuid, text, public.app_role) to authenticated;
grant execute on function public.update_managed_profile(uuid, public.app_role, boolean) to authenticated;
grant execute on function public.prepare_password_reset(uuid) to authenticated;
grant execute on function public.record_password_reset_result(uuid, boolean) to authenticated;
