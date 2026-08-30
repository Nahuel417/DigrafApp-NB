drop policy "Admins can read attention and employee profiles" on public.profiles;

create policy "Admins can read admin attention and employee profiles"
on public.profiles
for select
to authenticated
using (
  role in ('admin', 'attention', 'employee')
  and (select public.current_active_role()) = 'admin'
);

create or replace function public.update_managed_profile(
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
      or target_role not in ('attention', 'employee') then
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
