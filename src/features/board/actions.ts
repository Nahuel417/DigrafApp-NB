"use server";

import { revalidatePath } from "next/cache";

import { mutationResult, type MutationState } from "@/lib/action-state";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canMoveOrder } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { getOrderMovementSnapshot } from "./queries";
import { moveOrderSchema, reconcileOrderSchema } from "./schemas";

export type MoveOrderActionState = MutationState & {
  movedOrder?: {
    id: string;
    fromStageId: string;
    toStageId: string;
    updatedAt: string;
  };
  reconciledOrder?: {
    currentStageId: string;
    updatedAt: string;
  };
};

function formValues(formData: FormData) {
  return {
    orderId: String(formData.get("orderId") ?? ""),
    fromStageId: String(formData.get("fromStageId") ?? ""),
    toStageId: String(formData.get("toStageId") ?? ""),
    expectedUpdatedAt: String(formData.get("expectedUpdatedAt") ?? ""),
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
  };
}

function moveOrderErrorMessage(message: string) {
  const knownMessages = [
    "No tenés permiso para mover pedidos.",
    "La solicitud de movimiento no es válida.",
    "El pedido ya está en la etapa seleccionada.",
    "La clave de idempotencia ya fue utilizada para otro movimiento.",
    "El pedido seleccionado no existe.",
    "El pedido cambió en otra sesión. Actualizá el tablero e intentá nuevamente.",
    "La etapa de destino no está disponible.",
    "Los movimientos hacia o desde Pagado estarán disponibles al confirmar el cobro.",
  ];

  return knownMessages.find((knownMessage) => message.includes(knownMessage)) ?? "No se pudo mover el pedido. Intentá nuevamente.";
}

export async function moveOrderAction(
  _previous: MoveOrderActionState,
  formData: FormData,
): Promise<MoveOrderActionState> {
  const parsed = moveOrderSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá el movimiento del pedido.", parsed.error.flatten().fieldErrors);
  }

  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canMoveOrder(profile.role)) {
    return mutationResult("error", "No tenés permiso para mover pedidos.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("move_order", {
    p_order_id: parsed.data.orderId,
    p_from_stage_id: parsed.data.fromStageId,
    p_to_stage_id: parsed.data.toStageId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_idempotency_key: parsed.data.idempotencyKey,
  });

  if (error) {
    const message = moveOrderErrorMessage(error.message);
    const reconciledOrder = message.startsWith("El pedido cambió en otra sesión")
      ? await getOrderMovementSnapshot(parsed.data.orderId)
      : null;
    revalidatePath("/orders");
    return { ...mutationResult("error", message), ...(reconciledOrder ? { reconciledOrder } : {}) };
  }

  const movedOrder = data?.[0];
  if (!movedOrder) return mutationResult("error", "El movimiento no devolvió un resultado válido.");

  revalidatePath("/orders");
  return {
    ...mutationResult("success", `PED-${String(movedOrder.public_number).padStart(6, "0")} se movió a ${movedOrder.stage_code}.`),
    movedOrder: {
      id: movedOrder.order_id,
      fromStageId: movedOrder.from_stage_id,
      toStageId: movedOrder.to_stage_id,
      updatedAt: movedOrder.updated_at,
    },
  };
}

export async function reconcileOrderAction(orderId: string) {
  const parsed = reconcileOrderSchema.safeParse({ orderId });
  if (!parsed.success) return null;

  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canMoveOrder(profile.role)) return null;

  return getOrderMovementSnapshot(parsed.data.orderId);
}
