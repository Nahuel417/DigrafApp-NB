import { describe, expect, it } from "vitest";

import type { OrderDetailCatalogs } from "./detail-queries";
import type { PaymentReceiptData } from "./payment-receipt-pdf";
import { renderPaymentReceiptPdf } from "./payment-receipt-pdf";

const catalogs: OrderDetailCatalogs = {
  garments: [],
  flags: [],
  bags: [],
  shields: [],
  necklines: [],
  upperPatterns: [],
  lowerPatterns: [],
  fabrics: [],
  extras: [],
};

const data: PaymentReceiptData = {
  order: {
    id: "order-1",
    publicNumber: 42,
    customerName: "Equipo Norte",
    clientName: "Club Norte",
    teamName: "Primera",
    phone: "3515550000",
    dni: null,
    quantity: 3,
    orderType: "individual",
    orderDate: "2026-09-04",
    promisedDeliveryDate: "2026-09-20",
    description: "Remeras de juego",
    currentStage: { id: "stage-1", code: "paid", name: "Pagado" },
    lifecycleState: "active",
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    createdAt: "2026-09-04T10:00:00.000Z",
    updatedAt: "2026-09-04T12:00:00.000Z",
    lines: [{
      id: "line-1",
      position: 0,
      lineType: "individual",
      productId: "product-1",
      productName: "Remera",
      quantity: 3,
      color: "Azul",
      configurationSnapshot: {},
      shieldNames: [],
      shieldProductIds: [],
    }, {
      id: "line-2",
      position: 1,
      lineType: "individual",
      productId: "product-2",
      productName: "Short",
      quantity: 3,
      color: "Blanco",
      configurationSnapshot: {},
      shieldNames: [],
      shieldProductIds: [],
    }],
  },
  financials: { totalAmount: 150, depositAmount: 0, depositPaid: false },
  selections: [],
  catalogs,
  payment: {
    id: "payment-1",
    amount: 150,
    cashMovementId: "movement-1",
    confirmedAt: "2026-09-04T12:00:00.000Z",
    actorDisplayName: "Atención",
  },
};

describe("payment receipt PDF", () => {
  it("renders a PDF for a multi-item order", async () => {
    const pdf = await renderPaymentReceiptPdf(data);

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
