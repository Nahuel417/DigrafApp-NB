begin;

alter table public.order_incidents
  drop constraint order_incidents_reasons_check,
  add constraint order_incidents_reasons_check check (
    cardinality(reasons) between 1 and 5 and array_position(reasons, null) is null
    and reasons <@ array['sewing', 'design', 'incomplete', 'calendering', 'customer_service']::text[]
  );

alter table public.order_incident_events
  drop constraint order_incident_events_reasons_check,
  add constraint order_incident_events_reasons_check check (
    cardinality(reasons) between 1 and 5 and array_position(reasons, null) is null
    and reasons <@ array['sewing', 'design', 'incomplete', 'calendering', 'customer_service']::text[]
  );

-- Change only the reason guard, retaining the existing authorization, locks and audit behavior.
do $$
declare
  definition text := pg_get_functiondef('public.save_order_incident(uuid,uuid,text,text[],integer,uuid)'::regprocedure);
  old_guard text := 'or p_reasons is null or cardinality(p_reasons) not between 1 and 4 or array_position(p_reasons, null) is not null'
    || E'\n    or not (p_reasons <@ array[''sewing'', ''design'', ''incomplete'', ''calendering'']::text[]) then';
  new_guard text := 'or p_reasons is null or cardinality(p_reasons) not between 1 and 5 or array_position(p_reasons, null) is not null'
    || E'\n    or not (p_reasons <@ array[''sewing'', ''design'', ''incomplete'', ''calendering'', ''customer_service'']::text[]) then';
begin
  if position(old_guard in definition) = 0
    or (length(definition) - length(replace(definition, old_guard, ''))) <> length(old_guard) then
    raise exception 'Unexpected incident validation definition; migration requires exactly one matching guard.';
  end if;
  execute replace(definition, old_guard, new_guard);
end;
$$;

notify pgrst, 'reload schema';
commit;
