import { describe, expect, it } from "vitest";

import { canInsertStockQuantity, stockOperationSchema } from "./schemas";

const key = "d78facad-74c0-435c-9fe0-e9f2565c82d5";
const itemId = "a88facad-74c0-435c-9fe0-e9f2565c82d5";
const date = "2026-10-01";

describe("stock operation schemas", () => {
  it("trims names, accepts a priced empty opening balance and normalizes half-roll quantities", () => {
    expect(stockOperationSchema.parse({ action: "create", idempotencyKey: key, name: " Tela ", quantity: "0", date, price: "123,45" }))
      .toMatchObject({ name: "Tela", quantity: "0", price: "123.45" });
    expect(stockOperationSchema.parse({ action: "purchase", idempotencyKey: key, itemId, quantity: "1,5", date, price: "123,45" }))
      .toMatchObject({ quantity: "1.5", price: "123.45" });
  });

  it("requires a valid positive opening price and rejects malformed movement values", () => {
    const invalid = [
      { action: "create", idempotencyKey: key, name: "Tela", quantity: "0", date },
      { action: "create", idempotencyKey: key, name: "Tela", quantity: "0", date, price: "letters" },
      { action: "create", idempotencyKey: key, name: "Tela", quantity: "0", date, price: "1e3" },
      { action: "create", idempotencyKey: key, name: "Tela", quantity: "0", date, price: "-1" },
      { action: "create", idempotencyKey: key, name: "Tela", quantity: "0", date, price: "0" },
      { action: "create", idempotencyKey: key, name: "Tela", quantity: "0", date, price: "1.001" },
      { action: "consumption", idempotencyKey: key, itemId, quantity: "0.25", date },
      { action: "consumption", idempotencyKey: key, itemId, quantity: "0", date },
      { action: "consumption", idempotencyKey: key, itemId, quantity: "1", date: "2026-02-30" },
      { action: "consumption", idempotencyKey: key, itemId, quantity: "1", date: "2999-01-01" },
      { action: "purchase", idempotencyKey: key, itemId, quantity: "1", date, price: "0" },
      { action: "purchase", idempotencyKey: key, itemId, quantity: "1", date, price: "1.001" },
    ];

    for (const operation of invalid) expect(stockOperationSchema.safeParse(operation).success).toBe(false);
  });

  it("requires a reason to cancel and normalizes activation to a boolean", () => {
    expect(stockOperationSchema.safeParse({ action: "cancel", idempotencyKey: key, itemId, movementId: key, reason: " " }).success).toBe(false);
    expect(stockOperationSchema.parse({ action: "cancel", idempotencyKey: key, itemId, movementId: key, reason: "  Error de carga  " }))
      .toMatchObject({ reason: "Error de carga" });
    expect(stockOperationSchema.parse({ action: "activate", idempotencyKey: key, itemId, active: "false" }))
      .toMatchObject({ active: false });
  });

  it("only allows digits and half-roll separators while editing quantity", () => {
    expect(canInsertStockQuantity("1", "2", 1, 1)).toBe(true);
    expect(canInsertStockQuantity("1", ",5", 1, 1)).toBe(true);
    expect(canInsertStockQuantity("1,", "5", 2, 2)).toBe(true);
    expect(canInsertStockQuantity("1", ",2", 1, 1)).toBe(false);
    expect(canInsertStockQuantity("1", "0x", 1, 1)).toBe(false);
    expect(canInsertStockQuantity("1", "-1", 1, 1)).toBe(false);
    expect(canInsertStockQuantity("1", "1e3", 1, 1)).toBe(false);
    expect(canInsertStockQuantity("1.5", ".5", 3, 3)).toBe(false);
  });
});
