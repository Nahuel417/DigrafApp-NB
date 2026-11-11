begin;
set local search_path = '';

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
  incident_internal bigint;
  incident_without_return bigint;
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

  select count(*),
    count(*) filter (where incident.kind = 'complaint_with_return'),
    count(*) filter (where incident.kind = 'internal'),
    count(*) filter (where incident.kind = 'complaint_without_return')
  into incident_total, incident_returns, incident_internal, incident_without_return
  from public.order_incidents incident
  where incident.created_at >= from_instant and incident.created_at < to_exclusive;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code', reasons.code,
    'label', reasons.label,
    'internal', coalesce(counts.internal, 0),
    'without_return', coalesce(counts.without_return, 0),
    'returns', coalesce(counts.returns, 0)
  ) order by reasons.position), '[]'::jsonb)
  into incident_reasons
  from (values
    ('sewing', 'Falla de costura', 1),
    ('design', 'Diseño', 2),
    ('incomplete', 'Pedido incompleto', 3),
    ('calendering', 'Problema en calandrado', 4),
    ('customer_service', 'Atención al público', 5)
  ) reasons(code, label, position)
  left join (
    select selected_reason.reason,
      count(*) filter (where incident.kind = 'internal') as internal,
      count(*) filter (where incident.kind = 'complaint_without_return') as without_return,
      count(*) filter (where incident.kind = 'complaint_with_return') as returns
    from public.order_incidents incident
    cross join lateral (select distinct unnest(incident.reasons) as reason) selected_reason
    where incident.created_at >= from_instant and incident.created_at < to_exclusive
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
    'incidents', jsonb_build_object(
      'total', incident_total,
      'returns', incident_returns,
      'internal', incident_internal,
      'without_return', incident_without_return,
      'reasons', incident_reasons
    ),
    'sales', sales_data,
    'filters', jsonb_build_object(
      'products', filter_products, 'fabrics', filter_fabrics, 'necklines', filter_necklines,
      'upper_patterns', filter_upper_patterns, 'lower_patterns', filter_lower_patterns
    )
  );
end;
$$;

revoke all on function public.get_metrics_dashboard(date, date, uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.get_metrics_dashboard(date, date, uuid, uuid, uuid, uuid, uuid, text) to authenticated;

commit;
