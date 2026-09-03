import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";

import { confirmOrderPaymentAction, reverseOrderPaymentAction, setOrderLabelAction } from "./actions";
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

const validReversalForm = () => form({
  orderId: "11111111-1111-4111-8111-111111111111",
  paymentId: "22222222-2222-4222-8222-222222222222",
  expectedUpdatedAt: "2026-08-12T19:00:00.000Z",
  idempotencyKey: "reversal-key",
  reason: "Corrección solicitada",
});

const validLabelForm = () => form({
  orderId: "11111111-1111-4111-8111-111111111111",
  label: "urgent",
  expectedUpdatedAt: "2026-08-12T19:00:00.000Z",
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
      teamName: "Equipo",
      quantity: 1,
      orderType: "individual" as const,
      label: null,
      promisedDeliveryDate: "2026-08-13",
      currentStageId: "22222222-2222-4222-8222-222222222222",
      updatedAt: "2026-08-12T19:02:00.000Z",
      primaryDesignImage: null,
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

describe("reverse order payment action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeProfile, role: "admin" });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    rpc.mockResolvedValue({ data: [{ order_id: "11111111-1111-4111-8111-111111111111", payment_id: "22222222-2222-4222-8222-222222222222", reversal_cash_movement_id: "44444444-4444-4444-8444-444444444444", event_id: "55555555-5555-4555-8555-555555555555", updated_at: "2026-08-12T19:02:00.000Z", amount: 100 }], error: null });
  });

  it("rejects malformed input before auth or RPC", async () => {
    const result = await reverseOrderPaymentAction({}, form({ orderId: "invalid" }));
    expect(result).toMatchObject({ status: "error", code: "invalid_request" });
    expect(getCurrentProfile).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the secure RPC and reconciles the board snapshot", async () => {
    const result = await reverseOrderPaymentAction({}, validReversalForm());

    expect(result).toMatchObject({ status: "success", paymentId: "22222222-2222-4222-8222-222222222222" });
    expect(rpc).toHaveBeenCalledWith("reverse_order_payment", {
      p_order_id: "11111111-1111-4111-8111-111111111111",
      p_payment_id: "22222222-2222-4222-8222-222222222222",
      p_expected_updated_at: "2026-08-12T19:00:00.000Z",
      p_idempotency_key: "reversal-key",
      p_reason: "Corrección solicitada",
    });
  });

  it("allows Attention to reverse payment through the secure RPC", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(activeProfile);

    const result = await reverseOrderPaymentAction({}, validReversalForm());

    expect(result).toMatchObject({ status: "success", paymentId: "22222222-2222-4222-8222-222222222222" });
    expect(createClient).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("reverse_order_payment", expect.any(Object));
  });

  it("denies Employee before creating the client", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeProfile, role: "employee" });

    const result = await reverseOrderPaymentAction({}, validReversalForm());

    expect(result).toMatchObject({ status: "error", code: "permission_denied", message: "No tenés permiso para revertir pagos." });
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a closed cash rejection to a safe message and snapshot", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "cash_closed" } });

    const result = await reverseOrderPaymentAction({}, validReversalForm());

    expect(result).toMatchObject({ status: "error", code: "cash_closed", message: "La caja está cerrada y no admite reversiones." });
    expect(result.reconciledOrder?.id).toBe("11111111-1111-4111-8111-111111111111");
  });
});

describe("set order label action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentProfile).mockResolvedValue(activeProfile);
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    rpc.mockResolvedValue({ data: [{ label: "urgent", updated_at: "2026-08-12T19:01:00.000Z" }], error: null });
  });

  it("rejects malformed input before auth or RPC", async () => {
    const result = await setOrderLabelAction({}, form({ orderId: "invalid", label: "urgent" }));

    expect(result).toMatchObject({ status: "error", code: "invalid_request" });
    expect(getCurrentProfile).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the secure RPC without an idempotency key and accepts removal for an authorized role", async () => {
    const result = await setOrderLabelAction({}, form({
      orderId: "11111111-1111-4111-8111-111111111111",
      label: "",
      expectedUpdatedAt: "2026-08-12T19:00:00.000Z",
    }));

    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("set_order_label", {
      p_order_id: "11111111-1111-4111-8111-111111111111",
      p_label: null,
      p_expected_updated_at: "2026-08-12T19:00:00.000Z",
    });
  });

  it.each(["super_admin", "admin", "attention", "employee"] as const)("allows %s through the server action", async (role) => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeProfile, role });

    const result = await setOrderLabelAction({}, validLabelForm());

    expect(result.status).toBe("success");
  });

  it("reconciles the canonical order after a version conflict", async () => {
    const snapshot = {
      id: "11111111-1111-4111-8111-111111111111",
      publicNumber: 7,
      customerName: "Equipo",
      teamName: "Equipo",
      quantity: 1,
      orderType: "individual" as const,
      label: "returned" as const,
      promisedDeliveryDate: "2026-08-13",
      currentStageId: "22222222-2222-4222-8222-222222222222",
      updatedAt: "2026-08-12T19:02:00.000Z",
      primaryDesignImage: null,
      totalAmount: 100,
      paymentConfirmedAt: null,
    };
    vi.mocked(getOrderBoardSnapshot).mockResolvedValue(snapshot);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "version_conflict" } });

    const result = await setOrderLabelAction({}, validLabelForm());

    expect(result).toMatchObject({ status: "error", code: "version_conflict", reconciledOrder: snapshot });
    expect(getOrderBoardSnapshot).toHaveBeenCalledWith(snapshot.id, "attention");
  });
});
