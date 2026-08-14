"use server";

import { revalidatePath } from "next/cache";

import { mutationResult, type MutationState } from "@/lib/action-state";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canConfirmPayment, canEditOrderDescription, canEditOrderSensitive, canMoveOrder, canReversePayment } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { getOrderBoardSnapshot, getOrderMovementSnapshot } from "./queries";
import { confirmOrderPaymentSchema, moveOrderSchema, reconcileOrderSchema, reversePaymentSchema } from "./schemas";
import { getOrderDetail, getOrderTimeline } from "../orders/detail-queries";

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

export type ConfirmOrderPaymentActionState = MutationState & {
  code?: "permission_denied" | "version_conflict" | "idempotency_conflict" | "cash_closed" | "already_paid" | "invalid_stage" | "not_found" | "invalid_request";
  paymentId?: string;
  cashMovementId?: string | null;
  confirmedAt?: string;
  reconciledOrder?: Awaited<ReturnType<typeof getOrderBoardSnapshot>>;
};

export type ReverseOrderPaymentActionState = MutationState & {
  code?: "permission_denied" | "version_conflict" | "idempotency_conflict" | "cash_closed" | "already_reversed" | "invalid_stage" | "not_found" | "invalid_request";
  paymentId?: string;
  reversalCashMovementId?: string | null;
  reconciledOrder?: Awaited<ReturnType<typeof getOrderBoardSnapshot>>;
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

const paymentErrorMessages = [
  ["permission_denied", "No tenés permiso para confirmar pagos.", ["No tenés permiso para confirmar pagos."]],
  ["version_conflict", "El pedido cambió en otra sesión. Actualizá el tablero e intentá nuevamente.", ["El pedido cambió en otra sesión"]],
  ["idempotency_conflict", "La clave de idempotencia ya fue utilizada para otra confirmación de pago.", ["La clave de idempotencia ya fue utilizada para otra confirmación de pago."]],
  ["cash_closed", "La caja está cerrada y no admite nuevas cobranzas.", ["La caja está cerrada y no admite nuevas cobranzas."]],
  ["already_paid", "El pedido ya está pagado.", ["El pedido ya está pagado."]],
  ["invalid_stage", "La etapa Pagado no está disponible.", ["La etapa Pagado no está disponible."]],
  ["not_found", "El pedido seleccionado no existe.", ["El pedido seleccionado no existe."]],
  ["invalid_request", "La confirmación de pago no es válida.", ["La confirmación de pago no es válida."]],
] as const;

function paymentError(message: string) {
  const match = paymentErrorMessages.find(([code, , markers]) => message.includes(code) || markers.some((marker) => message.includes(marker)));
  return match
    ? { code: match[0], message: match[1] }
    : { code: "invalid_request" as const, message: "No se pudo confirmar el pago. Intentá nuevamente." };
}

const reversalErrorMessages = [
  ["permission_denied", "No tenés permiso para revertir pagos.", ["No tenés permiso para revertir pagos."]],
  ["version_conflict", "El pedido cambió en otra sesión. Actualizá el tablero e intentá nuevamente.", ["El pedido cambió en otra sesión"]],
  ["idempotency_conflict", "La clave de idempotencia ya fue utilizada para otra reversión de pago.", ["La clave de idempotencia ya fue utilizada para otra reversión."]],
  ["cash_closed", "La caja está cerrada y no admite reversiones.", ["La caja está cerrada y no admite reversiones."]],
  ["already_reversed", "El pago ya fue revertido.", ["El pago ya fue revertido."]],
  ["invalid_stage", "El pedido no está en la etapa Pagado.", ["El pedido no está en la etapa Pagado."]],
  ["not_found", "El pedido o pago seleccionado no existe.", ["El pedido seleccionado no existe.", "El pago seleccionado no existe."]],
  ["invalid_request", "La reversión de pago no es válida.", ["La reversión de pago no es válida."]],
] as const;

function reversalError(message: string) {
  const match = reversalErrorMessages.find(([code, , markers]) => message.includes(code) || markers.some((marker) => message.includes(marker)));
  return match
    ? { code: match[0], message: match[1] }
    : { code: "invalid_request" as const, message: "No se pudo revertir el pago. Intentá nuevamente." };
}

function paymentFormValues(formData: FormData) {
  return {
    orderId: String(formData.get("orderId") ?? ""),
    expectedUpdatedAt: String(formData.get("expectedUpdatedAt") ?? ""),
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
  };
}

function reversalFormValues(formData: FormData) {
  return {
    orderId: String(formData.get("orderId") ?? ""),
    paymentId: String(formData.get("paymentId") ?? ""),
    expectedUpdatedAt: String(formData.get("expectedUpdatedAt") ?? ""),
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  };
}

async function paymentSnapshot(orderId: string, role: Parameters<typeof getOrderBoardSnapshot>[1]) {
  const snapshot = await getOrderBoardSnapshot(orderId, role);
  return snapshot ? { reconciledOrder: snapshot } : {};
}

export async function confirmOrderPaymentAction(
  _previous: ConfirmOrderPaymentActionState,
  formData: FormData,
): Promise<ConfirmOrderPaymentActionState> {
  const parsed = confirmOrderPaymentSchema.safeParse(paymentFormValues(formData));
  if (!parsed.success) {
    return { ...mutationResult("error", parsed.error.issues[0]?.message ?? "La confirmación de pago no es válida.", parsed.error.flatten().fieldErrors), code: "invalid_request" };
  }

  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canConfirmPayment(profile.role)) {
    return { ...mutationResult("error", "No tenés permiso para confirmar pagos."), code: "permission_denied" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_order_payment", {
    p_order_id: parsed.data.orderId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_idempotency_key: parsed.data.idempotencyKey,
  });

  if (error) {
    const mapped = paymentError(error.message);
    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.data.orderId}`);
    revalidatePath("/cash");
    const recoverable = mapped.code !== "permission_denied" && mapped.code !== "invalid_request";
    return {
      ...mutationResult("error", mapped.message),
      code: mapped.code,
      ...(recoverable ? await paymentSnapshot(parsed.data.orderId, profile.role) : {}),
    };
  }

  const payment = data?.[0];
  if (!payment) return { ...mutationResult("error", "No se pudo confirmar el pago. Intentá nuevamente."), code: "invalid_request" };

  revalidatePath("/orders");
  revalidatePath(`/orders/${parsed.data.orderId}`);
  revalidatePath("/cash");
  return {
    ...mutationResult("success", `PED-${String(payment.public_number).padStart(6, "0")} quedó confirmado como Pagado.`),
    paymentId: payment.payment_id,
    cashMovementId: payment.cash_movement_id,
    confirmedAt: payment.confirmed_at,
    ...(await paymentSnapshot(parsed.data.orderId, profile.role)),
  };
}

export async function reverseOrderPaymentAction(
  _previous: ReverseOrderPaymentActionState,
  formData: FormData,
): Promise<ReverseOrderPaymentActionState> {
  const parsed = reversePaymentSchema.safeParse(reversalFormValues(formData));
  if (!parsed.success) {
    return { ...mutationResult("error", parsed.error.issues[0]?.message ?? "La reversión de pago no es válida.", parsed.error.flatten().fieldErrors), code: "invalid_request" };
  }

  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canReversePayment(profile.role)) {
    return { ...mutationResult("error", "No tenés permiso para revertir pagos."), code: "permission_denied" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reverse_order_payment", {
    p_order_id: parsed.data.orderId,
    p_payment_id: parsed.data.paymentId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_reason: parsed.data.reason || undefined,
  });

  if (error) {
    const mapped = reversalError(error.message);
    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.data.orderId}`);
    revalidatePath("/cash");
    const recoverable = mapped.code !== "permission_denied" && mapped.code !== "invalid_request" && mapped.code !== "not_found";
    return { ...mutationResult("error", mapped.message), code: mapped.code, ...(recoverable ? await paymentSnapshot(parsed.data.orderId, profile.role) : {}) };
  }

  const reversal = data?.[0];
  if (!reversal) return { ...mutationResult("error", "No se pudo revertir el pago. Intentá nuevamente."), code: "invalid_request" };

  revalidatePath("/orders");
  revalidatePath(`/orders/${parsed.data.orderId}`);
  revalidatePath("/cash");
  return {
    ...mutationResult("success", "El pago fue revertido y el pedido volvió a su etapa anterior."),
    paymentId: reversal.payment_id,
    reversalCashMovementId: reversal.reversal_cash_movement_id,
    ...(await paymentSnapshot(parsed.data.orderId, profile.role)),
  };
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

