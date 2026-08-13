import { describe, expect, it } from "vitest";

import { moveBoardOrder, replaceBoardOrder, sortPaidBoardOrders } from "./board-state";
import type { BoardColumn, BoardOrder } from "./queries";

const first: BoardOrder = {
  id: "first",
  publicNumber: 2,
  customerName: "Primero",
  quantity: 1,
  orderType: "individual",
  promisedDeliveryDate: "2026-08-02",
  currentStageId: "received",
  updatedAt: "2026-07-29T03:00:00.000Z",
  hasDesignImage: false,
  imageUpdatedAt: null,
  totalAmount: null,
  paymentConfirmedAt: null,
};

const earlier: BoardOrder = {
  ...first,
  id: "earlier",
  publicNumber: 1,
  customerName: "Entrega anterior",
  promisedDeliveryDate: "2026-08-01",
  currentStageId: "design",
};

const columns: BoardColumn[] = [
  { id: "received", code: "received", name: "Pedido recibido", position: 0, orders: [first] },
  { id: "design", code: "design", name: "Diseño", position: 1, orders: [earlier] },
];

const paidOrders: BoardOrder[] = [
  { ...first, id: "older-payment", publicNumber: 10, paymentConfirmedAt: "2026-08-01T10:00:00.000Z", totalAmount: 10 },
  { ...first, id: "newer-payment", publicNumber: 11, paymentConfirmedAt: "2026-08-02T10:00:00.000Z", totalAmount: 20 },
  { ...first, id: "without-payment", publicNumber: 12, paymentConfirmedAt: null, totalAmount: 30 },
];

describe("board movement state", () => {
  it("moves one order without duplicating it and preserves canonical ordering", () => {
    const moved = moveBoardOrder(columns, first.id, "design", "2026-07-29T04:00:00.000Z");
    expect(moved.flatMap((column) => column.orders).filter((order) => order.id === first.id)).toHaveLength(1);
    expect(moved[1]?.orders.map((order) => order.id)).toEqual(["earlier", "first"]);
    expect(moved[1]?.orders[1]?.updatedAt).toBe("2026-07-29T04:00:00.000Z");
  });

  it("treats the current stage as a no-op", () => {
    expect(moveBoardOrder(columns, first.id, "received")).toBe(columns);
  });

  it("does not lose an order when the destination is unknown", () => {
    expect(moveBoardOrder(columns, first.id, "missing")).toBe(columns);
  });

  it("orders paid cards by server confirmation time, then public number", () => {
    expect(sortPaidBoardOrders(paidOrders).map((order) => order.id)).toEqual(["newer-payment", "older-payment", "without-payment"]);
  });

  it("replaces a reconciled order with the canonical payment snapshot", () => {
    const snapshot = { ...first, currentStageId: "design", paymentConfirmedAt: "2026-08-03T10:00:00.000Z", totalAmount: 25 };
    const replaced = replaceBoardOrder(columns, snapshot);
    expect(replaced.flatMap((column) => column.orders).find((item) => item.id === first.id)).toEqual(snapshot);
    expect(replaced[0]?.orders).toHaveLength(0);
    expect(replaced[1]?.orders.find((item) => item.id === snapshot.id)?.paymentConfirmedAt).toBe(snapshot.paymentConfirmedAt);
  });
});
