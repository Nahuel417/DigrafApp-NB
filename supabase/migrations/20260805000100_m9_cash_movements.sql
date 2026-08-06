create table public.cash_days (
  id uuid primary key default gen_random_uuid(),
  operational_date date not null unique,
  opening_balance numeric(14, 2) not null default 0.00 check (opening_balance >= 0),
  opening_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.cash_opening_events (
  id uuid primary key default gen_random_uuid(),
  cash_day_id uuid not null references public.cash_days (id),
  previous_amount numeric(14, 2) not null check (previous_amount >= 0),
  new_amount numeric(14, 2) not null check (new_amount >= 0),
  actor_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 200),
  idempotency_fingerprint text not null check (char_length(idempotency_fingerprint) = 32),
  unique (actor_id, idempotency_key)
);

create table public.cash_expense_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = lower(code) and code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_day_id uuid not null references public.cash_days (id),
  direction text not null check (direction in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount > 0),
  description text,
  expense_category_id uuid references public.cash_expense_categories (id) on delete restrict,
  expense_category_code text,
  expense_category_name text,
  actor_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 200),
  idempotency_fingerprint text not null check (char_length(idempotency_fingerprint) = 32),
  unique (actor_id, idempotency_key),
  constraint cash_movements_description_check check (
    direction = 'expense'
    or char_length(btrim(coalesce(description, ''))) between 2 and 500
  ),
  constraint cash_movements_category_snapshot_check check (
    (direction = 'income'
      and expense_category_id is null
      and expense_category_code is null
      and expense_category_name is null)
    or (direction = 'expense'
      and expense_category_id is not null
      and expense_category_code is not null
      and expense_category_name is not null
      and char_length(btrim(expense_category_code)) between 1 and 100
      and char_length(btrim(expense_category_name)) between 2 and 100)
  )
);

create index cash_opening_events_day_created_at_idx
  on public.cash_opening_events (cash_day_id, created_at desc, id);

create index cash_opening_events_actor_created_at_idx
  on public.cash_opening_events (actor_id, created_at desc, id);

create index cash_movements_day_created_at_idx
  on public.cash_movements (cash_day_id, created_at desc, id);

create index cash_movements_actor_created_at_idx
  on public.cash_movements (actor_id, created_at desc, id);

create index cash_movements_category_created_at_idx
  on public.cash_movements (expense_category_id, created_at desc, id)
  where expense_category_id is not null;

insert into public.cash_expense_categories (code, name)
values
  ('materials_supplies', 'Materiales e insumos'),
  ('wages', 'Sueldos'),
  ('services', 'Servicios'),
  ('maintenance_equipment', 'Mantenimiento y equipos'),
  ('other', 'Otros')
on conflict (code) do nothing;

alter table public.cash_days enable row level security;
alter table public.cash_opening_events enable row level security;
alter table public.cash_expense_categories enable row level security;
alter table public.cash_movements enable row level security;

revoke all on table public.cash_days from anon, authenticated;
revoke all on table public.cash_opening_events from anon, authenticated;
revoke all on table public.cash_expense_categories from anon, authenticated;
revoke all on table public.cash_movements from anon, authenticated;

grant select on table public.cash_days to authenticated;
grant select on table public.cash_opening_events to authenticated;
grant select on table public.cash_expense_categories to authenticated;
grant select on table public.cash_movements to authenticated;

grant select, insert, update, delete on table public.cash_days to service_role;
grant select, insert, update, delete on table public.cash_opening_events to service_role;
grant select, insert, update, delete on table public.cash_expense_categories to service_role;
grant select, insert, update, delete on table public.cash_movements to service_role;

create function public.cash_current_actor_is_operational()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active
      and not must_change_password
  );
$$;

revoke all on function public.cash_current_actor_is_operational() from public, anon, authenticated;
grant execute on function public.cash_current_actor_is_operational() to authenticated;

create policy "Operational users can read current cash days"
on public.cash_days
for select
to authenticated
using ((select public.cash_current_actor_is_operational()));

create policy "Operational users can read cash opening events"
on public.cash_opening_events
for select
to authenticated
using ((select public.cash_current_actor_is_operational()));

create policy "Operational users can read active cash categories"
on public.cash_expense_categories
for select
to authenticated
using (
  is_active
  and (select public.cash_current_actor_is_operational())
);

create policy "Managers can read inactive cash categories"
on public.cash_expense_categories
for select
to authenticated
using (
  not is_active
  and (select public.current_active_role()) in ('super_admin', 'admin')
  and (select public.cash_current_actor_is_operational())
);

create policy "Operational users can read cash movements"
on public.cash_movements
for select
to authenticated
using ((select public.cash_current_actor_is_operational()));

create function public.ensure_current_cash_day()
returns table (
  cash_day_id uuid,
  operational_date date,
  opening_balance numeric(14, 2),
  opening_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_operational_date date;
begin
  current_operational_date := (now() at time zone 'America/Argentina/Cordoba')::date;

  insert into public.cash_days (operational_date)
  values (current_operational_date)
  on conflict (operational_date) do nothing;

  return query
  select
    cash_days.id,
    cash_days.operational_date,
    cash_days.opening_balance,
    cash_days.opening_updated_at
  from public.cash_days
  where cash_days.operational_date = current_operational_date;
end;
$$;

revoke all on function public.ensure_current_cash_day() from public, anon, authenticated;
grant execute on function public.ensure_current_cash_day() to service_role;
