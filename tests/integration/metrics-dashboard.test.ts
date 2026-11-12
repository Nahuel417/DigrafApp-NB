import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseMetricsDashboard, parseMetricsSales, parseMetricsSummary } from "../../src/features/metrics/contract";

const psqlArgs = ["exec", "-i", "supabase_db_DigrafApp-NB", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];

function sql(sqlText: string) {
  return execFileSync("docker", psqlArgs, { input: sqlText, encoding: "utf8", timeout: 20000 }).trim();
}

function fixture() {
  const ids = Object.fromEntries([
    "actor", "section", "shirt", "shorts", "unused", "cashDay", "income", "expense", "voidedExpense",
    "individualOrder", "commonOrder", "premiumOrder", "reversedOrder", "legacyIndividualOrder", "legacySetOrder",
    "individualPayment", "commonPayment", "premiumPayment", "reversedPayment", "legacyIndividualPayment", "legacySetPayment",
    "returnIncident", "internalIncident", "withoutReturnIncident", "legacyUpper", "legacyLower", "legacyFabric",
    "legacyNeckline", "legacyUpperPattern", "legacyLowerPattern", "legacyOptionsFabric", "modernOption", "modernValue",
  ].map((key) => [key, randomUUID()]));
  const q = (key: keyof typeof ids) => `'${ids[key]}'`;
  const order = (key: "individualOrder" | "commonOrder" | "premiumOrder" | "reversedOrder" | "legacyIndividualOrder" | "legacySetOrder", kind: string, qty: number) => `
    insert into public.orders (id, customer_name, client_name, team_name, phone, quantity, order_type,
      order_date, promised_delivery_date, current_stage_id, created_by, idempotency_key, idempotency_fingerprint)
    select ${q(key)}, 'Synthetic metrics order', 'Synthetic', 'Metrics', '000', ${qty}, '${kind}',
      date '2099-12-31', date '2099-12-31', stage.id, ${q("actor")}, '${key}', md5('${key}')
    from public.workflow_stages stage where stage.code = 'received';`;
  const payment = (key: "individualPayment" | "commonPayment" | "premiumPayment" | "reversedPayment" | "legacyIndividualPayment" | "legacySetPayment", orderKey: "individualOrder" | "commonOrder" | "premiumOrder" | "reversedOrder" | "legacyIndividualOrder" | "legacySetOrder", reversed: boolean) => `
    insert into public.order_payments (id, order_id, amount, cash_movement_id, actor_id, confirmed_at, reversed_at, idempotency_key, fingerprint)
    values (${q(key)}, ${q(orderKey)}, 0, null, ${q("actor")}, timestamp '2099-12-31 12:00' at time zone 'America/Argentina/Cordoba', ${reversed ? "timestamp '2099-12-31 13:00' at time zone 'America/Argentina/Cordoba'" : "null"}, '${key}', md5('${key}'));`;

  const setup = `
    begin;
    insert into auth.users (id, email) values (${q("actor")}, '${ids.actor}@example.test');
    insert into public.profiles (id, display_name, role, is_active, must_change_password)
      values (${q("actor")}, 'Synthetic metrics admin', 'admin', true, false);
    insert into public.catalog_sections (id, code, name, created_by, updated_by)
      values (${q("section")}, 'metrics_${ids.section.replaceAll("-", "")}', 'Metrics fixture', ${q("actor")}, ${q("actor")});
    insert into public.catalog_products (id, section_id, kind, garment_layer, name, created_by, updated_by)
     values (${q("shirt")}, ${q("section")}, 'garment', 'upper', 'Synthetic shirt', ${q("actor")}, ${q("actor")}),
       (${q("shorts")}, ${q("section")}, 'garment', 'lower', 'Synthetic shorts', ${q("actor")}, ${q("actor")}),
       (${q("unused")}, ${q("section")}, 'garment', 'upper', 'Synthetic zero-sales shirt', ${q("actor")}, ${q("actor")});
    insert into public.catalog_items (id, kind, garment_layer, name, created_by, updated_by)
      values (${q("legacyUpper")}, 'garment', 'upper', 'Legacy upper ${ids.legacyUpper.slice(0, 8)}', ${q("actor")}, ${q("actor")}),
        (${q("legacyLower")}, 'garment', 'lower', 'Legacy lower ${ids.legacyLower.slice(0, 8)}', ${q("actor")}, ${q("actor")}),
        (${q("legacyFabric")}, 'fabric', null, 'Legacy fabric ${ids.legacyFabric.slice(0, 8)}', ${q("actor")}, ${q("actor")}),
        (${q("legacyNeckline")}, 'neckline', null, 'Legacy neckline ${ids.legacyNeckline.slice(0, 8)}', ${q("actor")}, ${q("actor")}),
        (${q("legacyUpperPattern")}, 'upper_pattern', null, 'Legacy upper pattern ${ids.legacyUpperPattern.slice(0, 8)}', ${q("actor")}, ${q("actor")}),
        (${q("legacyLowerPattern")}, 'lower_pattern', null, 'Legacy lower pattern ${ids.legacyLowerPattern.slice(0, 8)}', ${q("actor")}, ${q("actor")}),
        (${q("legacyOptionsFabric")}, 'fabric', null, 'Legacy option fabric ${ids.legacyOptionsFabric.slice(0, 8)}', ${q("actor")}, ${q("actor")});
    insert into public.catalog_product_options (id, product_id, code, name, selection_mode, created_by, updated_by)
      values (${q("modernOption")}, ${q("shirt")}, 'metrics_fabric', 'Tela', 'single', ${q("actor")}, ${q("actor")});
    insert into public.catalog_product_option_values (id, option_id, value, created_by, updated_by)
      values (${q("modernValue")}, ${q("modernOption")}, 'Synthetic modern fabric', ${q("actor")}, ${q("actor")});
    ${order("individualOrder", "individual", 3)}
    ${order("commonOrder", "set", 2)}
    ${order("premiumOrder", "set", 1)}
    ${order("reversedOrder", "individual", 7)}
    ${order("legacyIndividualOrder", "individual", 4)}
    ${order("legacySetOrder", "set", 5)}
    insert into public.order_catalog_items (order_id, catalog_item_id, selection_key, catalog_kind, garment_layer, item_name)
      values (${q("legacyIndividualOrder")}, ${q("legacyUpper")}, 'garment_upper', 'garment', 'upper', 'Legacy upper'),
        (${q("legacyIndividualOrder")}, ${q("legacyFabric")}, 'fabric', 'fabric', null, 'Legacy fabric'),
        (${q("legacyIndividualOrder")}, ${q("legacyNeckline")}, 'neckline', 'neckline', null, 'Legacy neckline'),
        (${q("legacyIndividualOrder")}, ${q("legacyUpperPattern")}, 'upper_pattern', 'upper_pattern', null, 'Legacy upper pattern'),
        (${q("legacySetOrder")}, ${q("legacyUpper")}, 'garment_upper', 'garment', 'upper', 'Legacy upper'),
        (${q("legacySetOrder")}, ${q("legacyLower")}, 'garment_lower', 'garment', 'lower', 'Legacy lower'),
        (${q("legacySetOrder")}, ${q("legacyFabric")}, 'fabric', 'fabric', null, 'Legacy fabric'),
        (${q("legacySetOrder")}, ${q("legacyNeckline")}, 'neckline', 'neckline', null, 'Legacy neckline'),
        (${q("legacySetOrder")}, ${q("legacyUpperPattern")}, 'upper_pattern', 'upper_pattern', null, 'Legacy upper pattern'),
        (${q("legacySetOrder")}, ${q("legacyLowerPattern")}, 'lower_pattern', 'lower_pattern', null, 'Legacy lower pattern');
    insert into public.order_lines (order_id, position, line_type, product_id, product_name_snapshot, quantity, configuration)
      values (${q("individualOrder")}, 0, 'individual', ${q("shirt")}, 'Synthetic shirt', 3,
          jsonb_build_object(
            'legacy_options', jsonb_build_object('fabric', jsonb_build_object('id', ${q("legacyOptionsFabric")}, 'name', 'Synthetic legacy option fabric')),
            'options', jsonb_build_array(jsonb_build_object('option_id', ${q("modernOption")}, 'option_name', 'Tela', 'selection_mode', 'single',
              'values', jsonb_build_array(jsonb_build_object('value_id', ${q("modernValue")}, 'value', 'Synthetic modern fabric'))))
          )),
        (${q("commonOrder")}, 0, 'set', null, 'Conjunto', 2,
          jsonb_build_object(
            'upper', jsonb_build_object('product_id', ${q("shirt")}, 'options', jsonb_build_array(jsonb_build_object(
              'option_id', ${q("modernOption")}, 'option_name', 'Tela', 'selection_mode', 'single',
              'values', jsonb_build_array(jsonb_build_object('value_id', ${q("modernValue")}, 'value', 'Synthetic modern fabric'))
            ))),
            'lower', jsonb_build_object('product_id', ${q("shorts")}))),
        (${q("premiumOrder")}, 0, 'premium_set', null, 'Conjunto premium', 1,
          jsonb_build_object('upper', jsonb_build_object('product_id', ${q("shirt")}), 'lower', jsonb_build_object('product_id', ${q("shorts")}))),
        (${q("reversedOrder")}, 0, 'individual', ${q("shirt")}, 'Synthetic shirt', 7, '{}'::jsonb),
        (${q("legacyIndividualOrder")}, 0, 'individual', null, 'Legacy individual', 4,
          jsonb_build_object('legacy_selections', jsonb_build_array(
            jsonb_build_object('selection_key', 'garment_upper', 'catalog_item_id', ${q("legacyUpper")}, 'catalog_kind', 'garment', 'garment_layer', 'upper'),
            jsonb_build_object('selection_key', 'fabric', 'catalog_item_id', ${q("legacyFabric")}, 'catalog_kind', 'fabric', 'garment_layer', null),
            jsonb_build_object('selection_key', 'neckline', 'catalog_item_id', ${q("legacyNeckline")}, 'catalog_kind', 'neckline', 'garment_layer', null),
            jsonb_build_object('selection_key', 'upper_pattern', 'catalog_item_id', ${q("legacyUpperPattern")}, 'catalog_kind', 'upper_pattern', 'garment_layer', null)
          ))),
        (${q("legacySetOrder")}, 0, 'set', null, 'Legacy set', 5,
          jsonb_build_object('legacy_selections', jsonb_build_array(
            jsonb_build_object('selection_key', 'garment_upper', 'catalog_item_id', ${q("legacyUpper")}, 'catalog_kind', 'garment', 'garment_layer', 'upper'),
            jsonb_build_object('selection_key', 'garment_lower', 'catalog_item_id', ${q("legacyLower")}, 'catalog_kind', 'garment', 'garment_layer', 'lower'),
            jsonb_build_object('selection_key', 'fabric', 'catalog_item_id', ${q("legacyFabric")}, 'catalog_kind', 'fabric', 'garment_layer', null),
            jsonb_build_object('selection_key', 'neckline', 'catalog_item_id', ${q("legacyNeckline")}, 'catalog_kind', 'neckline', 'garment_layer', null),
            jsonb_build_object('selection_key', 'upper_pattern', 'catalog_item_id', ${q("legacyUpperPattern")}, 'catalog_kind', 'upper_pattern', 'garment_layer', null),
            jsonb_build_object('selection_key', 'lower_pattern', 'catalog_item_id', ${q("legacyLowerPattern")}, 'catalog_kind', 'lower_pattern', 'garment_layer', null)
          )));
    ${payment("individualPayment", "individualOrder", false)}
    ${payment("commonPayment", "commonOrder", false)}
    ${payment("premiumPayment", "premiumOrder", false)}
    ${payment("reversedPayment", "reversedOrder", true)}
    ${payment("legacyIndividualPayment", "legacyIndividualOrder", false)}
    ${payment("legacySetPayment", "legacySetOrder", false)}
    insert into public.cash_days (id, operational_date, opening_balance) values (${q("cashDay")}, date '2099-12-31', 500.00);
    insert into public.cash_movements (id, cash_day_id, direction, amount, expense_category_id, expense_category_code,
      expense_category_name, actor_id, created_at, idempotency_key, idempotency_fingerprint)
      values (${q("income")}, ${q("cashDay")}, 'income', 9.00, null, null, null, ${q("actor")}, timestamp '2099-12-31 12:00' at time zone 'America/Argentina/Cordoba', 'metrics-income', md5('metrics-income')),
        (${q("expense")}, ${q("cashDay")}, 'expense', 3.21, (select id from public.cash_expense_categories where code = 'other'), 'other', 'Otros', ${q("actor")}, timestamp '2099-12-31 12:00' at time zone 'America/Argentina/Cordoba', 'metrics-expense', md5('metrics-expense')),
        (${q("voidedExpense")}, ${q("cashDay")}, 'expense', 5.67, (select id from public.cash_expense_categories where code = 'other'), 'other', 'Otros', ${q("actor")}, timestamp '2099-12-31 12:00' at time zone 'America/Argentina/Cordoba', 'metrics-voided-expense', md5('metrics-voided-expense'));
    insert into public.cash_movement_events (cash_day_id, movement_id, event_type, previous_state, new_state, reason, actor_id, idempotency_key, idempotency_fingerprint)
      values (${q("cashDay")}, ${q("income")}, 'correction', '{"direction":"income","amount":"9.00"}', '{"amount":"12.34"}', 'Synthetic correction', ${q("actor")}, 'metrics-correction', md5('metrics-correction')),
        (${q("cashDay")}, ${q("voidedExpense")}, 'void', '{"direction":"expense","amount":"5.67"}', null, 'Synthetic void', ${q("actor")}, 'metrics-void', md5('metrics-void'));
    insert into public.order_incidents (id, order_id, kind, reasons, created_at)
      values (${q("returnIncident")}, ${q("individualOrder")}, 'complaint_with_return', array['sewing','design'], timestamp '2099-12-31 12:00' at time zone 'America/Argentina/Cordoba'),
        (${q("internalIncident")}, ${q("commonOrder")}, 'internal', array['sewing'], timestamp '2099-12-31 12:00' at time zone 'America/Argentina/Cordoba'),
        (${q("withoutReturnIncident")}, ${q("premiumOrder")}, 'complaint_without_return', array['design'], timestamp '2099-12-31 12:00' at time zone 'America/Argentina/Cordoba');
    create function pg_temp.reject(statement text) returns void language plpgsql as $$ begin
      begin execute statement; exception when others then return; end;
      raise exception 'Expected metrics permission rejection: %', statement;
    end $$;
    select set_config('request.jwt.claim.sub', ${q("actor")}, true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
  `;

  const call = (filters: { productId?: string; productIdSql?: string; fabricId?: string; necklineId?: string; upperPatternId?: string; lowerPatternId?: string; productType?: string } = {}, from = "2099-12-31", to = "2099-12-31") => {
    const uuid = (value?: string) => value ? `'${value}'::uuid` : "null::uuid";
    return `select public.get_metrics_dashboard(date '${from}', date '${to}', ${filters.productIdSql ?? uuid(filters.productId)},
      ${uuid(filters.fabricId)}, ${uuid(filters.necklineId)}, ${uuid(filters.upperPatternId)}, ${uuid(filters.lowerPatternId)}, ${filters.productType ? `'${filters.productType}'` : "null"});`;
  };
  const salesCall = (filters: { productId?: string; fabricId?: string; necklineId?: string; upperPatternId?: string; lowerPatternId?: string; productType?: string } = {}, from = "2099-12-31", to = "2099-12-31") => {
    const uuid = (value?: string) => value ? `'${value}'::uuid` : "null::uuid";
    return `select public.get_metrics_sales(date '${from}', date '${to}', ${uuid(filters.productId)},
      ${uuid(filters.fabricId)}, ${uuid(filters.necklineId)}, ${uuid(filters.upperPatternId)}, ${uuid(filters.lowerPatternId)}, ${filters.productType ? `'${filters.productType}'` : "null"});`;
  };
  const summaryCall = (filters: { productId?: string; fabricId?: string; necklineId?: string; upperPatternId?: string; lowerPatternId?: string; productType?: string } = {}, from = "2099-12-31", to = "2099-12-31") => {
    const uuid = (value?: string) => value ? `'${value}'::uuid` : "null::uuid";
    return `select public.get_metrics_summary(date '${from}', date '${to}', ${uuid(filters.productId)},
      ${uuid(filters.fabricId)}, ${uuid(filters.necklineId)}, ${uuid(filters.upperPatternId)}, ${uuid(filters.lowerPatternId)}, ${filters.productType ? `'${filters.productType}'` : "null"});`;
  };

  return { ids, setup, call, salesCall, summaryCall };
}

