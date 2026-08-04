import { describe, expect, it } from "vitest";

import { moveBoardOrder } from "./board-state";
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
});
