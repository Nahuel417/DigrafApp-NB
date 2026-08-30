"use server";

import { revalidatePath } from "next/cache";

import { mutationResult, type MutationState } from "@/lib/action-state";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canCreateManualOrder } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { orderFormSchema } from "./schemas";

export type OrderActionState = MutationState & {
  createdOrder?: {
    id: string;
    publicNumber: number;
    stageCode: string;
    totalAmount: string;
    depositAmount: string;
    depositPaid: boolean;
  };
};

function formValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function formValues(formData: FormData) {
  return {
    clientName: formValue(formData, "clientName"),
    teamName: formValue(formData, "teamName"),
    phone: formValue(formData, "phone"),
    lines: formValue(formData, "lines"),
    orderDate: formValue(formData, "orderDate"),
    promisedDeliveryDate: formValue(formData, "promisedDeliveryDate"),
    description: formValue(formData, "description"),
    totalAmount: formValue(formData, "totalAmount"),
    depositAmount: formValue(formData, "depositAmount"),
    depositPaid: formData.get("depositPaid") === "true" || formData.get("depositPaid") === "on",
    idempotencyKey: formValue(formData, "idempotencyKey"),
  };
}

function orderErrorMessage(message: string) {
  const knownMessages = [
    "No tenés permiso para crear pedidos.",
    "La solicitud de creación no es válida.",
    "La clave de creación ya fue utilizada para otro pedido.",
    "El cliente o equipo debe tener entre 2 y 200 caracteres.",
    "La cantidad debe ser mayor que cero.",
    "Seleccioná el tipo de pedido.",
    "Completá las fechas del pedido.",
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
    "La etapa inicial del pedido no está configurada.",
    "Seleccioná una prenda superior activa.",
    "Seleccioná una prenda inferior activa.",
    "Seleccioná un cuello activo.",
    "Seleccioná un molde superior activo.",
    "Seleccioná un molde inferior activo.",
    "Seleccioná una tela activa.",
    "Uno de los extras seleccionados no está disponible.",
    "Los importes o las selecciones del pedido no son válidos.",
  ];

  return knownMessages.find((knownMessage) => message.includes(knownMessage)) ?? "No se pudo crear el pedido. Intentá nuevamente.";
}

export async function createOrderAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const parsed = orderFormSchema.safeParse(formValues(formData));

  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá los datos del pedido.", parsed.error.flatten().fieldErrors);
  }

  const profile = await getCurrentProfile();
  if (
    !profile
    || profile.mustChangePassword
    || !canCreateManualOrder(profile.role)
  ) {
    return mutationResult("error", "No tenés permiso para crear pedidos.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
     p_client_name: parsed.data.clientName,
    p_team_name: parsed.data.teamName,
    p_phone: parsed.data.phone,
    p_order_date: parsed.data.orderDate,
    p_promised_delivery_date: parsed.data.promisedDeliveryDate,
    p_description: parsed.data.description,
    p_total_amount: parsed.data.totalAmount,
    p_deposit_amount: parsed.data.depositAmount,
    p_deposit_paid: parsed.data.depositPaid,
     p_lines: parsed.data.lines,
    p_idempotency_key: parsed.data.idempotencyKey,
  });

  if (error) return mutationResult("error", orderErrorMessage(error.message));

  const createdOrder = data?.[0];
  if (!createdOrder) return mutationResult("error", "El pedido no devolvió un resultado válido.");

  const publicNumber = String(createdOrder.public_number).padStart(6, "0");
  revalidatePath("/orders/new");

  return {
    ...mutationResult("success", `Pedido PED-${publicNumber} creado en Pedido recibido.`),
    resetKey: crypto.randomUUID(),
    createdOrder: {
      id: createdOrder.order_id,
      publicNumber: createdOrder.public_number,
      stageCode: createdOrder.stage_code,
      totalAmount: parsed.data.totalAmount,
      depositAmount: parsed.data.depositAmount,
      depositPaid: parsed.data.depositPaid,
    },
  };
}
