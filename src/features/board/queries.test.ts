import { describe, expect, it, vi } from "vitest";

import { buildBoardColumns, getOrderBoard, getOrderBoardSnapshot, type BoardOrder, type BoardStage } from "./queries";

const client = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));

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
  label: null,
  productName: "Remera básica",
  promisedDeliveryDate,
  currentStageId,
  updatedAt: "2026-07-29T03:00:00.000Z",
   primaryDesignImage: null,
  totalAmount: null,
  paymentConfirmedAt: null,
});

describe("order board queries", () => {
  it("loads structured bag and flag markers in one batch and keeps them in snapshots", async () => {
    const row = { id: "mixed", current_stage_id: "received", public_number: 1, product_name: "Nombre sin tipo", promised_delivery_date: "2026-08-02" };
    const lines = vi.fn().mockResolvedValue({ data: [
      { order_id: "mixed", line_type: "individual" }, { order_id: "mixed", line_type: "bag" },
      { order_id: "mixed", line_type: "flag" }, { order_id: "mixed", line_type: "bag" },
      { order_id: "bags", line_type: "bag" }, { order_id: "flags", line_type: "flag" },
      { order_id: "ordinary", line_type: "individual" },
    ], error: null });
    client.from.mockImplementation((table: string) => table === "workflow_stages"
      ? { select: () => ({ eq: () => ({ order: async () => ({ data: stages, error: null }) }) }) }
      : { select: () => ({ in: (column: string, ids: string[]) => {
        expect(column).toBe("order_id");
        expect(ids).toEqual(ids.length === 1 ? ["mixed"] : ["mixed", "bags", "flags", "ordinary"]);
        return { order: () => ({ range: lines }) };
      } }) });
    client.rpc.mockResolvedValue({ data: [row, { ...row, id: "bags" }, { ...row, id: "flags" }, { ...row, id: "ordinary", product_name: "Bolso en el nombre" }], error: null });
    const board = await getOrderBoard();
    expect(board.columns[0]?.orders[0]?.specialProductTypes).toEqual(["bag", "flag"]);
    expect(board.columns[0]?.orders.find((order) => order.id === "bags")?.specialProductTypes).toEqual(["bag"]);
    expect(board.columns[0]?.orders.find((order) => order.id === "flags")?.specialProductTypes).toEqual(["flag"]);
    expect(board.columns[0]?.orders.find((order) => order.id === "ordinary")?.specialProductTypes).toEqual([]);
    expect(lines).toHaveBeenCalledTimes(1);
    expect(lines).toHaveBeenCalledWith(0, 999);
    client.rpc.mockResolvedValue({ data: [row], error: null });
    const snapshot = await getOrderBoardSnapshot("mixed");
    expect(snapshot?.specialProductTypes).toEqual(["bag", "flag"]);
  });
  it("preserves payment and label fields when enriching a snapshot", async () => {
    const row = { id: "snapshot", public_number: 42, customer_name: "Cliente", team_name: "Equipo", quantity: 10,
      label: "urgent", product_name: "Producto", promised_delivery_date: "2026-08-02", current_stage_id: "received",
      updated_at: "2026-07-30T00:00:00Z", image_updated_at: null, total_amount: 12500, payment_confirmed_at: "2026-07-30T01:00:00Z" };
    client.from.mockImplementation(() => ({ select: () => ({ in: () => ({ order: () => ({ range: async () => ({ data: [{ order_id: row.id, line_type: "flag" }], error: null }) }) }) }) }));
    client.rpc.mockResolvedValue({ data: [row], error: null });
    expect(await getOrderBoardSnapshot(row.id)).toMatchObject({ id: row.id, label: "urgent", totalAmount: 12500,
      paymentConfirmedAt: row.payment_confirmed_at, specialProductTypes: ["flag"] });
  });

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
