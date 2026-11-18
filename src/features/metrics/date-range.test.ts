import { describe, expect, it } from "vitest";

import { normalizeMetricsFilters, operationalDate, resolveMetricsDateRange } from "./filters";

describe("metrics date ranges", () => {
  const now = new Date("2026-06-01T03:30:00.000Z");

  it("resolves operational days in Córdoba, including a UTC date boundary", () => {
    expect(operationalDate(new Date("2026-06-01T02:30:00.000Z"))).toBe("2026-05-31");
    expect(resolveMetricsDateRange("last7", now)).toEqual({ from: "2026-05-26", to: "2026-06-01" });
    expect(resolveMetricsDateRange("today", now)).toEqual({ from: "2026-06-01", to: "2026-06-01" });
  });

  it("resolves current and previous calendar months inclusively", () => {
    expect(resolveMetricsDateRange("currentMonth", now)).toEqual({ from: "2026-06-01", to: "2026-06-01" });
    expect(resolveMetricsDateRange("previousMonth", now)).toEqual({ from: "2026-05-01", to: "2026-05-31" });
  });

  it("keeps custom dates inclusive without imposing an unapproved range limit", () => {
    expect(resolveMetricsDateRange("custom", now, { from: "2000-01-01", to: "2026-06-01" })).toEqual({ from: "2000-01-01", to: "2026-06-01" });
  });

  it("normalizes every filter into a stable cache-key shape", () => {
    const first = normalizeMetricsFilters({ from: "2026-05-26", to: "2026-06-01", productId: "A0000000-0000-4000-8000-000000000001", fabricId: "", productType: "individual" });
    const second = normalizeMetricsFilters({ from: "2026-05-26", to: "2026-06-01", productId: "a0000000-0000-4000-8000-000000000001", productType: "individual" });
    expect(first).toEqual({ from: "2026-05-26", to: "2026-06-01", productId: "a0000000-0000-4000-8000-000000000001", fabricId: null, necklineId: null, upperPatternId: null, lowerPatternId: null, productType: "individual" });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("rejects malformed or reversed date ranges", () => {
    expect(() => normalizeMetricsFilters({ from: "2026-02-30", to: "2026-03-01" })).toThrow();
    expect(() => normalizeMetricsFilters({ from: "2026-06-02", to: "2026-06-01" })).toThrow();
  });
});
