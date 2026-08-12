import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireActiveProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

import { closeCashDayAction, correctCashMovementAction, createCashMovementAction, reopenCashDayAction, setCashOpeningAction, voidCashMovementAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireActiveProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const activeProfile = { id: "profile-id", displayName: "Operador", isActive: true, mustChangePassword: false };
const rpc = vi.fn();

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

const opening = () => form({ amount: "10.00", expectedOpeningUpdatedAt: "2026-08-06T03:00:00.000Z", idempotencyKey: "opening-key" });
const movement = () => form({ amount: "10.00", description: "Venta mostrador", direction: "income", expenseCategoryId: "", idempotencyKey: "movement-key" });
const correction = () => form({ movementId: "33333333-3333-4333-8333-333333333333", amount: "12.50", description: "Venta corregida", direction: "income", expenseCategoryId: "", idempotencyKey: "correction-key" });
const voidMovement = () => form({ movementId: "33333333-3333-4333-8333-333333333333", reason: "Carga duplicada", idempotencyKey: "void-key" });
const close = () => form({ cashDayId: "44444444-4444-4444-8444-444444444444", idempotencyKey: "close-key" });
const reopen = () => form({ cashDayId: "44444444-4444-4444-8444-444444444444", reason: "Corrección de cierre", idempotencyKey: "reopen-key" });

describe("cash server action contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveProfile).mockResolvedValue({ ...activeProfile, role: "attention" });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    rpc.mockResolvedValue({ data: [{}], error: null });
  });

  it("returns safe opening field errors before any RPC", async () => {
    const form = new FormData(); form.set("amount", "-1");
    const result = await setCashOpeningAction({}, form);
    expect(result.status).toBe("error");
    expect(result.message).toBe("El importe debe ser mayor o igual a cero.");
    expect(result.fieldErrors?.amount).toEqual(["El importe debe ser mayor o igual a cero."]);
    expect(requireActiveProfile).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns safe movement field errors before any RPC", async () => {
    const form = new FormData();
    for (const [name, value] of [["amount", "10.00"], ["description", "Movimiento"], ["direction", "transfer"], ["expenseCategoryId", ""], ["idempotencyKey", "cash-key"]]) form.set(name, value);
    const result = await createCashMovementAction({}, form);
    expect(result.status).toBe("error");
    expect(result.message).toBe("El tipo de movimiento no es válido.");
    expect(result.fieldErrors?.direction).toEqual(["El tipo de movimiento no es válido."]);
    expect(requireActiveProfile).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["correction", correctCashMovementAction, correction()],
    ["void", voidCashMovementAction, voidMovement()],
    ["close", closeCashDayAction, close()],
  ])("rejects invalid %s input before auth, client, or RPC", async (_, action, data) => {
    const invalid = new FormData();
    invalid.set("amount", data.get("amount") === null ? "" : String(data.get("amount")));
    const result = await action({}, invalid);
    expect(result.status).toBe("error");
    expect(requireActiveProfile).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the opening RPC for an authorized profile", async () => {
    const result = await setCashOpeningAction({}, opening());
    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("set_cash_opening", {
      p_amount: 10,
      p_expected_opening_updated_at: "2026-08-06T03:00:00.000Z",
      p_idempotency_key: "opening-key",
    });
  });

  it("denies opening before creating a client or calling RPC", async () => {
    vi.mocked(requireActiveProfile).mockResolvedValue({ ...activeProfile, role: "employee" });
    const result = await setCashOpeningAction({}, opening());
    expect(result.message).toBe("No tenés permiso para modificar la apertura de caja.");
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the movement RPC for an authorized profile", async () => {
    const result = await createCashMovementAction({}, movement());
    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("create_cash_movement", {
      p_direction: "income",
      p_amount: 10,
      p_description: "Venta mostrador",
      p_expense_category_id: null,
      p_idempotency_key: "movement-key",
    });
  });

  it("returns a generic error for an unknown database failure without success metadata", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "secret postgres detail" } });
    const result = await createCashMovementAction({}, movement());
    expect(result).toEqual(expect.objectContaining({ status: "error", message: "No se pudo actualizar la caja. Intentá nuevamente." }));
    expect(result.resetKey).toBeUndefined();
    expect(result.message).not.toContain("secret postgres detail");
  });

  it("denies movement before creating a client or calling RPC", async () => {
    vi.mocked(requireActiveProfile).mockResolvedValue({ ...activeProfile, role: "employee" });
    const result = await createCashMovementAction({}, movement());
    expect(result.message).toBe("No tenés permiso para crear movimientos de caja.");
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the correction RPC with normalized values and retains its key on failure", async () => {
    const result = await correctCashMovementAction({}, correction());
    expect(result.status).toBe("success");
    expect(result.resetKey).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("correct_cash_movement", { p_movement_id: "33333333-3333-4333-8333-333333333333", p_direction: "income", p_amount: 12.5, p_description: "Venta corregida", p_expense_category_id: null, p_idempotency_key: "correction-key" });

    rpc.mockResolvedValueOnce({ data: null, error: { message: "La clave de idempotencia ya fue utilizada para otra corrección." } });
    const failed = await correctCashMovementAction({}, correction());
    expect(failed.message).toBe("La clave de idempotencia ya fue utilizada para otra corrección.");
    expect(failed.resetKey).toBeUndefined();
  });

  it("requires Atención to provide a void reason before calling the RPC", async () => {
    const result = await voidCashMovementAction({}, form({ movementId: "33333333-3333-4333-8333-333333333333", reason: "", idempotencyKey: "void-key" }));
    expect(result.message).toBe("Atención debe indicar un motivo de anulación de 2 a 500 caracteres.");
    expect(result.fieldErrors?.reason).toEqual(["Atención debe indicar un motivo de anulación de 2 a 500 caracteres."]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls void for an authorized profile and restricts close to managers", async () => {
    const voidResult = await voidCashMovementAction({}, voidMovement());
    expect(voidResult.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("void_cash_movement", { p_movement_id: "33333333-3333-4333-8333-333333333333", p_reason: "Carga duplicada", p_idempotency_key: "void-key" });

    vi.mocked(requireActiveProfile).mockResolvedValue({ ...activeProfile, role: "attention" });
    const denied = await closeCashDayAction({}, close());
    expect(denied.message).toBe("No tenés permiso para cerrar la caja.");
    expect(rpc).toHaveBeenCalledTimes(1);

    vi.mocked(requireActiveProfile).mockResolvedValue({ ...activeProfile, role: "admin" });
    const closed = await closeCashDayAction({}, close());
    expect(closed.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("close_cash_day", { p_cash_day_id: "44444444-4444-4444-8444-444444444444", p_idempotency_key: "close-key" });
  });

  it("calls reopen for Atención and denies Employee before RPC", async () => {
    const result = await reopenCashDayAction({}, reopen());
    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("reopen_cash_day", { p_cash_day_id: "44444444-4444-4444-8444-444444444444", p_reason: "Corrección de cierre", p_idempotency_key: "reopen-key" });
    vi.mocked(requireActiveProfile).mockResolvedValue({ ...activeProfile, role: "employee" });
    const denied = await reopenCashDayAction({}, reopen());
    expect(denied.message).toBe("No tenés permiso para reabrir la caja.");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
