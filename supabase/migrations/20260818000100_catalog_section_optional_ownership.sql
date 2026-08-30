alter table public.catalog_sections
  alter column created_by drop not null,
  alter column updated_by drop not null;

alter table public.catalog_sections
  drop constraint if exists catalog_sections_created_by_fkey,
  drop constraint if exists catalog_sections_updated_by_fkey;

alter table public.catalog_sections
  add constraint catalog_sections_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null,
  add constraint catalog_sections_updated_by_fkey
    foreign key (updated_by) references public.profiles(id) on delete set null;
