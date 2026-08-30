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

  it("requires both products for a set in a single line", () => {
    const result = orderFormSchema.safeParse({ ...validOrder(), lines: JSON.stringify([{ position: 0, line_type: "set", quantity: 2, configuration: { upper: { product_id: productId } } }]) });
    expect(result.success).toBe(false);
    if (!result.success) expect(JSON.stringify(result.error.flatten().fieldErrors)).toContain("parte inferior");
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
