-- Local synthetic fixtures will be added with the vertical slice that owns them.
do $$
begin
  lock table public.workflow_stages in share row exclusive mode;
  if exists (select 1 from public.workflow_stages where requires_design_image) then
    return;
  end if;

  if exists (
    select 1
    from public.workflow_stages
    where lower(btrim(name)) in ('moldería', 'molderia')
  ) then
    raise exception 'Configure the existing Moldería stage by its reviewed ID before seeding.';
  end if;

  insert into public.workflow_stages (code, name, position, requires_design_image)
  values (
    'stage_' || replace(gen_random_uuid()::text, '-', ''),
    'Moldería',
    (select coalesce(max(position), -1) + 1 from public.workflow_stages),
    true
  );
end;
$$;