export type OrderQuickView = {
  id: string;
  publicNumber: number;
  customerName: string;
  quantity: number;
  orderType: "set" | "individual";
  promisedDeliveryDate: string;
  description: string | null;
  stageName: string;
  stageCode: string;
  expectedUpdatedAt: string;
  canReversePayment: boolean;
  paymentId: string | null;
  canEditDescription: boolean;
  canEditSensitive: boolean;
  lastMovement: { actor: string; fromStageId: string | null; occurredAt: string; toStageId: string | null } | null;
  comments: Array<{ actor: string; body: string; occurredAt: string; id: string }>;
};

export async function getOrderQuickViewAction(orderId: string): Promise<{ data?: OrderQuickView; message?: string }> {
  const parsed = reconcileOrderSchema.safeParse({ orderId });
  if (!parsed.success) return { message: "El pedido seleccionado no es válido." };

  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword) return { message: "No tenés permiso para ver este pedido." };

  const [detail, timeline] = await Promise.all([
    getOrderDetail(parsed.data.orderId),
    getOrderTimeline(parsed.data.orderId),
  ]);
  if (!detail) return { message: "El pedido seleccionado no existe." };

  const paymentEvent = canReversePayment(profile.role) && detail.order.currentStage.code === "paid"
    ? timeline.find((event) => event.type === "payment_confirmed" && typeof event.details.id === "string")
    : null;

  const lastMovement = timeline.find((event) => event.type === "stage_moved") ?? null;
  return {
    data: {
      id: detail.order.id,
      publicNumber: detail.order.publicNumber,
      customerName: detail.order.customerName,
      quantity: detail.order.quantity,
      orderType: detail.order.orderType,
      promisedDeliveryDate: detail.order.promisedDeliveryDate,
      description: detail.order.description,
      stageName: detail.order.currentStage.name,
      stageCode: detail.order.currentStage.code,
      expectedUpdatedAt: detail.order.updatedAt,
      canReversePayment: canReversePayment(profile.role),
      paymentId: typeof paymentEvent?.details.id === "string" ? paymentEvent.details.id : null,
      canEditDescription: canEditOrderDescription(profile.role),
      canEditSensitive: canEditOrderSensitive(profile.role),
      lastMovement: lastMovement ? {
        actor: lastMovement.actorDisplayName,
        fromStageId: lastMovement.fromStageId,
        occurredAt: lastMovement.occurredAt,
        toStageId: lastMovement.toStageId,
      } : null,
      comments: timeline
        .filter((event) => event.type === "commented" && event.commentBody)
        .slice(0, 3)
        .map((event) => ({ actor: event.actorDisplayName, body: event.commentBody!, occurredAt: event.occurredAt, id: event.id })),
    },
  };
}
