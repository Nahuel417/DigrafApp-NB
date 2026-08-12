import { describe, expect, it } from "vitest";

import { cashAttentionVoidReasonSchema, cashDayCloseSchema, cashDayReopenSchema, cashMovementCorrectionSchema, cashMovementFingerprint, cashMovementSchema, cashOpeningSchema, cashVoidSchema } from "./schemas";

const categoryId = "11111111-1111-4111-8111-111111111111";
const key = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-08-06T03:00:00.000Z";
const movement = (overrides: Record<string, unknown> = {}) => ({ amount: "25.50", description: "Venta mostrador", direction: "income", expenseCategoryId: "", idempotencyKey: key, ...overrides });
const movementId = "33333333-3333-4333-8333-333333333333";

describe("cash opening schema", () => {
  it("normalizes zero and positive exact amounts while requiring its optimistic contract", () => {
    expect(cashOpeningSchema.safeParse({ amount: "0", expectedOpeningUpdatedAt: timestamp, idempotencyKey: key }).data?.amount).toBe("0.00");
    expect(cashOpeningSchema.safeParse({ amount: "1250.5", expectedOpeningUpdatedAt: timestamp, idempotencyKey: key }).data?.amount).toBe("1250.50");
    expect(cashOpeningSchema.safeParse({ amount: "-1", expectedOpeningUpdatedAt: timestamp, idempotencyKey: key }).success).toBe(false);
    expect(cashOpeningSchema.safeParse({ amount: "10.123", expectedOpeningUpdatedAt: timestamp, idempotencyKey: key }).success).toBe(false);
    expect(cashOpeningSchema.safeParse({ amount: "10.00", idempotencyKey: key }).success).toBe(false);
  });

  it("validates the bounded text amount before the action with Spanish feedback", () => {
    expect(cashOpeningSchema.safeParse({ amount: "999999999999,99", expectedOpeningUpdatedAt: timestamp, idempotencyKey: key }).data?.amount)
      .toBe("999999999999.99");
    const tooLong = cashOpeningSchema.safeParse({ amount: "12345678901234.5", expectedOpeningUpdatedAt: timestamp, idempotencyKey: key });
    expect(tooLong.error?.issues[0]?.message).toBe("El importe no puede superar 15 caracteres.");
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

  it("accepts comma decimals but rejects zero movements with the custom message", () => {
    const income = cashMovementSchema.safeParse(movement({ amount: "25,50" }));
    expect(income.success && income.data.amount).toBe("25.50");
    const zero = cashMovementSchema.safeParse(movement({ amount: "0" }));
    expect(zero.error?.issues[0]?.message).toBe("El importe debe ser mayor que cero.");
  });

  it("builds a stable fingerprint from normalized movement inputs", () => {
    expect(cashMovementFingerprint({ amount: "10.5", description: "  Venta  ", direction: "income", expenseCategoryId: null }))
      .toBe(cashMovementFingerprint({ amount: "10.50", description: "Venta", direction: "income", expenseCategoryId: null }));
    expect(cashMovementFingerprint({ amount: "10.50", description: "Venta", direction: "expense", expenseCategoryId: categoryId }))
      .not.toBe(cashMovementFingerprint({ amount: "10.50", description: "Venta", direction: "income", expenseCategoryId: null }));
  });
});

describe("M10 cash correction schemas", () => {
  it("normalizes a correction and preserves the selected movement contract", () => {
    const result = cashMovementCorrectionSchema.safeParse({ ...movement({ description: "  Venta corregida  " }), movementId });
    expect(result.success && result.data).toMatchObject({ movementId, amount: "25.50", description: "Venta corregida", expenseCategoryId: null });
    expect(cashMovementCorrectionSchema.safeParse({ ...movement({ amount: "0" }), movementId }).success).toBe(false);
    expect(cashMovementCorrectionSchema.safeParse({ ...movement({ direction: "transfer" }), movementId }).success).toBe(false);
    expect(cashMovementCorrectionSchema.safeParse({ ...movement({ amount: "NaN" }), movementId }).success).toBe(false);
  });

  it("allows manager voids without a reason but validates Atención reasons from 2 to 500 characters", () => {
    const voidInput = cashVoidSchema.safeParse({ movementId, reason: "", idempotencyKey: key });
    expect(voidInput.success && voidInput.data).toMatchObject({ movementId, reason: null, idempotencyKey: key });
    expect(cashAttentionVoidReasonSchema.safeParse("Motivo válido").success).toBe(true);
    expect(cashAttentionVoidReasonSchema.safeParse(" ").success).toBe(false);
    expect(cashAttentionVoidReasonSchema.safeParse("a".repeat(501)).success).toBe(false);
  });

  it("requires a valid cash day and idempotency key to close", () => {
    expect(cashDayCloseSchema.safeParse({ cashDayId: movementId, idempotencyKey: key }).success).toBe(true);
    expect(cashDayCloseSchema.safeParse({ cashDayId: "not-a-uuid", idempotencyKey: key }).success).toBe(false);
  });

  it("trims a required reopening reason to the bounded contract", () => {
    expect(cashDayReopenSchema.safeParse({ cashDayId: movementId, reason: "  Corrección  ", idempotencyKey: key }).data).toEqual({ cashDayId: movementId, reason: "Corrección", idempotencyKey: key });
    for (const reason of ["", " ", "x", "x".repeat(501)]) expect(cashDayReopenSchema.safeParse({ cashDayId: movementId, reason, idempotencyKey: key }).success).toBe(false);
  });
});
