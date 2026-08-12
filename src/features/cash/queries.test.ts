import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { getCashDaySummary, getCurrentCash, listClosedCashDays, mapCashDaySummary, mapCashSummary } from "./queries";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const base = { cash_day_id: "11111111-1111-4111-8111-111111111111", opening_updated_at: "2026-08-06T03:00:00.000Z", operational_date: "2026-08-06" };
const closed = { closed_at: "2026-08-07T03:00:00.000Z", closed_by: "55555555-5555-4555-8555-555555555555", closure_kind: "manual", closing_balance: "115.25" };

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
    expect(() => mapCashSummary({ ...base, categories: [], current_balance: "0.00", opening_balance: 0, movements: [], ...override })).toThrow("La respuesta de caja");
  });

  it("maps an unknown RPC error to a safe message", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "internal database details" } });
    await expect(getCurrentCash()).rejects.toThrow("No se pudo cargar la caja del día. Intentá nuevamente.");
    await expect(getCurrentCash()).rejects.not.toThrow("internal database details");
  });

  it("maps effective movement state and closure metadata without losing exact decimals", () => {
    const summary = mapCashSummary({ ...base, ...closed, categories: [], current_balance: "115.25", opening_balance: 100, movements: [{ id: "33333333-3333-4333-8333-333333333333", direction: "income", amount: 15.25, description: "Corregido", expense_category_id: null, expense_category_code: null, expense_category_name: null, actor_id: "44444444-4444-4444-8444-444444444444", created_at: "2026-08-06T03:10:00.000Z" }] });
    expect(summary).toMatchObject({ closedAt: closed.closed_at, closureKind: "manual", closingBalance: "115.25" });
    expect(summary.movements[0]).toMatchObject({ id: "33333333-3333-4333-8333-333333333333", amount: "15.25" });
  });

  it("maps read-only history events and rejects malformed audit entries", () => {
    const history = mapCashDaySummary({ ...base, ...closed, opening_balance: 100, movements: [{ id: "33333333-3333-4333-8333-333333333333", direction: "income", amount: 15.25, description: "Corregido", expense_category_id: null, expense_category_code: null, expense_category_name: null, actor_id: "44444444-4444-4444-8444-444444444444", actor_display_name: "Operador", created_at: "2026-08-06T03:10:00.000Z" }], events: [{ id: "66666666-6666-4666-8666-666666666666", movement_id: "33333333-3333-4333-8333-333333333333", event_type: "correction", previous_state: { amount: "10.00" }, new_state: { amount: "15.25" }, reason: null, actor_id: "44444444-4444-4444-8444-444444444444", actor_display_name: "Operador", created_at: "2026-08-06T03:11:00.000Z" }], lifecycle_events: [{ id: "77777777-7777-4777-8777-777777777777", sequence_no: 2, event_type: "reopen", closure_kind: null, closing_balance: null, actor_id: "44444444-4444-4444-8444-444444444444", actor_display_name: "Operador", created_at: "2026-08-06T03:12:00.000Z", reason: "Corrección" }] });
    expect(history.events[0]).toMatchObject({ eventType: "correction", movementId: "33333333-3333-4333-8333-333333333333", reason: null });
    expect(history.lifecycleEvents[0]).toMatchObject({ eventType: "reopen", actorDisplayName: "Operador", reason: "Corrección", sequenceNo: 2 });
    expect(history.movements).toHaveLength(1);
    expect(() => mapCashDaySummary({ ...base, ...closed, opening_balance: 0, movements: [], events: [{ id: "bad", movement_id: "bad", event_type: "unknown", previous_state: {}, new_state: null, reason: null, actor_id: "bad", created_at: "bad" }] } as never)).toThrow("La respuesta de caja");
  });

  it("loads closed-day options and a selected history through typed RPCs", async () => {
    rpc.mockImplementation(async (name: string) => name === "list_closed_cash_days"
      ? { data: [{ cash_day_id: base.cash_day_id, operational_date: base.operational_date, ...closed }], error: null }
      : { data: [{ cash_day_id: base.cash_day_id, operational_date: base.operational_date, opening_balance: 100, opening_updated_at: base.opening_updated_at, ...closed, movements: [], events: [] }], error: null });
    await expect(listClosedCashDays()).resolves.toEqual([{ cashDayId: base.cash_day_id, operationalDate: base.operational_date, closedAt: closed.closed_at, closedBy: closed.closed_by, closedByDisplayName: null, closureKind: "manual", closingBalance: "115.25" }]);
    await expect(getCashDaySummary(base.cash_day_id)).resolves.toMatchObject({ cashDayId: base.cash_day_id, closureKind: "manual", movements: [], events: [] });
    expect(rpc).toHaveBeenNthCalledWith(1, "list_closed_cash_days");
    expect(rpc).toHaveBeenNthCalledWith(2, "get_cash_day_summary", { p_cash_day_id: base.cash_day_id });
  });

  it.each([
    ["malformed closed-day list", "list_closed_cash_days", { data: [{ cash_day_id: base.cash_day_id }], error: null }],
    ["malformed history", "get_cash_day_summary", { data: [{ ...base, movements: "bad", events: [] }], error: null }],
  ])("rejects %s RPC shapes", async (_, name, response) => {
    rpc.mockImplementationOnce(async () => response);
    await expect(name === "list_closed_cash_days" ? listClosedCashDays() : getCashDaySummary(base.cash_day_id)).rejects.toThrow("La respuesta de caja");
  });
});
