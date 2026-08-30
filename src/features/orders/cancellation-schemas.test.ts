import { describe, expect, it } from "vitest";

import { cancelOrderSchema, purgeCancelledOrderSchema, restoreOrderSchema } from "./cancellation-schemas";

const base = {
  orderId: "11111111-1111-4111-8111-111111111111",
  expectedUpdatedAt: "2026-08-14T12:00:00.000Z",
  idempotencyKey: "m15-key",
};

const purgeBase = {
  orderId: base.orderId,
  idempotencyKey: "m16-key",
};

describe("M15 cancellation schemas", () => {
  it("accepts a valid reason at both inclusive boundaries", () => {
    expect(cancelOrderSchema.safeParse({ ...base, reason: "Ok" }).success).toBe(true);
    expect(cancelOrderSchema.safeParse({ ...base, reason: "x".repeat(500) }).success).toBe(true);
  });

  it("rejects invalid reason lengths and malformed restore versions", () => {
    expect(cancelOrderSchema.safeParse({ ...base, reason: "x" }).success).toBe(false);
    expect(cancelOrderSchema.safeParse({ ...base, reason: "x".repeat(501) }).success).toBe(false);
    expect(restoreOrderSchema.safeParse({ ...base, expectedUpdatedAt: "not-a-date" }).success).toBe(false);
  });

  it("validates the manual delete reason at inclusive boundaries and trims only the edges", () => {
    expect(purgeCancelledOrderSchema.safeParse({ ...purgeBase, reason: "Ok" }).data?.reason).toBe("Ok");
    expect(purgeCancelledOrderSchema.safeParse({ ...purgeBase, reason: "  Motivo válido  " }).data?.reason).toBe("Motivo válido");
    expect(purgeCancelledOrderSchema.safeParse({ ...purgeBase, reason: "x" }).success).toBe(false);
    expect(purgeCancelledOrderSchema.safeParse({ ...purgeBase, reason: "x".repeat(501) }).success).toBe(false);
    expect(purgeCancelledOrderSchema.safeParse({ ...purgeBase, reason: "   " }).success).toBe(false);
  });
});
