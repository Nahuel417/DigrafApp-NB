import { describe, expect, it } from "vitest";

import { orderFormSchema } from "./schemas";

const productId = "11111111-1111-4111-8111-111111111111";

function validOrder() {
  return {
    clientName: "Cliente de prueba", teamName: "Equipo de prueba", phone: "+54 351 5550000",
    lines: JSON.stringify([{ position: 0, line_type: "individual", product_id: productId, quantity: 12, color: "Azul", options: [] }]),
    orderDate: "2026-08-17", promisedDeliveryDate: "2026-08-20", description: "",
    totalAmount: "1000,50", depositAmount: "0", depositPaid: false, idempotencyKey: "order-key-1",
  };
}

describe("order form schema", () => {
  it("requires client, team and phone for new orders", () => {
    const result = orderFormSchema.safeParse({ ...validOrder(), phone: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.phone).toContain("Ingresá un teléfono válido.");
  });

  it("accepts one line and normalizes money", () => {
    const result = orderFormSchema.safeParse(validOrder());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.totalAmount).toBe("1000.50");
  });

  it("normalizes an optional DNI to digits", () => {
    const result = orderFormSchema.safeParse({ ...validOrder(), dni: " 12.345.678 " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dni).toBe("12345678");
  });

  it("accepts a missing DNI and rejects invalid lengths", () => {
    const missing = orderFormSchema.safeParse({ ...validOrder(), dni: "" });
    expect(missing.success).toBe(true);
    if (missing.success) expect(missing.data.dni).toBeNull();

    expect(orderFormSchema.safeParse({ ...validOrder(), dni: "123456" }).success).toBe(false);
    expect(orderFormSchema.safeParse({ ...validOrder(), dni: "123456789" }).success).toBe(false);
  });

  it("requires both products for a set in a single line", () => {
    const result = orderFormSchema.safeParse({ ...validOrder(), lines: JSON.stringify([{ position: 0, line_type: "set", quantity: 2, configuration: { upper: { product_id: productId } } }]) });
    expect(result.success).toBe(false);
    if (!result.success) expect(JSON.stringify(result.error.flatten().fieldErrors)).toContain("parte inferior");
  });

  it("requires both products for a premium set in a single line", () => {
    const result = orderFormSchema.safeParse({ ...validOrder(), lines: JSON.stringify([{ position: 0, line_type: "premium_set", quantity: 2, configuration: { lower: { product_id: productId } } }]) });
    expect(result.success).toBe(false);
    if (!result.success) expect(JSON.stringify(result.error.flatten().fieldErrors)).toContain("parte superior");
  });

  it("rejects zero quantity and a deposit above total", () => {
    const result = orderFormSchema.safeParse({ ...validOrder(), depositAmount: "1000,51", lines: JSON.stringify([{ position: 0, line_type: "individual", product_id: productId, quantity: 0 }]) });
    expect(result.success).toBe(false);
  });

  it("keeps legacy options in the line configuration", () => {
    const result = orderFormSchema.safeParse({ ...validOrder(), lines: JSON.stringify([{ position: 0, line_type: "individual", product_id: productId, quantity: 1, configuration: { legacy_options: { fabric_id: crypto.randomUUID(), extra_ids: [crypto.randomUUID()] } } }]) });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.lines[0]?.configuration?.legacy_options?.extra_ids).toHaveLength(1);
  });
});
