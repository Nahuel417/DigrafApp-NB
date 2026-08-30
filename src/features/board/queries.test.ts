import { describe, expect, it } from "vitest";

import { buildBoardColumns, type BoardOrder, type BoardStage } from "./queries";

const stages: BoardStage[] = [
  { id: "received", code: "received", name: "Pedido recibido", position: 0 },
  { id: "design", code: "design", name: "Diseño", position: 1 },
  { id: "cut", code: "cut", name: "Corte", position: 2 },
];

const order = (id: string, currentStageId: string, promisedDeliveryDate: string, publicNumber: number): BoardOrder => ({
  id,
  publicNumber,
       customerName: `Equipo ${id}`,
       teamName: `Equipo ${id}`,
  quantity: 1,
  orderType: "individual",
  productName: "Remera básica",
  promisedDeliveryDate,
  currentStageId,
  updatedAt: "2026-07-29T03:00:00.000Z",
   primaryDesignImage: null,
  totalAmount: null,
  paymentConfirmedAt: null,
});

describe("order board queries", () => {
  it("orders stages and counts every order exactly once", () => {
    const columns = buildBoardColumns([...stages].reverse(), [
      order("two", "received", "2026-08-02", 2),
      order("one", "received", "2026-08-01", 1),
      order("three", "design", "2026-08-01", 3),
    ]);

    expect(columns.map((column) => column.code)).toEqual(["received", "design", "cut"]);
    expect(columns.map((column) => column.orders.length)).toEqual([2, 1, 0]);
    expect(columns.flatMap((column) => column.orders).map((item) => item.id)).toEqual(["one", "two", "three"]);
  });

  it("rejects duplicate orders or an unavailable stage instead of silently dropping data", () => {
    const item = order("one", "received", "2026-08-01", 1);
    expect(() => buildBoardColumns(stages, [item, item])).toThrow("duplicado");
    expect(() => buildBoardColumns(stages, [order("orphan", "missing", "2026-08-01", 1)])).toThrow("no está disponible");
  });

  it("uses a non-financial DTO", () => {
    const item = order("one", "received", "2026-08-01", 1);
    expect(item.totalAmount).toBeNull();
    expect(item).not.toHaveProperty("depositAmount");
    expect(item).not.toHaveProperty("depositPaid");
  });
});
