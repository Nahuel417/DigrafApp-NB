import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";

import { executeStockOperationAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/current-profile", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const activeProfile = {
  id: "profile-id",
  displayName: "Operador",
  isActive: true,
  mustChangePassword: false,
};

const key = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const movementId = "33333333-3333-4333-8333-333333333333";
const date = "2026-10-01";

const rpc = vi.fn();

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

const forms = {
  create: form({ action: "create", idempotencyKey: key, name: "Tela nueva", quantity: "1", date, price: "100.00" }),
  purchase: form({ action: "purchase", idempotencyKey: key, itemId, quantity: "1", date, price: "100.00" }),
  consumption: form({ action: "consumption", idempotencyKey: key, itemId, quantity: "1", date }),
  cancel: form({ action: "cancel", idempotencyKey: key, itemId, movementId, reason: "Carga incorrecta" }),
  rename: form({ action: "rename", idempotencyKey: key, itemId, name: "Tela renombrada" }),
  activate: form({ action: "activate", idempotencyKey: key, itemId, active: "false" }),
};

describe("stock server action permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeProfile, role: "employee" });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    rpc.mockResolvedValue({ data: { item_id: itemId }, error: null });
  });

  it.each(["create", "purchase", "consumption"] as const)("lets employees run %s", async (action) => {
    const result = await executeStockOperationAction({}, forms[action]);

    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0]?.[0]).toBe("execute_stock_operation");
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_action: action, p_key: key });
  });

  it.each(["cancel", "rename", "activate"] as const)("rejects employee %s before the RPC", async (action) => {
    const result = await executeStockOperationAction({}, forms[action]);

    expect(result.status).toBe("error");
    expect(result.message).toBe("No tenés permiso para administrar el stock de telas.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects attention even for employee operations", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeProfile, role: "attention" });

    const result = await executeStockOperationAction({}, forms.consumption);

    expect(result.status).toBe("error");
    expect(result.message).toBe("No tenés permiso para administrar el stock de telas.");
    expect(rpc).not.toHaveBeenCalled();
  });
});