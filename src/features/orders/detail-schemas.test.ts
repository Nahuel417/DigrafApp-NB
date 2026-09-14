import { describe, expect, it } from "vitest";

import { updateOrderSchema } from "./detail-schemas";

const validBase = {
  orderId: crypto.randomUUID(), clientName: "Cliente histórico", teamName: "Equipo histórico", phone: "3515550000",
  dni: "12.345.678",
  lines: JSON.stringify([{ position: 0, line_type: "individual", product_id: crypto.randomUUID(), quantity: 4, options: [] }]),
  orderDate: "2026-07-29", promisedDeliveryDate: "2026-08-05", description: "", changeNote: "Motivo operativo",
  totalAmount: "1500.00", depositAmount: "300.00", depositPaid: "true", expectedUpdatedAt: "2026-07-30T12:00:00.000Z", idempotencyKey: crypto.randomUUID(),
};

describe("update order schema", () => {
  it("accepts a complete identity and normalizes DNI", () => {
    const result = updateOrderSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dni).toBe("12345678");
  });
  it("rejects an invalid DNI length", () => { expect(updateOrderSchema.safeParse({ ...validBase, dni: "123456" }).success).toBe(false); });
  it("requires historical identity fields before saving", () => { expect(updateOrderSchema.safeParse({ ...validBase, phone: "" }).success).toBe(false); });
  it("rejects an overlong operational note", () => { expect(updateOrderSchema.safeParse({ ...validBase, changeNote: "a".repeat(301) }).success).toBe(false); });
});
