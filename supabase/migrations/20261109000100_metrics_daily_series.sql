begin;
set local search_path = '';

create or replace function public.metrics_sales_projection(
  p_from timestamptz,
  p_to_exclusive timestamptz,
  p_product_id uuid,
  p_fabric_id uuid,
  p_neckline_id uuid,
  p_upper_pattern_id uuid,
  p_lower_pattern_id uuid,
  p_product_type text
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with paid_lines as materialized (
    select coalesce(line.product_id, legacy_product.product_id) as product_id,
      line.line_type::text as line_type,
      line.quantity,
      line.configuration,
      (payment.confirmed_at at time zone 'America/Argentina/Cordoba')::date as confirmed_date
    from public.order_payments payment
    join public.order_lines line on line.order_id = payment.order_id
    left join lateral (
      select product.id as product_id
      from jsonb_array_elements(
        case when jsonb_typeof(line.configuration -> 'legacy_selections') = 'array'
          then line.configuration -> 'legacy_selections' else '[]'::jsonb end
      ) selection
      join public.catalog_products product
        on product.legacy_catalog_item_id::text = selection.value ->> 'catalog_item_id'
      where selection.value ->> 'catalog_kind' = 'garment'
        and selection.value ->> 'selection_key' in ('garment_upper', 'garment_lower')
      order by selection.value ->> 'selection_key'
      limit 1
    ) legacy_product on line.line_type = 'individual' and line.product_id is null
    where payment.reversed_at is null
      and payment.confirmed_at >= p_from and payment.confirmed_at < p_to_exclusive
      and (p_product_type is null or line.line_type::text = p_product_type)
      and (p_product_id is null or coalesce(line.product_id, legacy_product.product_id) = p_product_id
        or (line.line_type in ('set', 'premium_set') and (
          line.configuration #>> '{upper,product_id}' = p_product_id::text
          or line.configuration #>> '{lower,product_id}' = p_product_id::text
          or exists (
            select 1
            from jsonb_array_elements(
              case when jsonb_typeof(line.configuration -> 'legacy_selections') = 'array'
                then line.configuration -> 'legacy_selections' else '[]'::jsonb end
            ) selection
            join public.catalog_products product
              on product.legacy_catalog_item_id::text = selection.value ->> 'catalog_item_id'
            where product.id = p_product_id
              and selection.value ->> 'catalog_kind' = 'garment'
              and selection.value ->> 'selection_key' in ('garment_upper', 'garment_lower')
          )
        )))
      and (p_fabric_id is null or public.metrics_configuration_matches(line.configuration, p_fabric_id, 'fabric'))
      and (p_neckline_id is null or public.metrics_configuration_matches(line.configuration, p_neckline_id, 'neckline'))
      and (p_upper_pattern_id is null or public.metrics_configuration_matches(line.configuration, p_upper_pattern_id, 'upper_pattern'))
      and (p_lower_pattern_id is null or public.metrics_configuration_matches(line.configuration, p_lower_pattern_id, 'lower_pattern'))
  ), product_sales as (
    select product_id, sum(quantity)::bigint as quantity
    from paid_lines
    where product_id is not null and line_type not in ('set', 'premium_set')
    group by product_id
  ), sales_by_day as (
    select paid_lines.confirmed_date,
      coalesce(sum(paid_lines.quantity) filter (where paid_lines.line_type = 'individual' and product.kind = 'garment'), 0) as loose_garments,
      coalesce(sum(paid_lines.quantity) filter (where paid_lines.line_type = 'set'), 0) as common_sets,
      coalesce(sum(paid_lines.quantity) filter (where paid_lines.line_type = 'premium_set'), 0) as premium_sets
    from paid_lines
    left join public.catalog_products product on product.id = paid_lines.product_id
    group by paid_lines.confirmed_date
  ), selected_days as (
    select date_spine.local_day::date as local_date
    from generate_series(
      (p_from at time zone 'America/Argentina/Cordoba')::date::timestamp,
      (((p_to_exclusive at time zone 'America/Argentina/Cordoba')::date - 1)::timestamp),
      interval '1 day'
    ) as date_spine(local_day)
  ), daily_series as (
    select selected_days.local_date,
      coalesce(sales_by_day.loose_garments, 0) as loose_garments,
      coalesce(sales_by_day.common_sets, 0) as common_sets,
      coalesce(sales_by_day.premium_sets, 0) as premium_sets
    from selected_days
    left join sales_by_day on sales_by_day.confirmed_date = selected_days.local_date
  )
  select jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', product.id, 'name', product.name, 'kind', product.kind,
        'garment_layer', product.garment_layer, 'quantity', coalesce(product_sales.quantity, 0)
      ) order by coalesce(product_sales.quantity, 0) desc, product.name, product.id)
      from public.catalog_products product
      left join product_sales on product_sales.product_id = product.id
      where product.is_active
        and (p_product_id is null or product.id = p_product_id)
        and (p_product_type is null or p_product_type not in ('set', 'premium_set'))
        and (p_product_type is null or product.kind::text = case when p_product_type = 'individual' then 'garment' else p_product_type end)
    ), '[]'::jsonb),
    'loose_garments', coalesce((
      select sum(paid_lines.quantity)
      from paid_lines
      join public.catalog_products product on product.id = paid_lines.product_id
      where paid_lines.line_type = 'individual' and product.kind = 'garment'
    ), 0),
    'sets', jsonb_build_object(
      'common', coalesce((select sum(paid_lines.quantity) from paid_lines where paid_lines.line_type = 'set'), 0),
      'premium', coalesce((select sum(paid_lines.quantity) from paid_lines where paid_lines.line_type = 'premium_set'), 0)
    ),
    'daily_series', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', to_char(daily_series.local_date, 'YYYY-MM-DD'),
        'loose_garments', daily_series.loose_garments,
        'sets', jsonb_build_object('common', daily_series.common_sets, 'premium', daily_series.premium_sets)
      ) order by daily_series.local_date)
      from daily_series
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.metrics_sales_projection(timestamptz, timestamptz, uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.get_metrics_dashboard(
  p_from date,
  p_to date,
  p_product_id uuid,
  p_fabric_id uuid,
  p_neckline_id uuid,
  p_upper_pattern_id uuid,
  p_lower_pattern_id uuid,
  p_product_type text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  from_instant timestamptz;
  to_exclusive timestamptz;
  cash_income numeric;
  cash_expense numeric;
  cash_daily_series jsonb;
  incident_total bigint;
  incident_returns bigint;
  incident_reasons jsonb;
  sales_data jsonb;
  filter_products jsonb;
  filter_fabrics jsonb;
  filter_necklines jsonb;
  filter_upper_patterns jsonb;
  filter_lower_patterns jsonb;
begin
  select * into actor from public.profiles where id = (select auth.uid());
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then
    raise exception 'No tenés permiso para consultar las métricas.';
  end if;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_from > p_to then
    raise exception 'El período de métricas no es válido.';
  end if;
  if p_product_type is not null and p_product_type not in ('individual', 'set', 'premium_set', 'flag', 'bag', 'shield') then
    raise exception 'El tipo de producto no es válido.';
  end if;

  from_instant := p_from::timestamp at time zone 'America/Argentina/Cordoba';
  to_exclusive := (p_to + 1)::timestamp at time zone 'America/Argentina/Cordoba';

  with cash_by_day as materialized (
    select (movement.created_at at time zone 'America/Argentina/Cordoba')::date as local_date,
      coalesce(sum(movement.amount) filter (where movement.direction = 'income'), 0) as income,
      coalesce(sum(movement.amount) filter (where movement.direction = 'expense'), 0) as expense
    from public.cash_days day
    cross join lateral public.cash_m10_effective_movements(day.id) movement
    where movement.created_at >= from_instant and movement.created_at < to_exclusive
      and not movement.voided
    group by local_date
  ), selected_days as (
    select date_spine.local_day::date as local_date
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as date_spine(local_day)
  ), daily_series as (
    select selected_days.local_date,
      coalesce(cash_by_day.income, 0) as income,
      coalesce(cash_by_day.expense, 0) as expense
    from selected_days
    left join cash_by_day on cash_by_day.local_date = selected_days.local_date
  )
  select coalesce(sum(daily_series.income), 0),
    coalesce(sum(daily_series.expense), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'date', to_char(daily_series.local_date, 'YYYY-MM-DD'),
      'income', daily_series.income::text,
      'expense', daily_series.expense::text
    ) order by daily_series.local_date), '[]'::jsonb)
  into cash_income, cash_expense, cash_daily_series
  from daily_series;

  select count(*), count(*) filter (where incident.kind = 'complaint_with_return')
  into incident_total, incident_returns
  from public.order_incidents incident
  where incident.created_at >= from_instant and incident.created_at < to_exclusive;

  select coalesce(jsonb_agg(jsonb_build_object('code', reasons.code, 'label', reasons.label, 'count', coalesce(counts.total, 0)) order by reasons.position), '[]'::jsonb)
  into incident_reasons
  from (values
    ('sewing', 'Falla de costura', 1),
    ('design', 'Diseño', 2),
    ('incomplete', 'Pedido incompleto', 3),
    ('calendering', 'Problema en calandrado', 4),
    ('customer_service', 'Atención al público', 5)
  ) reasons(code, label, position)
  left join (
    select selected_reason.reason, count(*) as total
    from public.order_incidents incident
    cross join lateral (select distinct unnest(incident.reasons) as reason) selected_reason
    where incident.kind = 'complaint_with_return'
      and incident.created_at >= from_instant and incident.created_at < to_exclusive
    group by selected_reason.reason
  ) counts on counts.reason = reasons.code;

  select public.metrics_sales_projection(
    from_instant, to_exclusive, p_product_id, p_fabric_id, p_neckline_id,
    p_upper_pattern_id, p_lower_pattern_id, p_product_type
  ) into sales_data;

  select coalesce(jsonb_agg(jsonb_build_object('id', product.id, 'name', product.name, 'kind', product.kind, 'garment_layer', product.garment_layer) order by product.kind, product.name, product.id), '[]'::jsonb)
  into filter_products from public.catalog_products product where product.is_active;

  select coalesce(jsonb_agg(jsonb_build_object('id', options.id, 'name', options.name) order by options.name, options.id), '[]'::jsonb)
  into filter_fabrics from (
    select item.id, item.name from public.catalog_items item where item.kind = 'fabric' and item.is_active
    union select value.id, value.value from public.catalog_product_options option
      join public.catalog_product_option_values value on value.option_id = option.id
      join public.catalog_products product on product.id = option.product_id
      where product.is_active and option.is_active and value.is_active and lower(btrim(option.name)) in ('tela', 'fabric')
  ) options;
  select coalesce(jsonb_agg(jsonb_build_object('id', options.id, 'name', options.name) order by options.name, options.id), '[]'::jsonb)
  into filter_necklines from (
    select item.id, item.name from public.catalog_items item where item.kind = 'neckline' and item.is_active
    union select value.id, value.value from public.catalog_product_options option
      join public.catalog_product_option_values value on value.option_id = option.id
      join public.catalog_products product on product.id = option.product_id
      where product.is_active and option.is_active and value.is_active and lower(btrim(option.name)) in ('cuello', 'neckline')
  ) options;
  select coalesce(jsonb_agg(jsonb_build_object('id', options.id, 'name', options.name) order by options.name, options.id), '[]'::jsonb)
  into filter_upper_patterns from (
    select item.id, item.name from public.catalog_items item where item.kind = 'upper_pattern' and item.is_active
    union select value.id, value.value from public.catalog_product_options option
      join public.catalog_product_option_values value on value.option_id = option.id
      join public.catalog_products product on product.id = option.product_id
      where product.is_active and option.is_active and value.is_active and lower(btrim(option.name)) in ('molde superior', 'upper pattern')
  ) options;
  select coalesce(jsonb_agg(jsonb_build_object('id', options.id, 'name', options.name) order by options.name, options.id), '[]'::jsonb)
  into filter_lower_patterns from (
    select item.id, item.name from public.catalog_items item where item.kind = 'lower_pattern' and item.is_active
    union select value.id, value.value from public.catalog_product_options option
      join public.catalog_product_option_values value on value.option_id = option.id
      join public.catalog_products product on product.id = option.product_id
      where product.is_active and option.is_active and value.is_active and lower(btrim(option.name)) in ('molde inferior', 'lower pattern')
  ) options;

  return jsonb_build_object(
    'generated_at', statement_timestamp(),
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'cash', jsonb_build_object('income', cash_income::text, 'expense', cash_expense::text, 'net', (cash_income - cash_expense)::text, 'daily_series', cash_daily_series),
    'incidents', jsonb_build_object('total', incident_total, 'returns', incident_returns, 'reasons', incident_reasons),
    'sales', sales_data,
    'filters', jsonb_build_object(
      'products', filter_products, 'fabrics', filter_fabrics, 'necklines', filter_necklines,
      'upper_patterns', filter_upper_patterns, 'lower_patterns', filter_lower_patterns
    )
  );
end;
$$;

commit;
