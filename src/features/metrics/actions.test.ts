import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({ requireActiveProfile: mocks.profile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));

import { getMetricsDashboardAction, getMetricsSalesAction, getMetricsSummaryAction } from "./actions";

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
  incidents: { total: 0, returns: 0, reasons: [] },
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
});
