import { describe, expect, it } from "vitest";

import { canInsertCashAmount, cashAmountError, compareMoney, formatArs, normalizeAggregateMoney, normalizeMoney, safeOrderBalance, visibleBalance } from "./decimal";

describe("money decimals", () => {
  it("normalizes ARS values without floating point arithmetic", () => {
    expect(normalizeMoney("0012,5")).toBe("12.50");
    expect(normalizeMoney("0")).toBe("0.00");
    expect(formatArs("1234567.8")).toBe("$ 1.234.567,80");
  });

  it("normalizes signed unbounded trusted aggregate values exactly", () => {
    expect(normalizeAggregateMoney("1000000000000.01")).toBe("1000000000000.01");
    expect(normalizeAggregateMoney("-1000000000000.01")).toBe("-1000000000000.01");
    expect(normalizeAggregateMoney(1000000000000.01)).toBe("1000000000000.01");
    expect(normalizeAggregateMoney("-0012,5")).toBe("-12.50");
    expect(normalizeAggregateMoney("-0.00")).toBe("0.00");
    expect(() => normalizeAggregateMoney("100.123")).toThrow();
  });

  it("formats signed aggregate balances without losing cents", () => {
    expect(formatArs("1000000000000.01")).toBe("$ 1.000.000.000.000,01");
    expect(formatArs("-1000000000000.01")).toBe("$ -1.000.000.000.000,01");
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

  it("does not throw while the order amounts are partial or invalid", () => {
    expect(safeOrderBalance("", "250")).toBeNull();
    expect(safeOrderBalance("100", "100.01")).toBeNull();
    expect(safeOrderBalance("1000", "250")).toBe("750.00");
  });

  it("rejects values outside numeric(14,2)", () => {
    expect(() => normalizeMoney("1000000000000.00")).toThrow();
    expect(() => normalizeMoney("10.123")).toThrow();
    expect(() => normalizeMoney("-1.00")).toThrow();
  });

  it.each([
    ["", "Ingresá un importe."],
    ["abc", "Usá un importe con hasta dos decimales."],
    ["$", "Usá un importe con hasta dos decimales."],
    ["-", "Usá un importe con hasta dos decimales."],
    [".", "Usá un importe con hasta dos decimales."],
    [",", "Usá un importe con hasta dos decimales."],
    ["1.", "Usá un importe con hasta dos decimales."],
    ["1,", "Usá un importe con hasta dos decimales."],
    ["-1", "El importe debe ser mayor o igual a cero."],
    ["1.234", "Usá un importe con hasta dos decimales."],
    ["1,2.3", "Usá un importe con hasta dos decimales."],
    [" 10", "Usá un importe con hasta dos decimales."],
    ["10 ", "Usá un importe con hasta dos decimales."],
    ["10 00", "Usá un importe con hasta dos decimales."],
    ["+10", "Usá un importe con hasta dos decimales."],
    ["1234567890123", "El importe no puede superar 12 dígitos enteros."],
  ])("returns the Spanish early-validation error for %s", (value, message) => {
    expect(cashAmountError(value)).toBe(message);
  });

  it("keeps zero and comma/point behavior explicit for opening and movements", () => {
    expect(cashAmountError("0", { allowZero: true })).toBeNull();
    expect(cashAmountError("0", { allowZero: false })).toBe("El importe debe ser mayor que cero.");
    expect(cashAmountError("000.00", { allowZero: false })).toBe("El importe debe ser mayor que cero.");
    expect(cashAmountError("1,25", { allowZero: false })).toBeNull();
    expect(cashAmountError("1.25", { allowZero: false })).toBeNull();
    expect(cashAmountError("123456789012.34", { allowZero: true })).toBeNull();
  });

  it("allows only valid cash insertions while editing", () => {
    expect(canInsertCashAmount("", "1", 0, 0)).toBe(true);
    expect(canInsertCashAmount("12", ",34", 2, 2)).toBe(true);
    expect(canInsertCashAmount("12", ".34", 2, 2)).toBe(true);
    expect(canInsertCashAmount("12", "a", 2, 2)).toBe(false);
    expect(canInsertCashAmount("12", " $", 2, 2)).toBe(false);
    expect(canInsertCashAmount("12,34", ".", 5, 5)).toBe(false);
    expect(canInsertCashAmount("12,34", "5", 5, 5)).toBe(false);
    expect(canInsertCashAmount("12,34", "", 0, 5)).toBe(true);
  });
});
