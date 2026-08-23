"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { mutationResult, type MutationState } from "@/lib/action-state";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canManageOrderLifecycle, canPurgeCancelledOrder } from "@/lib/auth/permissions";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { archiveDeliveredOrderSchema, cancelOrderSchema, purgeCancelledOrderSchema, restoreOrderSchema } from "./cancellation-schemas";

type CancelOrderResult = Database["public"]["Functions"]["cancel_order"]["Returns"][number];
type RestoreOrderResult = Database["public"]["Functions"]["restore_order"]["Returns"][number];
type M16RpcName = "archive_delivered_order" | "unarchive_delivered_order" | "purge_cancelled_order";
type M16OrderResult = {
  order_id: string;
  public_number: number;
  lifecycle_state: string;
  updated_at: string;
};
type M16ActionState = MutationState & { code?: "permission_denied" | "invalid_request" | "version_conflict" | "idempotency_conflict" | "not_found" | "ineligible"; order?: M16OrderResult };
type ServerClient = Awaited<ReturnType<typeof createClient>>;
type M16Rpc = (name: M16RpcName, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export type ArchiveDeliveredActionState = M16ActionState;
export type UnarchiveDeliveredActionState = M16ActionState;
export type PurgeCancelledActionState = M16ActionState;

function callM16Rpc(client: ServerClient, name: M16RpcName, args: Record<string, unknown>) {
  return (client.rpc.bind(client) as unknown as M16Rpc)(name, args);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function m16OrderResult(data: unknown): M16OrderResult | null {
  const value = Array.isArray(data) ? data[0] : data;
  if (!isRecord(value) || typeof value.order_id !== "string" || typeof value.lifecycle_state !== "string" || typeof value.updated_at !== "string") return null;
  const publicNumber = typeof value.public_number === "number" ? value.public_number : Number(value.public_number);
  return Number.isFinite(publicNumber) ? { order_id: value.order_id, public_number: publicNumber, lifecycle_state: value.lifecycle_state, updated_at: value.updated_at } : null;
}

function mapM16Error(message: string, fallback: string) {
  if (message.includes("permiso")) return { code: "permission_denied" as const, message: message.includes("purgar") ? "No tenés permiso para purgar pedidos anulados." : "No tenés permiso para gestionar el Archivo de entregados." };
  if (message.includes("cambió")) return { code: "version_conflict" as const, message: "El pedido cambió en otra sesión. Actualizá el Archivo e intentá nuevamente." };
  if (message.includes("idempotencia")) return { code: "idempotency_conflict" as const, message: "La clave de idempotencia ya fue utilizada para otra operación." };
  if (message.includes("no existe")) return { code: "not_found" as const, message: "El pedido seleccionado no existe." };
  if (message.includes("retención") || message.includes("30 días") || message.includes("anulados")) return { code: "ineligible" as const, message: "El pedido todavía no cumple las condiciones de purga." };
  if (message.includes("archivados")) return { code: "ineligible" as const, message: "El pedido no está archivado como entregado." };
  return { code: "invalid_request" as const, message: fallback };
}

export type CancellationActionState = MutationState & {
  code?: "permission_denied" | "invalid_request" | "payment_m12" | "version_conflict" | "idempotency_conflict" | "already_cancelled" | "not_found" | "frozen";
  order?: Pick<CancelOrderResult, "order_id" | "lifecycle_state" | "updated_at" | "cancelled_at">;
};

export type RestoreActionState = MutationState & {
  code?: "permission_denied" | "invalid_request" | "expired" | "version_conflict" | "idempotency_conflict" | "already_active" | "not_found";
  order?: Pick<RestoreOrderResult, "order_id" | "lifecycle_state" | "updated_at" | "cancelled_at">;
};

function formValues(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

const cancelErrors = [
  ["permission_denied", "No tenés permiso para anular pedidos.", ["No tenés permiso para anular pedidos."]],
  ["invalid_request", "El motivo de anulación debe tener entre 2 y 500 caracteres.", ["La solicitud de ciclo de vida no es válida.", "El motivo de anulación debe tener entre 2 y 500 caracteres."]],
  ["payment_m12", "Revertí el pago mediante M12 antes de anularlo.", ["Revertí el pago mediante M12", "pago activo"]],
  ["version_conflict", "El pedido cambió en otra sesión. Actualizá el Archivo e intentá nuevamente.", ["El pedido cambió en otra sesión"]],
  ["idempotency_conflict", "La clave de idempotencia ya fue utilizada para otra anulación.", ["idempotencia ya fue utilizada para otra anulación"]],
  ["already_cancelled", "El pedido ya está anulado.", ["El pedido ya está anulado"]],
  ["not_found", "El pedido seleccionado no existe.", ["El pedido seleccionado no existe"]],
  ["frozen", "El pedido está anulado y se encuentra congelado.", ["El pedido está anulado y se encuentra congelado"]],
] as const;

function mapCancelError(message: string) {
  const match = cancelErrors.find(([code, , markers]) => message.includes(code) || markers.some((marker) => message.includes(marker)));
  return match ? { code: match[0], message: match[1] } : { code: "invalid_request" as const, message: "No se pudo anular el pedido. Intentá nuevamente." };
}

const restoreErrors = [
  ["permission_denied", "No tenés permiso para restaurar pedidos.", ["No tenés permiso para restaurar pedidos."]],
  ["invalid_request", "La solicitud de restauración no es válida.", ["La solicitud de restauración no es válida"]],
  ["expired", "La ventana de restauración de 30 días ya venció.", ["ventana de restauración de 30 días ya venció"]],
  ["version_conflict", "El pedido cambió en otra sesión. Actualizá el Archivo e intentá nuevamente.", ["El pedido cambió en otra sesión"]],
  ["idempotency_conflict", "La clave de idempotencia ya fue utilizada para otra restauración.", ["idempotencia ya fue utilizada para otra restauración"]],
  ["already_active", "El pedido no está anulado.", ["El pedido no está anulado"]],
  ["not_found", "El pedido seleccionado no existe.", ["El pedido seleccionado no existe"]],
] as const;

function mapRestoreError(message: string) {
  const match = restoreErrors.find(([code, , markers]) => message.includes(code) || markers.some((marker) => message.includes(marker)));
  return match ? { code: match[0], message: match[1] } : { code: "invalid_request" as const, message: "No se pudo restaurar el pedido. Intentá nuevamente." };
}

function lifecyclePaths(orderId: string) {
  revalidatePath("/orders");
  revalidatePath("/orders/archives");
  revalidatePath(`/orders/${orderId}`);
}

export async function cancelOrderAction(_previous: CancellationActionState, formData: FormData): Promise<CancellationActionState> {
  const parsed = cancelOrderSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { ...mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá la anulación."), code: "invalid_request" };
  }

  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canManageOrderLifecycle(profile.role)) {
    return { ...mutationResult("error", "No tenés permiso para anular pedidos."), code: "permission_denied" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_order", {
    p_order_id: parsed.data.orderId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_reason: parsed.data.reason,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    const mapped = mapCancelError(error.message);
    lifecyclePaths(parsed.data.orderId);
    return { ...mutationResult("error", mapped.message), code: mapped.code };
  }
  const order = data?.[0];
  if (!order) return { ...mutationResult("error", "No se pudo anular el pedido. Intentá nuevamente."), code: "invalid_request" };
  lifecyclePaths(parsed.data.orderId);
  return { ...mutationResult("success", "Pedido anulado y enviado al Archivo."), order };
}

export async function restoreOrderAction(_previous: RestoreActionState, formData: FormData): Promise<RestoreActionState> {
  const parsed = restoreOrderSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { ...mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá la restauración."), code: "invalid_request" };
  }

  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canManageOrderLifecycle(profile.role)) {
    return { ...mutationResult("error", "No tenés permiso para restaurar pedidos."), code: "permission_denied" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_order", {
    p_order_id: parsed.data.orderId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    const mapped = mapRestoreError(error.message);
    lifecyclePaths(parsed.data.orderId);
    return { ...mutationResult("error", mapped.message), code: mapped.code };
  }
  const order = data?.[0];
  if (!order) return { ...mutationResult("error", "No se pudo restaurar el pedido. Intentá nuevamente."), code: "invalid_request" };
  lifecyclePaths(parsed.data.orderId);
  return { ...mutationResult("success", "Pedido restaurado y retirado del Archivo."), order };
}

type M16Data = { orderId: string; idempotencyKey: string; expectedUpdatedAt?: string };
type M16Role = Parameters<typeof canManageOrderLifecycle>[0];

async function runM16Action<T extends M16Data>(formData: FormData, schema: z.ZodType<T>, allowed: (role: M16Role) => boolean, denied: string, invalid: string, rpcName: M16RpcName, args: (data: T) => Record<string, unknown>, success: string): Promise<M16ActionState> {
  const parsed = schema.safeParse(formValues(formData));
  if (!parsed.success) return { ...mutationResult("error", parsed.error.issues[0]?.code === "unrecognized_keys" ? invalid : parsed.error.issues[0]?.message ?? invalid), code: "invalid_request" };
  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !allowed(profile.role)) return { ...mutationResult("error", denied), code: "permission_denied" };
  const { data, error } = await callM16Rpc(await createClient(), rpcName, args(parsed.data));
  if (error) {
    const mapped = mapM16Error(error.message, invalid);
    lifecyclePaths(parsed.data.orderId);
    return { ...mutationResult("error", mapped.message), code: mapped.code };
  }
  const order = m16OrderResult(data);
  if (!order) return { ...mutationResult("error", invalid), code: "invalid_request" };
  lifecyclePaths(parsed.data.orderId);
  return { ...mutationResult("success", success), order };
}

export async function archiveDeliveredOrderAction(_previous: ArchiveDeliveredActionState, formData: FormData) {
  return runM16Action(formData, archiveDeliveredOrderSchema, canManageOrderLifecycle, "No tenés permiso para gestionar el Archivo de entregados.", "No se pudo archivar el pedido entregado. Intentá nuevamente.", "archive_delivered_order", (data) => ({ p_order_id: data.orderId, p_expected_updated_at: data.expectedUpdatedAt, p_idempotency_key: data.idempotencyKey }), "Pedido entregado archivado.");
}

export async function unarchiveDeliveredOrderAction(_previous: UnarchiveDeliveredActionState, formData: FormData) {
  return runM16Action(formData, archiveDeliveredOrderSchema, canManageOrderLifecycle, "No tenés permiso para gestionar el Archivo de entregados.", "No se pudo retirar el pedido del Archivo de entregados. Intentá nuevamente.", "unarchive_delivered_order", (data) => ({ p_order_id: data.orderId, p_expected_updated_at: data.expectedUpdatedAt, p_idempotency_key: data.idempotencyKey }), "Pedido entregado retirado del archivo.");
}

export async function purgeCancelledOrderAction(_previous: PurgeCancelledActionState, formData: FormData) {
  return runM16Action(formData, purgeCancelledOrderSchema, canPurgeCancelledOrder, "No tenés permiso para purgar pedidos anulados.", "No se pudo purgar el pedido. Intentá nuevamente.", "purge_cancelled_order", (data) => ({ p_order_id: data.orderId, p_idempotency_key: data.idempotencyKey }), "Pedido anulado purgado.");
}
