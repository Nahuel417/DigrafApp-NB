import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCash, mapCashSummary } from "./queries";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const base = { cash_day_id: "11111111-1111-4111-8111-111111111111", opening_updated_at: "2026-08-06T03:00:00.000Z", operational_date: "2026-08-06" };

const rpc = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue({ rpc } as never);
});

describe("cash summary mapping", () => {
  it("keeps exact decimals and maps derived current-day records", () => {
    const summary = mapCashSummary({ ...base, categories: [{ id: "22222222-2222-4222-8222-222222222222", code: "materials", name: "Materiales/insumos" }], current_balance: "115.25", opening_balance: 100, movements: [{ id: "33333333-3333-4333-8333-333333333333", direction: "expense", amount: 10.25, description: "Compra", expense_category_id: null, expense_category_code: null, expense_category_name: null, actor_id: "44444444-4444-4444-8444-444444444444", created_at: "2026-08-06T03:10:00.000Z" }] });
    expect(summary.currentBalance).toBe("115.25");
    expect(summary.openingBalance).toBe("100.00");
    expect(summary.movements[0]).toMatchObject({ amount: "10.25", direction: "expense" });
    expect(summary.categories[0]?.code).toBe("materials");
  });

  it("maps a genuine untouched day to zero and empty lists", () => {
    const summary = mapCashSummary({ ...base, categories: [], current_balance: "0.00", opening_balance: 0, movements: [] });
    expect(summary.currentBalance).toBe("0.00");
    expect(summary.movements).toEqual([]);
    expect(summary.categories).toEqual([]);
  });

  it("maps a signed unbounded aggregate balance without changing bounded fields", () => {
    const summary = mapCashSummary({ ...base, categories: [], current_balance: "-1000000000000.01", opening_balance: 0, movements: [] });
    expect(summary.currentBalance).toBe("-1000000000000.01");
    expect(summary.openingBalance).toBe("0.00");
  });

  it("accepts the positive aggregate boundary but keeps opening and movement amounts bounded", () => {
    expect(mapCashSummary({ ...base, categories: [], current_balance: "1000000000000.01", opening_balance: 0, movements: [] }).currentBalance)
      .toBe("1000000000000.01");
    expect(() => mapCashSummary({ ...base, categories: [], current_balance: "0.00", opening_balance: 1000000000000.01, movements: [] })).toThrow("La respuesta de caja");
  });

  it.each([
    ["an invalid decimal", { current_balance: "not-money" }],
    ["an invalid direction", { movements: [{ id: "movement-id", direction: "transfer", amount: 1, description: null, expense_category_id: null, expense_category_code: null, expense_category_name: null, actor_id: "actor-id", created_at: "2026-08-06T03:10:00.000Z" }] }],
  ])("rejects a response with %s", (_, override) => {
    expect(() => mapCashSummary({ ...base, categories: [], current_balance: "0.00", opening_balance: 0, movements: [], ...override } as never)).toThrow("La respuesta de caja");
  });

  it("maps an unknown RPC error to a safe message", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "internal database details" } });
    await expect(getCurrentCash()).rejects.toThrow("No se pudo cargar la caja del día. Intentá nuevamente.");
    await expect(getCurrentCash()).rejects.not.toThrow("internal database details");
  });
});
