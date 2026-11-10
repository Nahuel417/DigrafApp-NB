begin;
set local search_path = '';

create function public.get_metrics_summary(
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
  loose_garments bigint;
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

  select coalesce(sum(movement.amount) filter (where movement.direction = 'income'), 0),
    coalesce(sum(movement.amount) filter (where movement.direction = 'expense'), 0)
  into cash_income, cash_expense
  from public.cash_days day
  cross join lateral public.cash_m10_effective_movements(day.id) movement
  where movement.created_at >= from_instant and movement.created_at < to_exclusive
    and not movement.voided;

  select coalesce(sum(line.quantity), 0)
  into loose_garments
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
  join public.catalog_products product on product.id = coalesce(line.product_id, legacy_product.product_id)
  where payment.reversed_at is null
    and payment.confirmed_at >= from_instant and payment.confirmed_at < to_exclusive
    and line.line_type = 'individual'
    and product.kind = 'garment'
    and (p_product_type is null or line.line_type::text = p_product_type)
    and (p_product_id is null or product.id = p_product_id)
    and (p_fabric_id is null or public.metrics_configuration_matches(line.configuration, p_fabric_id, 'fabric'))
    and (p_neckline_id is null or public.metrics_configuration_matches(line.configuration, p_neckline_id, 'neckline'))
    and (p_upper_pattern_id is null or public.metrics_configuration_matches(line.configuration, p_upper_pattern_id, 'upper_pattern'))
    and (p_lower_pattern_id is null or public.metrics_configuration_matches(line.configuration, p_lower_pattern_id, 'lower_pattern'));

  return jsonb_build_object(
    'generated_at', statement_timestamp(),
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'cash', jsonb_build_object('income', cash_income::text, 'expense', cash_expense::text, 'net', (cash_income - cash_expense)::text),
    'loose_garments', loose_garments
  );
end;
$$;

revoke all on function public.get_metrics_summary(date, date, uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.get_metrics_summary(date, date, uuid, uuid, uuid, uuid, uuid, text) to authenticated;

commit;
