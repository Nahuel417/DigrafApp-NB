import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), rpc: vi.fn(), from: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({ requireActiveProfile: mocks.profile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));

import { getMetricsDashboardAction, getMetricsFilterOptionsAction, getMetricsSalesAction, getMetricsSummaryAction } from "./actions";

const filters = {
  from: "2026-11-01",
  to: "2026-11-07",
  productId: null,
  fabricId: "11111111-1111-4111-8111-111111111111",
  necklineId: null,
  upperPatternId: null,
  lowerPatternId: null,
  productType: null,
};

const sales = {
  products: [],
  loose_garments: 0,
  sets: { common: 0, premium: 0 },
  daily_series: [{ date: "2026-11-07", loose_garments: 0, sets: { common: 0, premium: 0 } }],
};

const dashboard = {
  generated_at: "2026-11-07T12:00:00.000Z",
  period: { from: filters.from, to: filters.to },
  cash: { income: "0", expense: "0", net: "0", daily_series: [{ date: "2026-11-07", income: "0", expense: "0" }] },
  incidents: { total: 0, returns: 0, internal: 0, without_return: 0, reasons: [] },
  sales,
  filters: { products: [], fabrics: [], necklines: [], upper_patterns: [], lower_patterns: [] },
};

const summary = {
  generated_at: "2026-11-07T12:00:00.000Z",
  period: { from: filters.from, to: filters.to },
  cash: { income: "12.34", expense: "3.21", net: "9.13" },
  loose_garments: 4,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({ role: "admin" });
  mocks.rpc.mockResolvedValue({ data: dashboard, error: null });
});

function queryResult(data: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return query;
}

describe("metrics server actions", () => {
  it("uses the compact summary RPC with normalized filters", async () => {
    mocks.rpc.mockResolvedValue({ data: summary, error: null });

    await expect(getMetricsSummaryAction({ ...filters, fabricId: filters.fabricId.toUpperCase() })).resolves.toEqual(summary);

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("get_metrics_summary", {
      p_from: filters.from,
      p_to: filters.to,
      p_product_id: filters.productId,
      p_fabric_id: filters.fabricId,
      p_neckline_id: filters.necklineId,
      p_upper_pattern_id: filters.upperPatternId,
      p_lower_pattern_id: filters.lowerPatternId,
      p_product_type: filters.productType,
    });
  });

  it("keeps the deferred detail action on the aggregate RPC", async () => {
    await getMetricsDashboardAction(filters);

    expect(mocks.rpc).toHaveBeenCalledWith("get_metrics_dashboard", {
      p_from: filters.from,
      p_to: filters.to,
      p_product_id: filters.productId,
      p_fabric_id: filters.fabricId,
      p_neckline_id: filters.necklineId,
      p_upper_pattern_id: filters.upperPatternId,
      p_lower_pattern_id: filters.lowerPatternId,
      p_product_type: filters.productType,
    });
  });

  it("requests only the filtered sales projection", async () => {
    mocks.rpc.mockResolvedValue({ data: sales, error: null });

    await expect(getMetricsSalesAction(filters)).resolves.toEqual(sales);

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("get_metrics_sales", {
      p_from: filters.from,
      p_to: filters.to,
      p_product_id: filters.productId,
      p_fabric_id: filters.fabricId,
      p_neckline_id: filters.necklineId,
      p_upper_pattern_id: filters.upperPatternId,
      p_lower_pattern_id: filters.lowerPatternId,
      p_product_type: filters.productType,
    });
  });

  it("loads only active catalog filter options and maps custom option values", async () => {
    mocks.from.mockImplementation((table: string) => queryResult(
      table === "catalog_products"
        ? [{ id: "22222222-2222-4222-8222-222222222222", name: "Remera", kind: "garment", garment_layer: "upper" }]
        : table === "catalog_items"
          ? [{ id: "33333333-3333-4333-8333-333333333333", name: "Jersey", kind: "fabric" }, { id: "44444444-4444-4444-8444-444444444444", name: "Ignorado", kind: "extra" }]
          : [{ name: " Tela ", catalog_product_option_values: [{ id: "55555555-5555-4555-8555-555555555555", value: "Algodón" }] }],
    ));

    await expect(getMetricsFilterOptionsAction()).resolves.toEqual({
      products: [{ id: "22222222-2222-4222-8222-222222222222", name: "Remera", kind: "garment", garment_layer: "upper" }],
      fabrics: [
        { id: "55555555-5555-4555-8555-555555555555", name: "Algodón" },
        { id: "33333333-3333-4333-8333-333333333333", name: "Jersey" },
      ],
      necklines: [], upper_patterns: [], lower_patterns: [],
    });
    expect(mocks.from).toHaveBeenCalledTimes(3);
  });

  it("does not query catalog filter options for a role without metrics access", async () => {
    mocks.profile.mockResolvedValue({ role: "attention" });

    await expect(getMetricsFilterOptionsAction()).rejects.toThrow("No tenés permiso para consultar las métricas.");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
