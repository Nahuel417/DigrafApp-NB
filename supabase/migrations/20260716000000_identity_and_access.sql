create type public.app_role as enum (
  'super_admin',
  'admin',
  'attention',
  'employee'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

create policy "Active users can read their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id and is_active);
