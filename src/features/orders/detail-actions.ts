"use server";

import { revalidatePath } from "next/cache";

import { mutationResult, type MutationState } from "@/lib/action-state";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canEditOrderDescription, canEditOrderSensitive } from "@/lib/auth/permissions";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { createOrderCommentSchema, updateOrderDescriptionSchema, updateOrderSchema } from "./detail-schemas";

export type UpdateOrderActionState = MutationState & {
  updatedOrder?: {
    id: string;
    updatedAt: string;
  };
};

export type UpdateOrderDescriptionActionState = MutationState & {
  updatedOrder?: {
    id: string;
    updatedAt: string;
  };
};

export type CreateOrderCommentActionState = MutationState;

type UpdateOrderRpcArgs = Database["public"]["Functions"]["update_order"]["Args"];
type NullableSelectionArg =
  | "p_fabric_id"
  | "p_garment_lower_id"
  | "p_garment_upper_id"
  | "p_lower_pattern_id"
  | "p_neckline_id"
  | "p_upper_pattern_id";
type UpdateOrderInput = Omit<UpdateOrderRpcArgs, NullableSelectionArg>
  & Record<NullableSelectionArg, string | null>;

function updateOrderErrorMessage(message: string) {
  const knownMessages = [
    "No tenés permiso para editar datos sensibles del pedido.",
    "No tenés permiso para editar la descripción del pedido.",
    "La solicitud de edición no es válida.",
    "El cliente o equipo debe tener entre 2 y 200 caracteres.",
    "La cantidad debe ser mayor que cero.",
    "La fecha prometida no puede ser anterior a la fecha del pedido.",
    "La descripción no puede superar los 5000 caracteres.",
    "El total debe ser mayor o igual a cero.",
    "La seña debe ser mayor o igual a cero.",
    "La seña no puede superar el total.",
    "Los importes deben tener como máximo dos decimales.",
    "Indicá si la seña fue abonada.",
    "Seleccioná una tela.",
    "Un conjunto requiere prendas, cuello y ambos moldes.",
    "Una prenda individual debe ser superior o inferior.",
    "La prenda superior requiere cuello y molde superior.",
    "La prenda inferior requiere molde inferior y no lleva cuello.",
    "Seleccioná una prenda superior activa.",
    "Seleccioná una prenda inferior activa.",
    "Seleccioná un cuello activo.",
    "Seleccioná un molde superior activo.",
    "Seleccioná un molde inferior activo.",
    "Seleccioná una tela activa.",
    "Uno de los extras seleccionados no está disponible.",
    "El pedido seleccionado no existe.",
    "El pedido cambió en otra sesión. Actualizalo e intentá nuevamente.",
    "La clave de idempotencia ya fue utilizada para otra edición.",
    "Los importes del pedido no están disponibles.",
  ];

  return knownMessages.find((knownMessage) => message.includes(knownMessage)) ?? "No se pudo actualizar el pedido. Intentá nuevamente.";
}

export async function updateOrderAction(
  _previous: UpdateOrderActionState,
  formData: FormData,
): Promise<UpdateOrderActionState> {
  const parsed = updateOrderSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    extraIds: formData.getAll("extraIds").map(String),
  });
  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá los datos del pedido.", parsed.error.flatten().fieldErrors);
  }

  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canEditOrderSensitive(profile.role)) {
    return mutationResult("error", "No tenés permiso para editar datos sensibles del pedido.");
  }

  const data = parsed.data;
  const supabase = await createClient();
  const input: UpdateOrderInput = {
    p_order_id: data.orderId,
    p_customer_name: data.customerName,
    p_quantity: data.quantity,
    p_order_type: data.orderType,
    p_order_date: data.orderDate,
    p_promised_delivery_date: data.promisedDeliveryDate,
    p_description: data.description,
    p_total_amount: Number.parseFloat(data.totalAmount),
    p_deposit_amount: Number.parseFloat(data.depositAmount),
    p_deposit_paid: data.depositPaid,
    p_garment_upper_id: data.garmentUpperId || null,
    p_garment_lower_id: data.garmentLowerId || null,
    p_neckline_id: data.necklineId || null,
    p_upper_pattern_id: data.upperPatternId || null,
    p_lower_pattern_id: data.lowerPatternId || null,
    p_fabric_id: data.fabricId || null,
    p_extra_ids: data.extraIds,
    p_expected_updated_at: data.expectedUpdatedAt,
    p_idempotency_key: data.idempotencyKey,
  };
  // Supabase's generator does not represent nullable SQL function arguments.
  const { data: result, error } = await supabase.rpc("update_order", input as UpdateOrderRpcArgs);

  if (error) {
    return mutationResult("error", updateOrderErrorMessage(error.message));
  }

  const updatedOrder = result?.[0];
  if (!updatedOrder) return mutationResult("error", "La actualización no devolvió un resultado válido.");

  return {
    ...mutationResult("success", "Pedido actualizado."),
    updatedOrder: { id: updatedOrder.order_id, updatedAt: updatedOrder.updated_at },
  };
}

export async function updateOrderDescriptionAction(
  _previous: UpdateOrderDescriptionActionState,
  formData: FormData,
): Promise<UpdateOrderDescriptionActionState> {
  const parsed = updateOrderDescriptionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá la descripción del pedido.", parsed.error.flatten().fieldErrors);
  }

  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canEditOrderDescription(profile.role)) {
    return mutationResult("error", "No tenés permiso para editar la descripción del pedido.");
  }

  const data = parsed.data;
  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("update_order_description", {
    p_order_id: data.orderId,
    p_description: data.description,
    p_expected_updated_at: data.expectedUpdatedAt,
    p_idempotency_key: data.idempotencyKey,
  });

  if (error) {
    return mutationResult("error", updateOrderErrorMessage(error.message));
  }

  const updatedOrder = result?.[0];
  if (!updatedOrder) return mutationResult("error", "La actualización no devolvió un resultado válido.");

  return {
    ...mutationResult("success", "Descripción actualizada."),
    updatedOrder: { id: updatedOrder.order_id, updatedAt: updatedOrder.updated_at },
  };
}

function createOrderCommentErrorMessage(message: string) {
  const knownMessages = [
    "No tenés permiso para comentar pedidos.",
    "La solicitud de comentario no es válida.",
    "El comentario debe tener entre 1 y 5000 caracteres.",
    "El pedido seleccionado no existe.",
    "La clave de idempotencia ya fue utilizada para otro comentario.",
  ];

  return knownMessages.find((knownMessage) => message.includes(knownMessage)) ?? "No se pudo publicar el comentario. Intentá nuevamente.";
}

export async function createOrderCommentAction(
  _previous: CreateOrderCommentActionState,
  formData: FormData,
): Promise<CreateOrderCommentActionState> {
  const body = formData.get("body");
  const parsed = createOrderCommentSchema.safeParse({
    orderId: formData.get("orderId"),
    body: body === null ? "" : body,
    idempotencyKey: formData.get("idempotencyKey"),
  });

  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá el comentario.", parsed.error.flatten().fieldErrors);
  }

  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword) {
    return mutationResult("error", "No tenés permiso para comentar pedidos.");
  }

  const data = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_order_comment", {
    p_order_id: data.orderId,
    p_body: data.body,
    p_idempotency_key: data.idempotencyKey,
  });

  if (error) {
    return mutationResult("error", createOrderCommentErrorMessage(error.message));
  }

  revalidatePath(`/orders/${data.orderId}`);
  return mutationResult("success", "Comentario publicado.");
}
