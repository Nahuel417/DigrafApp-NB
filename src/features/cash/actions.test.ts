import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireActiveProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

import { createCashMovementAction, setCashOpeningAction } from "./actions";

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

  it("denies movement before creating a client or calling RPC", async () => {
    vi.mocked(requireActiveProfile).mockResolvedValue({ ...activeProfile, role: "employee" });
    const result = await createCashMovementAction({}, movement());
    expect(result.message).toBe("No tenés permiso para crear movimientos de caja.");
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
