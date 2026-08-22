"use server";

import { revalidatePath } from "next/cache";

import { mutationResult, type MutationState } from "@/lib/action-state";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canManageOrderLifecycle } from "@/lib/auth/permissions";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { cancelOrderSchema, restoreOrderSchema } from "./cancellation-schemas";

type CancelOrderResult = Database["public"]["Functions"]["cancel_order"]["Returns"][number];
type RestoreOrderResult = Database["public"]["Functions"]["restore_order"]["Returns"][number];

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
  revalidatePath("/orders/archive");
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
