import { describe, expect, it } from "vitest";

import { confirmOrderPaymentSchema, moveOrderSchema } from "./schemas";

const movement = {
  orderId: "11111111-1111-4111-8111-111111111111",
  fromStageId: "22222222-2222-4222-8222-222222222222",
  toStageId: "33333333-3333-4333-8333-333333333333",
  expectedUpdatedAt: "2026-07-29T03:00:00.000Z",
  idempotencyKey: "move-1",
};

describe("move order schema", () => {
  it("accepts the RPC contract", () => {
    expect(moveOrderSchema.safeParse(movement).success).toBe(true);
  });

  it("rejects a same-stage request before the Server Action", () => {
    const result = moveOrderSchema.safeParse({ ...movement, toStageId: movement.fromStageId });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.toStageId).toContain("El pedido ya está en la etapa seleccionada.");
  });

  it("rejects malformed versions and idempotency keys", () => {
    expect(moveOrderSchema.safeParse({ ...movement, expectedUpdatedAt: "ayer" }).success).toBe(false);
    expect(moveOrderSchema.safeParse({ ...movement, idempotencyKey: "" }).success).toBe(false);
  });
});

describe("confirm order payment schema", () => {
  const confirmation = {
    orderId: "11111111-1111-4111-8111-111111111111",
    expectedUpdatedAt: "2026-07-29T03:00:00.000Z",
    idempotencyKey: "payment-1",
  };

  it("accepts a valid payment confirmation", () => {
    expect(confirmOrderPaymentSchema.safeParse(confirmation).success).toBe(true);
  });

  it("rejects invalid UUID, timestamp, and empty idempotency key", () => {
    expect(confirmOrderPaymentSchema.safeParse({ ...confirmation, orderId: "pedido" }).success).toBe(false);
    expect(confirmOrderPaymentSchema.safeParse({ ...confirmation, expectedUpdatedAt: "ayer" }).success).toBe(false);
    expect(confirmOrderPaymentSchema.safeParse({ ...confirmation, idempotencyKey: " " }).success).toBe(false);
  });
});
