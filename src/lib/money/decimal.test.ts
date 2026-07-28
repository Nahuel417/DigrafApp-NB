import { describe, expect, it } from "vitest";

import { compareMoney, formatArs, normalizeMoney, visibleBalance } from "./decimal";

describe("money decimals", () => {
  it("normalizes ARS values without floating point arithmetic", () => {
    expect(normalizeMoney("0012,5")).toBe("12.50");
    expect(normalizeMoney("0")).toBe("0.00");
    expect(formatArs("1234567.8")).toBe("$ 1.234.567,80");
  });

  it("compares decimal values exactly", () => {
    expect(compareMoney("10.10", "10.1")).toBe(0);
    expect(compareMoney("10.11", "10.10")).toBe(1);
    expect(compareMoney("9.99", "10.00")).toBe(-1);
  });

  it("derives the visible balance from the deposit state", () => {
    expect(visibleBalance("1000", "250", true)).toBe("750.00");
    expect(visibleBalance("1000", "250", false)).toBe("1000.00");
    expect(() => visibleBalance("100", "100.01", true)).toThrow();
  });

  it("rejects values outside numeric(14,2)", () => {
    expect(() => normalizeMoney("1000000000000.00")).toThrow();
    expect(() => normalizeMoney("10.123")).toThrow();
    expect(() => normalizeMoney("-1.00")).toThrow();
  });
});
