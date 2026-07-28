import { describe, expect, it } from "vitest";

import { orderFormSchema } from "./schemas";

const ids = {
  garmentUpperId: "11111111-1111-4111-8111-111111111111",
  garmentLowerId: "22222222-2222-4222-8222-222222222222",
  necklineId: "33333333-3333-4333-8333-333333333333",
  upperPatternId: "44444444-4444-4444-8444-444444444444",
  lowerPatternId: "55555555-5555-4555-8555-555555555555",
  fabricId: "66666666-6666-4666-8666-666666666666",
};

function validSet() {
  return {
    customerName: "Equipo de prueba",
    quantity: "12",
    orderType: "set",
    orderDate: "2026-07-20",
    promisedDeliveryDate: "2026-07-30",
    description: "",
    totalAmount: "1000,50",
    depositAmount: "0",
    depositPaid: false,
    individualLayer: "",
    ...ids,
    extraIds: [],
    idempotencyKey: "order-key-1",
  };
}

describe("order form schema", () => {
  it("accepts an unpaid zero deposit and normalizes money", () => {
    const result = orderFormSchema.safeParse(validSet());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalAmount).toBe("1000.50");
      expect(result.data.depositAmount).toBe("0.00");
    }
  });

  it("rejects a deposit greater than the total", () => {
    const result = orderFormSchema.safeParse({ ...validSet(), depositAmount: "1000.51" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.depositAmount).toContain("La seña no puede superar el total.");
  });

  it("reports malformed amounts without throwing during cross-field validation", () => {
    expect(() => orderFormSchema.safeParse({ ...validSet(), totalAmount: "", depositAmount: "abc" })).not.toThrow();
    expect(orderFormSchema.safeParse({ ...validSet(), totalAmount: "", depositAmount: "abc" }).success).toBe(false);
  });

  it("requires both garment groups and molds for a set", () => {
    const result = orderFormSchema.safeParse({ ...validSet(), garmentLowerId: "", lowerPatternId: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.garmentLowerId).toContain("Seleccioná una prenda inferior.");
      expect(result.error.flatten().fieldErrors.lowerPatternId).toContain("Seleccioná un molde inferior.");
    }
  });

  it("requires the upper-specific fields for an individual upper garment", () => {
    const result = orderFormSchema.safeParse({
      ...validSet(),
      orderType: "individual",
      individualLayer: "upper",
      garmentLowerId: "",
      lowerPatternId: "",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an individual lower garment with a neckline", () => {
    const result = orderFormSchema.safeParse({
      ...validSet(),
      orderType: "individual",
      individualLayer: "lower",
      garmentUpperId: "",
      necklineId: ids.necklineId,
      upperPatternId: "",
      lowerPatternId: ids.lowerPatternId,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.necklineId).toContain("El cuello no aplica a una prenda inferior.");
  });
});