describe("metrics dashboard RPC", () => {
  it("denies direct helper execution while allowing the guarded sales RPC", () => {
    const data = fixture();
    const rows = sql(`${data.setup}
      select pg_temp.reject($probe$select public.metrics_component_attributes('{}'::jsonb, 'upper')$probe$);
      select pg_temp.reject($probe$select public.metrics_sales_projection(now(), now(), null, null, null, null, null, null)$probe$);
      select pg_temp.reject($probe$select public.metrics_sales_totals(now(), now(), null, null, null, null, null, null)$probe$);
      ${data.salesCall()} rollback;`).split(/\r?\n/).filter((line) => line.startsWith("{"));
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!).rankings).toBeDefined();
  });
  it("ranks recorded attributes by paid component quantities, including shared legacy set fabric", () => {
    const data = fixture();
    const rows = sql(`${data.setup} ${data.salesCall()} ${data.salesCall({ productType: "set" })} ${data.salesCall({}, "2100-01-01", "2100-01-01")} rollback;`)
      .split(/\r?\n/).filter((line) => line.startsWith("{"));
    const sales = JSON.parse(rows[0]!);
    expect(sales.rankings.fabric.find((item: { id: string }) => item.id === data.ids.legacyFabric).quantity).toBe(14);
    expect(sales.rankings.fabric.find((item: { id: string }) => item.id === data.ids.modernValue).quantity).toBe(5);
    expect(sales.rankings.neckline.find((item: { id: string }) => item.id === data.ids.legacyNeckline).quantity).toBe(9);
    expect(sales.rankings.upper_pattern.find((item: { id: string }) => item.id === data.ids.legacyUpperPattern).quantity).toBe(9);
    expect(sales.rankings.lower_pattern.find((item: { id: string }) => item.id === data.ids.legacyLowerPattern).quantity).toBe(5);
    expect(sales.rankings.product_type).toEqual([
      { id: "set", name: "Conjunto común", quantity: 7 },
      { id: "individual", name: "Prenda suelta", quantity: 7 },
      { id: "premium_set", name: "Conjunto premium", quantity: 1 },
    ]);
    const sets = JSON.parse(rows[1]!);
    expect(sets.rankings.fabric.find((item: { id: string }) => item.id === data.ids.legacyFabric).quantity).toBe(10);
    expect(JSON.parse(rows[2]!).rankings.fabric).toEqual([]);
    expect(parseMetricsSales(sales).rankings).toEqual(sales.rankings);
  });

  it("counts modern set parts separately without duplicating repeated selections and preserves existing totals", () => {
    const data = fixture();
    const rows = sql(`${data.setup}
      reset role;
      update public.order_lines set configuration = jsonb_set(configuration, '{lower,options}',
        (configuration #> '{upper,options}') || (configuration #> '{upper,options}'))
      where order_id = '${data.ids.commonOrder}';
      set local role authenticated;
      ${data.salesCall({ fabricId: data.ids.modernValue })}
      ${data.call({ fabricId: data.ids.modernValue })}
      reset role;
      select (public.metrics_sales_projection('2099-12-31 03:00+00', '2100-01-01 03:00+00', null, null, null, null, null, null) - 'rankings')
        = public.metrics_sales_totals('2099-12-31 03:00+00', '2100-01-01 03:00+00', null, null, null, null, null, null);
      rollback;`).split(/\r?\n/);
    const results = rows.filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
    expect(results[0].rankings.fabric.find((item: { id: string }) => item.id === data.ids.modernValue).quantity).toBe(7);
    expect(results[1].sales.rankings).toEqual(results[0].rankings);
    expect(rows).toContain("t");
  });
  it("returns only compact guarded summary totals matching the existing aggregates", () => {
    const data = fixture();
    const results = sql(`${data.setup}
      ${data.summaryCall()}
      ${data.call()}
      ${data.summaryCall({ fabricId: data.ids.legacyFabric })}
      ${data.summaryCall({ fabricId: data.ids.modernValue })}
      ${data.summaryCall({ productType: "set" })}
      reset role;
      update public.profiles set role = 'attention' where id = '${data.ids.actor}';
      set local role authenticated;
      select pg_temp.reject($metrics$select public.get_metrics_summary(date '2099-12-31', date '2099-12-31', null, null, null, null, null, null)$metrics$);
      reset role;
      update public.profiles set role = 'employee' where id = '${data.ids.actor}';
      set local role authenticated;
      select pg_temp.reject($metrics$select public.get_metrics_summary(date '2099-12-31', date '2099-12-31', null, null, null, null, null, null)$metrics$);
      reset role;
      update public.profiles set role = 'admin', is_active = false where id = '${data.ids.actor}';
      set local role authenticated;
      select pg_temp.reject($metrics$select public.get_metrics_summary(date '2099-12-31', date '2099-12-31', null, null, null, null, null, null)$metrics$);
      reset role;
      update public.profiles set is_active = true, must_change_password = true where id = '${data.ids.actor}';
      set local role authenticated;
      select pg_temp.reject($metrics$select public.get_metrics_summary(date '2099-12-31', date '2099-12-31', null, null, null, null, null, null)$metrics$);
      reset role;
      set local role anon;
      select pg_temp.reject($metrics$select public.get_metrics_summary(date '2099-12-31', date '2099-12-31', null, null, null, null, null, null)$metrics$);
      reset role;
      update public.profiles set role = 'admin', must_change_password = false where id = '${data.ids.actor}';
      set local role authenticated;
      select pg_temp.reject($metrics$select public.get_metrics_summary(date '2100-01-01', date '2099-12-31', null, null, null, null, null, null)$metrics$);
      select pg_temp.reject($metrics$select public.get_metrics_summary(null, date '2099-12-31', null, null, null, null, null, null)$metrics$);
      select pg_temp.reject($metrics$select public.get_metrics_summary(date '2099-12-31', date '2099-12-31', null, null, null, null, null, 'invalid')$metrics$);
      rollback;`);
    const rows = results.split(/\r?\n/).filter((line) => line.startsWith("{"));
    expect(rows).toHaveLength(5);

    const summary = parseMetricsSummary(JSON.parse(rows[0]!));
    const full = parseMetricsDashboard(JSON.parse(rows[1]!));
    expect(summary.cash).toEqual({ income: full.cash.income, expense: full.cash.expense, net: full.cash.net });
    expect(summary.loose_garments).toBe(full.sales.loose_garments);
    expect(Object.keys(JSON.parse(rows[0]!)).sort()).toEqual(["cash", "generated_at", "loose_garments", "period"]);
    expect(summary.loose_garments).toBe(7);

    const legacyFiltered = parseMetricsSummary(JSON.parse(rows[2]!));
    expect(legacyFiltered.cash).toEqual(summary.cash);
    expect(legacyFiltered.loose_garments).toBe(4);
    expect(parseMetricsSummary(JSON.parse(rows[3]!)).loose_garments).toBe(3);
    expect(parseMetricsSummary(JSON.parse(rows[4]!)).loose_garments).toBe(0);
  });

  it("aggregates only retained paid lines and effective cash/incidents, with exact role boundaries", () => {
    const data = fixture();
    const results = sql(`${data.setup}
      ${data.call()}
      ${data.call({ fabricId: data.ids.legacyFabric })}
      ${data.call({ necklineId: data.ids.legacyNeckline })}
      ${data.call({ upperPatternId: data.ids.legacyUpperPattern })}
      ${data.call({ lowerPatternId: data.ids.legacyLowerPattern })}
      ${data.call({ productIdSql: `(select id from public.catalog_products where legacy_catalog_item_id = '${data.ids.legacyUpper}')` })}
      ${data.call({ fabricId: data.ids.legacyOptionsFabric })}
      ${data.call({ fabricId: data.ids.modernValue })}
      ${data.salesCall({ fabricId: data.ids.legacyFabric })}
      reset role;
      update public.profiles set role = 'super_admin' where id = '${data.ids.actor}';
      set local role authenticated;
      ${data.call({ productType: "set" })}
      reset role;
      update public.profiles set role = 'attention' where id = '${data.ids.actor}';
      set local role authenticated;
      select pg_temp.reject($metrics$select public.get_metrics_dashboard(date '2099-12-31', date '2099-12-31', null, null, null, null, null, null)$metrics$);
      reset role;
      update public.profiles set role = 'employee' where id = '${data.ids.actor}';
      set local role authenticated;
      select pg_temp.reject($metrics$select public.get_metrics_dashboard(date '2099-12-31', date '2099-12-31', null, null, null, null, null, null)$metrics$);
      reset role;
      update public.profiles set role = 'admin', is_active = false where id = '${data.ids.actor}';
      set local role authenticated;
      select pg_temp.reject($metrics$select public.get_metrics_dashboard(date '2099-12-31', date '2099-12-31', null, null, null, null, null, null)$metrics$);
      reset role;
      update public.profiles set is_active = true, must_change_password = true where id = '${data.ids.actor}';
      set local role authenticated;
      select pg_temp.reject($metrics$select public.get_metrics_dashboard(date '2099-12-31', date '2099-12-31', null, null, null, null, null, null)$metrics$);
      rollback;`);
    const rows = results.split(/\r?\n/).filter((line) => line.startsWith("{"));
    expect(rows).toHaveLength(10);
    expect(() => parseMetricsDashboard(JSON.parse(rows[0]!))).not.toThrow();
    const metrics = JSON.parse(rows[0]!) as {
      cash: { income: string; expense: string; net: string };
      incidents: { total: number; returns: number; internal: number; without_return: number; reasons: Array<{ code: string; internal: number; without_return: number; returns: number }> };
      sales: { loose_garments: number; sets: { common: number; premium: number }; products: Array<{ id: string; quantity: number }> };
    };
    expect(metrics.cash).toEqual({
      income: "12.34",
      expense: "3.21",
      net: "9.13",
      daily_series: [{ date: "2099-12-31", income: "12.34", expense: "3.21" }],
    });
    expect(metrics.incidents.total).toBe(3);
    expect(metrics.incidents.returns).toBe(1);
    expect(metrics.incidents.internal).toBe(1);
    expect(metrics.incidents.without_return).toBe(1);
    expect(metrics.incidents.reasons.find(({ code }) => code === "sewing")).toMatchObject({ internal: 1, without_return: 0, returns: 1 });
    expect(metrics.incidents.reasons.find(({ code }) => code === "design")).toMatchObject({ internal: 0, without_return: 1, returns: 1 });
    expect(metrics.incidents.reasons.find(({ code }) => code === "customer_service")).toMatchObject({ internal: 0, without_return: 0, returns: 0 });
    expect(metrics.sales.loose_garments).toBe(7);
    expect(metrics.sales.sets).toEqual({ common: 7, premium: 1 });
    expect(metrics.sales.products.find((product) => product.id === data.ids.shirt)?.quantity).toBe(3);
    expect(metrics.sales.products.find((product) => product.id === data.ids.unused)?.quantity).toBe(0);

    for (const row of rows.slice(1, 5)) {
      const historical = JSON.parse(row!) as { sales: { loose_garments: number; sets: { common: number } } };
      expect(historical.sales.loose_garments).toBe(row === rows[4] ? 0 : 4);
      expect(historical.sales.sets.common).toBe(5);
    }
    const productFiltered = JSON.parse(rows[5]!) as { sales: { loose_garments: number; sets: { common: number }; products: Array<{ id: string; quantity: number }> } };
    expect(productFiltered.sales.loose_garments).toBe(4);
    expect(productFiltered.sales.sets.common).toBe(5);
    expect(productFiltered.sales.products[0]).toMatchObject({ name: expect.stringContaining("Legacy upper"), quantity: 4 });

    const legacyOptionsFiltered = JSON.parse(rows[6]!) as { sales: { loose_garments: number } };
    expect(legacyOptionsFiltered.sales.loose_garments).toBe(3);
    const modernFiltered = JSON.parse(rows[7]!) as { sales: { loose_garments: number; sets: { common: number } } };
    expect(modernFiltered.sales.loose_garments).toBe(3);
    expect(modernFiltered.sales.sets.common).toBe(2);

    const salesOnly = JSON.parse(rows[8]!) as Record<string, unknown> & { loose_garments: number; sets: { common: number } };
    expect(salesOnly.loose_garments).toBe(4);
    expect(salesOnly.sets.common).toBe(5);
    expect(salesOnly).not.toHaveProperty("cash");
    expect(salesOnly).not.toHaveProperty("incidents");
    expect(salesOnly).not.toHaveProperty("filters");
    const superAdminFiltered = JSON.parse(rows[9]!) as { sales: { sets: { common: number; premium: number } } };
    expect(superAdminFiltered.sales.sets).toEqual({ common: 7, premium: 0 });
  });

  it("returns inclusive Argentina daily series with zero-filled days and filter-scoped active sales", () => {
    const data = fixture();
    const results = sql(`${data.setup}
      reset role;
      update public.order_payments set confirmed_at = timestamp '2099-12-30 23:59:59' at time zone 'America/Argentina/Cordoba' where id = '${data.ids.individualPayment}';
       update public.order_payments set confirmed_at = timestamp '2100-01-01 00:00:00' at time zone 'America/Argentina/Cordoba' where id = '${data.ids.commonPayment}';
       update public.order_payments set confirmed_at = timestamp '2100-01-01 00:00:01' at time zone 'America/Argentina/Cordoba' where id = '${data.ids.premiumPayment}';
       update public.order_payments set confirmed_at = timestamp '2100-01-01 23:59:59' at time zone 'America/Argentina/Cordoba' where id = '${data.ids.legacyIndividualPayment}';
      update public.order_payments set confirmed_at = timestamp '2099-12-30 23:59:59' at time zone 'America/Argentina/Cordoba' where id = '${data.ids.legacySetPayment}';
      update public.cash_movements set created_at = timestamp '2099-12-30 23:59:59' at time zone 'America/Argentina/Cordoba' where id = '${data.ids.income}';
       update public.cash_movements set created_at = timestamp '2100-01-01 00:00:00' at time zone 'America/Argentina/Cordoba' where id = '${data.ids.expense}';
      update public.cash_movements set created_at = timestamp '2099-12-30 23:59:59' at time zone 'America/Argentina/Cordoba' where id = '${data.ids.voidedExpense}';
      set local role authenticated;
       ${data.call({}, "2099-12-30", "2100-01-01")}
       ${data.salesCall({}, "2099-12-30", "2100-01-01")}
       ${data.salesCall({ fabricId: data.ids.legacyFabric }, "2099-12-30", "2100-01-01")}
       ${data.summaryCall({}, "2099-12-30", "2100-01-01")}
       rollback;`);
    const rows = results.split(/\r?\n/).filter((line) => line.startsWith("{"));
    expect(rows).toHaveLength(4);

    const dashboard = parseMetricsDashboard(JSON.parse(rows[0]!));
    expect(dashboard.cash).toEqual({
      income: "12.34",
      expense: "3.21",
      net: "9.13",
      daily_series: [
        { date: "2099-12-30", income: "12.34", expense: "0.00" },
         { date: "2099-12-31", income: "0.00", expense: "0.00" },
         { date: "2100-01-01", income: "0.00", expense: "3.21" },
      ],
    });
    expect(dashboard.sales.daily_series).toEqual([
      { date: "2099-12-30", loose_garments: 3, sets: { common: 5, premium: 0 } },
       { date: "2099-12-31", loose_garments: 0, sets: { common: 0, premium: 0 } },
       { date: "2100-01-01", loose_garments: 4, sets: { common: 2, premium: 1 } },
    ]);
    expect(dashboard.sales.daily_series.reduce((sum, day) => sum + day.loose_garments, 0)).toBe(dashboard.sales.loose_garments);
    expect(dashboard.sales.daily_series.reduce((sum, day) => sum + day.sets.common, 0)).toBe(dashboard.sales.sets.common);
    expect(dashboard.sales.daily_series.reduce((sum, day) => sum + day.sets.premium, 0)).toBe(dashboard.sales.sets.premium);

    const salesOnly = parseMetricsSales(JSON.parse(rows[1]!));
    expect(salesOnly.daily_series).toEqual(dashboard.sales.daily_series);
    const filteredSales = parseMetricsSales(JSON.parse(rows[2]!));
    expect(filteredSales.daily_series).toEqual([
      { date: "2099-12-30", loose_garments: 0, sets: { common: 5, premium: 0 } },
       { date: "2099-12-31", loose_garments: 0, sets: { common: 0, premium: 0 } },
       { date: "2100-01-01", loose_garments: 4, sets: { common: 0, premium: 0 } },
    ]);
    const summary = parseMetricsSummary(JSON.parse(rows[3]!));
    expect(summary.cash).toEqual({ income: dashboard.cash.income, expense: dashboard.cash.expense, net: dashboard.cash.net });
    expect(summary.loose_garments).toBe(dashboard.sales.loose_garments);
  });
});
