begin;
set local search_path = '';

-- Keep existing sales totals unchanged; both public RPCs resolve this private projection.
alter function public.metrics_sales_projection(timestamptz, timestamptz, uuid, uuid, uuid, uuid, uuid, text)
  rename to metrics_sales_totals;

create function public.metrics_component_attributes(p_configuration jsonb, p_layer text)
returns table(kind text, id text, name text)
language sql immutable set search_path = ''
as $$
  with kinds(kind, aliases) as (values
    ('fabric', array['tela', 'fabric']), ('neckline', array['cuello', 'neckline']),
    ('upper_pattern', array['molde superior', 'upper pattern']),
    ('lower_pattern', array['molde inferior', 'lower pattern'])
  ), recorded as (
    select kinds.kind, selected.value ->> 'value_id' as id, selected.value ->> 'value' as name
    from kinds
    cross join lateral jsonb_array_elements(case when jsonb_typeof(p_configuration -> 'options') = 'array'
      then p_configuration -> 'options' else '[]'::jsonb end) option
    cross join lateral jsonb_array_elements(case when jsonb_typeof(option.value -> 'values') = 'array'
      then option.value -> 'values' else '[]'::jsonb end) selected
    where lower(btrim(option.value ->> 'option_name')) = any(kinds.aliases)
    union all
    select kinds.kind, p_configuration #>> array['legacy_options', kinds.kind, 'id'],
      p_configuration #>> array['legacy_options', kinds.kind, 'name']
    from kinds
    union all
    select kinds.kind, selection.value ->> 'catalog_item_id',
      coalesce(selection.value ->> 'item_name', selection.value ->> 'name')
    from kinds
    cross join lateral jsonb_array_elements(case when jsonb_typeof(p_configuration -> 'legacy_selections') = 'array'
      then p_configuration -> 'legacy_selections' else '[]'::jsonb end) selection
    where selection.value ->> 'selection_key' = kinds.kind
      and selection.value ->> 'catalog_kind' = kinds.kind
  )
  select kind, id, max(name) from recorded
  where id is not null
    and (kind = 'fabric' or (p_layer = 'upper' and kind in ('neckline', 'upper_pattern'))
      or (p_layer = 'lower' and kind = 'lower_pattern'))
  group by kind, id;
$$;

create function public.metrics_sales_projection(
  p_from timestamptz, p_to_exclusive timestamptz, p_product_id uuid,
  p_fabric_id uuid, p_neckline_id uuid, p_upper_pattern_id uuid,
  p_lower_pattern_id uuid, p_product_type text
)
returns jsonb language sql stable set search_path = ''
as $$
  with paid_lines as materialized (
    select line.id, line.line_type::text as line_type, line.quantity, line.configuration,
      product.garment_layer
    from public.order_payments payment
    join public.order_lines line on line.order_id = payment.order_id
    left join lateral (
      select product.id, product.garment_layer
      from public.catalog_products product
      where product.id = line.product_id or (
        line.product_id is null and line.line_type = 'individual' and exists (
          select 1 from jsonb_array_elements(coalesce(line.configuration -> 'legacy_selections', '[]'::jsonb)) selection
          where selection.value ->> 'catalog_item_id' = product.legacy_catalog_item_id::text
            and selection.value ->> 'catalog_kind' = 'garment'
            and selection.value ->> 'selection_key' in ('garment_upper', 'garment_lower')
        ))
      order by product.id limit 1
    ) product on true
    where payment.reversed_at is null
      and payment.confirmed_at >= p_from and payment.confirmed_at < p_to_exclusive
      and (p_product_type is null or line.line_type::text = p_product_type)
      and (p_product_id is null or product.id = p_product_id
        or (line.line_type in ('set', 'premium_set') and (
          line.configuration #>> '{upper,product_id}' = p_product_id::text
          or line.configuration #>> '{lower,product_id}' = p_product_id::text
          or exists (
            select 1 from jsonb_array_elements(coalesce(line.configuration -> 'legacy_selections', '[]'::jsonb)) selection
            join public.catalog_products legacy on legacy.legacy_catalog_item_id::text = selection.value ->> 'catalog_item_id'
            where legacy.id = p_product_id and selection.value ->> 'catalog_kind' = 'garment'
              and selection.value ->> 'selection_key' in ('garment_upper', 'garment_lower')
          )
        )))
      and (p_fabric_id is null or public.metrics_configuration_matches(line.configuration, p_fabric_id, 'fabric'))
      and (p_neckline_id is null or public.metrics_configuration_matches(line.configuration, p_neckline_id, 'neckline'))
      and (p_upper_pattern_id is null or public.metrics_configuration_matches(line.configuration, p_upper_pattern_id, 'upper_pattern'))
      and (p_lower_pattern_id is null or public.metrics_configuration_matches(line.configuration, p_lower_pattern_id, 'lower_pattern'))
  ), components as (
    select line.id, line.quantity, parts.layer,
      case when line.line_type in ('set', 'premium_set') then
        jsonb_build_object('legacy_options', coalesce(line.configuration -> 'legacy_options', '{}'::jsonb),
          'legacy_selections', coalesce(line.configuration -> 'legacy_selections', '[]'::jsonb))
        || coalesce(line.configuration -> parts.layer, '{}'::jsonb)
      else line.configuration end as configuration
    from paid_lines line
    cross join lateral (values ('upper'), ('lower')) parts(layer)
    where line.line_type in ('set', 'premium_set') or coalesce(line.garment_layer::text, 'upper') = parts.layer
  ), attribute_counts as (
    select attribute.kind, attribute.id,
      coalesce(max(item.name), max(value.value), max(attribute.name), 'Sin nombre registrado') as name,
      sum(component.quantity)::bigint as quantity
    from components component
    cross join lateral public.metrics_component_attributes(component.configuration, component.layer) attribute
    left join public.catalog_items item on item.id::text = attribute.id
    left join public.catalog_product_option_values value on value.id::text = attribute.id
    group by attribute.kind, attribute.id
  ), all_counts as (
    select * from attribute_counts
    union all
    select 'product_type', line_type,
      case line_type when 'individual' then 'Prenda suelta' when 'set' then 'Conjunto común'
        when 'premium_set' then 'Conjunto premium' when 'flag' then 'Bandera'
        when 'bag' then 'Bolso' when 'shield' then 'Escudo' end,
      sum(quantity)::bigint
    from paid_lines group by line_type
  ), rankings as (
    select kinds.kind, coalesce(jsonb_agg(jsonb_build_object('id', counts.id, 'name', counts.name,
      'quantity', counts.quantity) order by counts.quantity desc, counts.name, counts.id)
      filter (where counts.id is not null and counts.quantity > 0), '[]'::jsonb) as entries
    from (values ('fabric'), ('neckline'), ('upper_pattern'), ('lower_pattern'), ('product_type')) kinds(kind)
    left join all_counts counts on counts.kind = kinds.kind group by kinds.kind
  )
  select public.metrics_sales_totals(p_from, p_to_exclusive, p_product_id, p_fabric_id,
    p_neckline_id, p_upper_pattern_id, p_lower_pattern_id, p_product_type)
    || jsonb_build_object('rankings', (select jsonb_object_agg(kind, entries) from rankings));
$$;

revoke all on function public.metrics_component_attributes(jsonb, text) from public, anon, authenticated;
revoke all on function public.metrics_sales_projection(timestamptz, timestamptz, uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

commit;
