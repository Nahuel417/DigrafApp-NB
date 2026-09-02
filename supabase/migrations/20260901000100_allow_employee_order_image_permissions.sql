begin;

set local search_path = '';

drop policy "Image managers can upload order design objects" on storage.objects;

create policy "Image managers can upload order design objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'order-designs'
  and (select public.current_active_role()) in ('super_admin', 'admin', 'attention', 'employee')
  and name ~ '^orders/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
  and exists (
    select 1
    from public.orders
    where orders.id::text = split_part(name, '/', 2)
  )
);

create or replace function public.m7_assert_image_actor(p_actor_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'La confirmación de imágenes requiere un contexto de servidor autorizado.';
  end if;

  select *
  into actor
  from public.profiles
  where id = p_actor_id
  for update;

  if not found
    or not actor.is_active
    or actor.must_change_password
    or actor.role not in ('super_admin', 'admin', 'attention', 'employee') then
    raise exception 'No tenés permiso para cargar imágenes del pedido.';
  end if;

  return actor;
end;
$$;

revoke all on function public.m7_assert_image_actor(uuid) from public, anon, authenticated;

commit;
