import { describe, expect, it } from "vitest";

import { getPaymentReceiptSummary, shouldShowPaymentReceipt, type ActiveOrderPayment } from "./payment-receipt";

const payment: ActiveOrderPayment = {
  id: "payment-1",
  amount: 100,
  cashMovementId: "movement-1",
  confirmedAt: "2026-09-04T12:00:00.000Z",
  actorDisplayName: "Atención",
};

describe("payment receipt visibility", () => {
  it("allows an active receipt in any order stage", () => {
    expect(shouldShowPaymentReceipt(true)).toBe(true);
  });

  it("does not require a payment record, but still requires permission", () => {
    expect(shouldShowPaymentReceipt(false)).toBe(false);
  });

  it("uses the paid deposit when there is no active payment", () => {
    expect(getPaymentReceiptSummary({ totalAmount: 150, depositAmount: 50, depositPaid: true }, null)).toEqual({
      totalAmount: "150.00",
      depositAmount: "50.00",
      depositPaid: true,
      paidAmount: "50.00",
      pendingAmount: "100.00",
    });
  });

  it("calculates the pending balance without floating point drift", () => {
    expect(getPaymentReceiptSummary({ totalAmount: 150, depositAmount: 0, depositPaid: false }, payment).pendingAmount).toBe("50.00");
    expect(getPaymentReceiptSummary({ totalAmount: 150, depositAmount: 0, depositPaid: false }, { ...payment, amount: 200 }).pendingAmount).toBe("0.00");
  });
});
