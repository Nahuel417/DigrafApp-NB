import { describe, expect, it } from "vitest";

import { shouldShowPaymentReceipt, type ActiveOrderPayment } from "./payment-receipt";

const payment: ActiveOrderPayment = {
  id: "payment-1",
  amount: 100,
  cashMovementId: "movement-1",
  confirmedAt: "2026-09-04T12:00:00.000Z",
  actorDisplayName: "Atención",
};

describe("payment receipt visibility", () => {
  it("allows active receipts only in paid and delivered", () => {
    expect(shouldShowPaymentReceipt("paid", payment, true)).toBe(true);
    expect(shouldShowPaymentReceipt("delivered", payment, true)).toBe(true);
    expect(shouldShowPaymentReceipt("design", payment, true)).toBe(false);
  });

  it("hides receipts after reversal or for unauthorized roles", () => {
    expect(shouldShowPaymentReceipt("paid", null, true)).toBe(false);
    expect(shouldShowPaymentReceipt("delivered", payment, false)).toBe(false);
  });
});
