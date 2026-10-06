create or replace function public.set_first_order_design_image_primary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.order_design_images image
    where image.order_id = new.order_id
  ) then
    new.is_primary := true;
  end if;

  return new;
end;
$$;

revoke all on function public.set_first_order_design_image_primary() from public, anon, authenticated;

create trigger set_first_order_design_image_primary
before insert on public.order_design_images
for each row execute function public.set_first_order_design_image_primary();
