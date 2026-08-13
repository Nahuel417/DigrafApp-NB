import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";

import { confirmOrderPaymentAction } from "./actions";
import { getOrderBoardSnapshot } from "./queries";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/current-profile", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("./queries", () => ({ getOrderBoardSnapshot: vi.fn() }));

const activeProfile = { id: "profile-id", displayName: "Operador", isActive: true, mustChangePassword: false, role: "attention" as const };
const rpc = vi.fn();

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

const validForm = () => form({
  orderId: "11111111-1111-4111-8111-111111111111",
  expectedUpdatedAt: "2026-08-12T19:00:00.000Z",
  idempotencyKey: "payment-key",
});

describe("confirm order payment action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentProfile).mockResolvedValue(activeProfile);
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    rpc.mockResolvedValue({ data: [{ payment_id: "payment-id", cash_movement_id: "movement-id", amount: 100, confirmed_at: "2026-08-12T19:01:00.000Z" }], error: null });
  });

  it("rejects malformed input before auth or RPC", async () => {
    const result = await confirmOrderPaymentAction({}, form({ orderId: "invalid" }));

    expect(result).toMatchObject({ status: "error", message: "El pedido seleccionado no es válido." });
    expect(getCurrentProfile).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the secure RPC for an authorized profile and returns payment metadata", async () => {
    const result = await confirmOrderPaymentAction({}, validForm());

    expect(result.status).toBe("success");
    expect(result.paymentId).toBe("payment-id");
    expect(result.cashMovementId).toBe("movement-id");
    expect(rpc).toHaveBeenCalledWith("confirm_order_payment", {
      p_order_id: "11111111-1111-4111-8111-111111111111",
      p_expected_updated_at: "2026-08-12T19:00:00.000Z",
      p_idempotency_key: "payment-key",
    });
  });

  it("denies Employee before creating the client", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeProfile, role: "employee" });

    const result = await confirmOrderPaymentAction({}, validForm());

    expect(result).toMatchObject({ status: "error", message: "No tenés permiso para confirmar pagos." });
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["permission_denied", "No tenés permiso para confirmar pagos."],
    ["version_conflict", "El pedido cambió en otra sesión. Actualizá el tablero e intentá nuevamente."],
    ["idempotency_conflict", "La clave de idempotencia ya fue utilizada para otra confirmación de pago."],
    ["cash_closed", "La caja está cerrada y no admite nuevas cobranzas."],
    ["already_paid", "El pedido ya está pagado."],
    ["invalid_stage", "La etapa Pagado no está disponible."],
  ])("maps %s to a safe message", async (code, message) => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: code } });

    const result = await confirmOrderPaymentAction({}, validForm());

    expect(result).toMatchObject({ status: "error", message });
    expect(result.code).toBe(code);
  });

  it("returns the canonical board snapshot for a recoverable rejection", async () => {
    const snapshot = {
      id: "11111111-1111-4111-8111-111111111111",
      publicNumber: 7,
      customerName: "Equipo",
      quantity: 1,
      orderType: "individual" as const,
      promisedDeliveryDate: "2026-08-13",
      currentStageId: "22222222-2222-4222-8222-222222222222",
      updatedAt: "2026-08-12T19:02:00.000Z",
      hasDesignImage: false,
      imageUpdatedAt: null,
      totalAmount: 100,
      paymentConfirmedAt: null,
    };
    vi.mocked(getOrderBoardSnapshot).mockResolvedValue(snapshot);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "version_conflict" } });

    const result = await confirmOrderPaymentAction({}, validForm());

    expect(result).toMatchObject({ status: "error", code: "version_conflict", reconciledOrder: snapshot });
    expect(getOrderBoardSnapshot).toHaveBeenCalledWith(snapshot.id, "attention");
  });
});
