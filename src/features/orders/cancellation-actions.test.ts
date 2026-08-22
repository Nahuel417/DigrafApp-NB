import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";

import { cancelOrderAction, restoreOrderAction } from "./cancellation-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/current-profile", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const activeAdmin = { id: "admin-id", displayName: "Admin", isActive: true, mustChangePassword: false, role: "admin" as const };
const rpc = vi.fn();

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

const validCancel = () => form({
  orderId: "11111111-1111-4111-8111-111111111111",
  expectedUpdatedAt: "2026-08-14T12:00:00.000Z",
  reason: "Cliente solicitó cancelar",
  idempotencyKey: "cancel-key",
});

const validRestore = () => form({
  orderId: "11111111-1111-4111-8111-111111111111",
  expectedUpdatedAt: "2026-08-14T12:00:00.000Z",
  idempotencyKey: "restore-key",
});

describe("M15 cancellation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentProfile).mockResolvedValue(activeAdmin);
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    rpc.mockResolvedValue({ data: [{ order_id: "11111111-1111-4111-8111-111111111111", lifecycle_state: "cancelled", updated_at: "2026-08-14T12:01:00.000Z" }], error: null });
  });

  it("validates before auth and calls the cancellation RPC for an Admin", async () => {
    const invalid = await cancelOrderAction({}, form({ reason: "x" }));
    expect(invalid).toMatchObject({ status: "error" });
    expect(getCurrentProfile).not.toHaveBeenCalled();

    const result = await cancelOrderAction({}, validCancel());
    expect(result).toMatchObject({ status: "success", message: "Pedido anulado y enviado al Archivo." });
    expect(rpc).toHaveBeenCalledWith("cancel_order", {
      p_order_id: "11111111-1111-4111-8111-111111111111",
      p_expected_updated_at: "2026-08-14T12:00:00.000Z",
      p_reason: "Cliente solicitó cancelar",
      p_idempotency_key: "cancel-key",
    });
  });

  it.each([
    ["permission_denied", "No tenés permiso para anular pedidos."],
    ["payment_m12", "Revertí el pago mediante M12 antes de anularlo."],
    ["version_conflict", "El pedido cambió en otra sesión. Actualizá el Archivo e intentá nuevamente."],
    ["idempotency_conflict", "La clave de idempotencia ya fue utilizada para otra anulación."],
  ])("maps cancellation error %s without exposing database details", async (code, message) => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: code } });
    const result = await cancelOrderAction({}, validCancel());
    expect(result).toMatchObject({ status: "error", message });
  });

  it("denies non-manager profiles before creating the client", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeAdmin, role: "attention" });
    const result = await cancelOrderAction({}, validCancel());
    expect(result).toMatchObject({ status: "error", message: "No tenés permiso para anular pedidos." });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("M15 restore action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentProfile).mockResolvedValue(activeAdmin);
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    rpc.mockResolvedValue({ data: [{ order_id: "11111111-1111-4111-8111-111111111111", lifecycle_state: "active", updated_at: "2026-08-14T12:02:00.000Z" }], error: null });
  });

  it("calls restore_order and reports the canonical result", async () => {
    const result = await restoreOrderAction({}, validRestore());
    expect(result).toMatchObject({ status: "success", message: "Pedido restaurado y retirado del Archivo." });
    expect(rpc).toHaveBeenCalledWith("restore_order", {
      p_order_id: "11111111-1111-4111-8111-111111111111",
      p_expected_updated_at: "2026-08-14T12:00:00.000Z",
      p_idempotency_key: "restore-key",
    });
  });

  it.each([
    ["permission_denied", "No tenés permiso para restaurar pedidos."],
    ["expired", "La ventana de restauración de 30 días ya venció."],
    ["version_conflict", "El pedido cambió en otra sesión. Actualizá el Archivo e intentá nuevamente."],
  ])("maps restore error %s safely", async (code, message) => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: code } });
    const result = await restoreOrderAction({}, validRestore());
    expect(result).toMatchObject({ status: "error", message });
  });
});
