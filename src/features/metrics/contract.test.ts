import { describe, expect, it } from "vitest";

import { parseMetricsDashboard, parseMetricsSales, parseMetricsSummary } from "./contract";

const baseDashboard = {
  generated_at: "2026-11-07T12:00:00.000Z",
  period: { from: "2026-11-06", to: "2026-11-07" },
  cash: {
    income: "12.34",
    expense: "3.21",
    net: "9.13",
    daily_series: [
      { date: "2026-11-06", income: "12.34", expense: "0" },
      { date: "2026-11-07", income: "0", expense: "3.21" },
    ],
  },
  incidents: { total: 0, returns: 0, reasons: [] },
  sales: {
    products: [],
    loose_garments: 3,
    sets: { common: 2, premium: 1 },
    daily_series: [
      { date: "2026-11-06", loose_garments: 3, sets: { common: 0, premium: 0 } },
      { date: "2026-11-07", loose_garments: 0, sets: { common: 2, premium: 1 } },
    ],
  },
  filters: { products: [], fabrics: [], necklines: [], upper_patterns: [], lower_patterns: [] },
};

describe("metrics response daily series", () => {
  it("preserves every daily bucket and normalizes cash amounts without floating-point conversion", () => {
    const parsed = parseMetricsDashboard(baseDashboard);

    expect(parsed.cash.daily_series).toEqual([
      { date: "2026-11-06", income: "12.34", expense: "0.00" },
      { date: "2026-11-07", income: "0.00", expense: "3.21" },
    ]);
    expect(parsed.sales.daily_series).toEqual(baseDashboard.sales.daily_series);
    expect(parseMetricsSales(baseDashboard.sales).daily_series).toEqual(baseDashboard.sales.daily_series);
  });

  it("rejects malformed date buckets instead of silently dropping chart data", () => {
    const malformed = structuredClone(baseDashboard);
    malformed.sales.daily_series[0]!.date = "not-a-date";

    expect(() => parseMetricsDashboard(malformed)).toThrow("La respuesta de métricas no tiene un formato válido.");
  });
});

describe("metrics summary response", () => {
  it("normalizes exact cash amounts and accepts timestamps with timezone offsets", () => {
    expect(parseMetricsSummary({
      generated_at: "2026-11-07T09:00:00-03:00",
      period: { from: "2026-11-06", to: "2026-11-07" },
      cash: { income: "12.3", expense: "3.21", net: "9.09" },
      loose_garments: 7,
    })).toEqual({
      generated_at: "2026-11-07T09:00:00-03:00",
      period: { from: "2026-11-06", to: "2026-11-07" },
      cash: { income: "12.30", expense: "3.21", net: "9.09" },
      loose_garments: 7,
    });
  });

  it("rejects invalid dates and non-integer loose garment totals", () => {
    expect(() => parseMetricsSummary({
      generated_at: "2026-11-07T12:00:00Z",
      period: { from: "2026-02-30", to: "2026-11-07" },
      cash: { income: "0", expense: "0", net: "0" },
      loose_garments: 1.5,
    })).toThrow("La respuesta de métricas no tiene un formato válido.");
  });
});
