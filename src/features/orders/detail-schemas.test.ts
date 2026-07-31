import { describe, expect, it } from "vitest";

import { updateOrderSchema } from "./detail-schemas";

const validBase = {
  orderId: crypto.randomUUID(),
  customerName: "Equipo histórico",
  quantity: "4",
  orderType: "individual",
  orderDate: "2026-07-29",
  promisedDeliveryDate: "2026-08-05",
  description: "",
  changeNote: "Motivo operativo",
  totalAmount: "1500.00",
  depositAmount: "300.00",
  depositPaid: "true",
  individualLayer: "upper",
  garmentUpperId: "",
  garmentLowerId: "",
  necklineId: "",
  upperPatternId: "",
  lowerPatternId: "",
  fabricId: "",
  extraIds: [],
  expectedUpdatedAt: "2026-07-30T12:00:00.000Z",
  idempotencyKey: crypto.randomUUID(),
};

describe("update order schema", () => {
  it("lets the RPC validate preserved historical catalog selections", () => {
    expect(updateOrderSchema.safeParse(validBase).success).toBe(true);
  });

  it("still rejects an individual order without a known layer", () => {
    const result = updateOrderSchema.safeParse({ ...validBase, individualLayer: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an overlong operational note", () => {
    expect(updateOrderSchema.safeParse({ ...validBase, changeNote: "a".repeat(301) }).success).toBe(false);
  });
});
