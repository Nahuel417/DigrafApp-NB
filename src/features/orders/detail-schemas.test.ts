import { describe, expect, it } from "vitest";

import { updateOrderSchema } from "./detail-schemas";

const validBase = {
  orderId: crypto.randomUUID(), clientName: "Cliente histórico", teamName: "Equipo histórico", phone: "3515550000",
  lines: JSON.stringify([{ position: 0, line_type: "individual", product_id: crypto.randomUUID(), quantity: 4, options: [] }]),
  orderDate: "2026-07-29", promisedDeliveryDate: "2026-08-05", description: "", changeNote: "Motivo operativo",
  totalAmount: "1500.00", depositAmount: "300.00", depositPaid: "true", expectedUpdatedAt: "2026-07-30T12:00:00.000Z", idempotencyKey: crypto.randomUUID(),
};

describe("update order schema", () => {
  it("accepts a complete identity and multi-line payload", () => { expect(updateOrderSchema.safeParse(validBase).success).toBe(true); });
  it("requires historical identity fields before saving", () => { expect(updateOrderSchema.safeParse({ ...validBase, phone: "" }).success).toBe(false); });
  it("rejects an overlong operational note", () => { expect(updateOrderSchema.safeParse({ ...validBase, changeNote: "a".repeat(301) }).success).toBe(false); });
});
