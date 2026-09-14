import { describe, expect, it } from "vitest";

import { calculateQuote, decimalToCents } from "./calculation";

describe("quote calculation", () => {
  it("uses integer cents and applies an exact percentage discount", () => {
    const result = calculateQuote(
      [
        { name: "Remera", unit: "unidad", unitPrice: "1250.10", quantity: "2" },
        { name: "Bandera", unit: "metro_lineal", unitPrice: "800.25", quantity: "1.5" },
      ],
      "12.5",
    );

    expect(result.subtotalCents).toBe(BigInt(370058));
    expect(result.discountCents).toBe(BigInt(46257));
    expect(result.totalCents).toBe(BigInt(323801));
  });

  it("rejects unsafe quantities and decimals", () => {
    expect(() => decimalToCents("10.001")).toThrow();
    expect(() => calculateQuote([{ name: "TPU", unit: "unidad", unitPrice: "10", quantity: "1.5" }], "0")).toThrow();
    expect(() => calculateQuote([{ name: "Bandera", unit: "metro_lineal", unitPrice: "10", quantity: "0.001" }], "0")).toThrow();
  });
});
