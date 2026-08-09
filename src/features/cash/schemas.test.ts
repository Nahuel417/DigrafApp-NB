import { describe, expect, it } from "vitest";

import { cashMovementFingerprint, cashMovementSchema, cashOpeningSchema } from "./schemas";

const categoryId = "11111111-1111-4111-8111-111111111111";
const key = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-08-06T03:00:00.000Z";
const movement = (overrides: Record<string, unknown> = {}) => ({ amount: "25.50", description: "Venta mostrador", direction: "income", expenseCategoryId: "", idempotencyKey: key, ...overrides });

describe("cash opening schema", () => {
  it("normalizes zero and positive exact amounts while requiring its optimistic contract", () => {
    expect(cashOpeningSchema.safeParse({ amount: "0", expectedOpeningUpdatedAt: timestamp, idempotencyKey: key }).data?.amount).toBe("0.00");
    expect(cashOpeningSchema.safeParse({ amount: "1250.5", expectedOpeningUpdatedAt: timestamp, idempotencyKey: key }).data?.amount).toBe("1250.50");
    expect(cashOpeningSchema.safeParse({ amount: "-1", expectedOpeningUpdatedAt: timestamp, idempotencyKey: key }).success).toBe(false);
    expect(cashOpeningSchema.safeParse({ amount: "10.123", expectedOpeningUpdatedAt: timestamp, idempotencyKey: key }).success).toBe(false);
    expect(cashOpeningSchema.safeParse({ amount: "10.00", idempotencyKey: key }).success).toBe(false);
  });
});

describe("manual cash movement schema", () => {
  it("normalizes a valid income and rejects empty or categorized income", () => {
    const result = cashMovementSchema.safeParse(movement({ description: "  Venta  " }));
    expect(result.success && result.data).toMatchObject({ amount: "25.50", description: "Venta", expenseCategoryId: null });
    expect(cashMovementSchema.safeParse(movement({ description: "" })).success).toBe(false);
    expect(cashMovementSchema.safeParse(movement({ expenseCategoryId: categoryId })).success).toBe(false);
  });

  it("requires an expense category and rejects invalid amount, direction, identifier, key, or fields", () => {
    expect(cashMovementSchema.safeParse(movement({ direction: "expense", expenseCategoryId: categoryId })).success).toBe(true);
    for (const input of [
      movement({ direction: "expense", expenseCategoryId: "" }),
      movement({ amount: "0", direction: "expense", expenseCategoryId: categoryId }),
      movement({ amount: "-1", direction: "expense", expenseCategoryId: categoryId }),
      movement({ direction: "transfer", expenseCategoryId: categoryId }),
      movement({ direction: "expense", expenseCategoryId: "not-an-id" }),
      movement({ direction: "expense", expenseCategoryId: categoryId, idempotencyKey: "" }),
      { ...movement({ direction: "expense", expenseCategoryId: categoryId }), unsupported: true },
    ]) expect(cashMovementSchema.safeParse(input).success).toBe(false);
  });

  it("builds a stable fingerprint from normalized movement inputs", () => {
    expect(cashMovementFingerprint({ amount: "10.5", description: "  Venta  ", direction: "income", expenseCategoryId: null }))
      .toBe(cashMovementFingerprint({ amount: "10.50", description: "Venta", direction: "income", expenseCategoryId: null }));
    expect(cashMovementFingerprint({ amount: "10.50", description: "Venta", direction: "expense", expenseCategoryId: categoryId }))
      .not.toBe(cashMovementFingerprint({ amount: "10.50", description: "Venta", direction: "income", expenseCategoryId: null }));
  });
});
