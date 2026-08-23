import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";

import { archiveDeliveredOrderAction, cancelOrderAction, purgeCancelledOrderAction, restoreOrderAction, unarchiveDeliveredOrderAction } from "./cancellation-actions";

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

const validArchive = () => form({
  orderId: "11111111-1111-4111-8111-111111111111",
  expectedUpdatedAt: "2026-08-14T12:00:00.000Z",
  idempotencyKey: "archive-key",
});

const validPurge = () => form({
  orderId: "11111111-1111-4111-8111-111111111111",
  idempotencyKey: "purge-key",
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

describe("M16 delivered archive and purge actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentProfile).mockResolvedValue(activeAdmin);
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    rpc.mockResolvedValue({ data: { order_id: "11111111-1111-4111-8111-111111111111", public_number: 12, lifecycle_state: "archived_delivered", updated_at: "2026-08-14T12:01:00.000Z" }, error: null });
  });

  it("validates archive input before auth and calls the archive RPC", async () => {
    const invalid = await archiveDeliveredOrderAction({}, form({ orderId: "bad" }));
    expect(invalid).toMatchObject({ status: "error" });
    expect(getCurrentProfile).not.toHaveBeenCalled();

    const result = await archiveDeliveredOrderAction({}, validArchive());
    expect(result).toMatchObject({ status: "success", message: "Pedido entregado archivado." });
    expect(rpc).toHaveBeenCalledWith("archive_delivered_order", {
      p_order_id: "11111111-1111-4111-8111-111111111111",
      p_expected_updated_at: "2026-08-14T12:00:00.000Z",
      p_idempotency_key: "archive-key",
    });
  });

  it("rejects actor and role fields instead of trusting submitted form data", async () => {
    const data = validArchive();
    data.set("actorId", "attacker-id");
    data.set("role", "super_admin");

    const result = await archiveDeliveredOrderAction({}, data);

    expect(result).toMatchObject({ status: "error", code: "invalid_request", message: "No se pudo archivar el pedido entregado. Intentá nuevamente." });
    expect(getCurrentProfile).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps purge authority separate from delivered archive authority", async () => {
    const denied = await purgeCancelledOrderAction({}, validPurge());
    expect(denied).toMatchObject({ status: "error", message: "No tenés permiso para purgar pedidos anulados." });

    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeAdmin, role: "super_admin" });
    rpc.mockResolvedValueOnce({ data: { order_id: "11111111-1111-4111-8111-111111111111", public_number: 12, lifecycle_state: "purged_cancelled", updated_at: "2026-08-14T12:01:00.000Z" }, error: null });
    const result = await purgeCancelledOrderAction({}, form({ orderId: "11111111-1111-4111-8111-111111111111", idempotencyKey: "purge-key" }));
    expect(result).toMatchObject({ status: "success", message: "Pedido anulado purgado." });
    expect(rpc).toHaveBeenCalledWith("purge_cancelled_order", {
      p_order_id: "11111111-1111-4111-8111-111111111111",
      p_idempotency_key: "purge-key",
    });
  });
});

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function revalidatedPaths(): string[] {
  return vi.mocked(revalidatePath).mock.calls.map((call) => call[0]);
}

function expectCanonicalLifecyclePaths() {
  const paths = revalidatedPaths();
  expect(paths).toContain("/orders/archives");
  expect(paths).toContain("/orders");
  expect(paths).toContain(`/orders/${ORDER_ID}`);
  expect(paths).not.toContain("/orders/archive");
  expect(paths).not.toContain("/orders/archive/delivered");
}

describe("lifecycle revalidation paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentProfile).mockResolvedValue(activeAdmin);
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
  });

  it("cancelOrderAction revalidates /orders/archives and /orders and the order detail, never the legacy archive routes", async () => {
    rpc.mockResolvedValue({ data: [{ order_id: ORDER_ID, lifecycle_state: "cancelled", updated_at: "2026-08-14T12:01:00.000Z" }], error: null });

    await cancelOrderAction({}, validCancel());

    expectCanonicalLifecyclePaths();
  });

  it("restoreOrderAction revalidates /orders/archives and /orders and the order detail, never the legacy archive routes", async () => {
    rpc.mockResolvedValue({ data: [{ order_id: ORDER_ID, lifecycle_state: "active", updated_at: "2026-08-14T12:02:00.000Z" }], error: null });

    await restoreOrderAction({}, validRestore());

    expectCanonicalLifecyclePaths();
  });

  it("archiveDeliveredOrderAction revalidates /orders/archives and /orders and the order detail, never the legacy archive routes", async () => {
    rpc.mockResolvedValue({ data: { order_id: ORDER_ID, public_number: 12, lifecycle_state: "archived_delivered", updated_at: "2026-08-14T12:01:00.000Z" }, error: null });

    await archiveDeliveredOrderAction({}, validArchive());

    expectCanonicalLifecyclePaths();
  });

  it("unarchiveDeliveredOrderAction revalidates /orders/archives and /orders and the order detail, never the legacy archive routes", async () => {
    rpc.mockResolvedValue({ data: { order_id: ORDER_ID, public_number: 12, lifecycle_state: "delivered", updated_at: "2026-08-14T12:01:00.000Z" }, error: null });

    await unarchiveDeliveredOrderAction({}, validArchive());

    expectCanonicalLifecyclePaths();
  });

  it("purgeCancelledOrderAction revalidates /orders/archives and /orders and the order detail, never the legacy archive routes", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeAdmin, role: "super_admin" });
    rpc.mockResolvedValue({ data: { order_id: ORDER_ID, public_number: 12, lifecycle_state: "purged_cancelled", updated_at: "2026-08-14T12:01:00.000Z" }, error: null });

    await purgeCancelledOrderAction({}, validPurge());

    expectCanonicalLifecyclePaths();
  });

});
