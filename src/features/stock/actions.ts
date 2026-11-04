"use server";

import { revalidatePath } from "next/cache";

import { mutationResult, type MutationState } from "@/lib/action-state";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { canManageFabricStock } from "./permissions";
import { stockOperationSchema, type StockOperation } from "./schemas";

export type StockActionState = MutationState;

function formValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function stockErrorMessage(message: string) {
  const knownMessages = [
    "No tenés permiso para administrar el stock de telas.",
    "La operación de stock no es válida.",
    "La clave de idempotencia ya fue utilizada para otra operación de stock.",
    "El nombre de la tela debe tener entre 2 y 100 caracteres.",
    "Ya existe una tela con ese nombre.",
    "La fecha de stock debe ser válida y no puede ser futura.",
    "La cantidad debe ser un número de rollos enteros o medios.",
    "La cantidad debe ser mayor que cero.",
    "El precio por rollo debe ser mayor que cero y tener hasta dos decimales.",
    "El precio por rollo debe ser mayor que cero.",
    "El stock disponible no alcanza para registrar la salida.",
    "La tela seleccionada no existe.",
    "La tela está desactivada y no admite movimientos.",
    "El movimiento seleccionado no existe.",
    "El movimiento ya fue anulado.",
    "El motivo de anulación debe tener entre 2 y 500 caracteres.",
    "No se puede anular el movimiento porque el saldo quedaría negativo.",
    "Solo se puede desactivar una tela sin stock.",
  ];

  return knownMessages.find((known) => message.includes(known))
    ?? "No se pudo actualizar el stock. Actualizá la pantalla e intentá nuevamente.";
}

function successMessage(operation: StockOperation) {
  switch (operation.action) {
    case "create": return "Material agregado correctamente.";
    case "purchase": return "Compra registrada.";
    case "consumption": return "Salida registrada.";
    case "cancel": return "Movimiento anulado.";
    case "rename": return "Tela renombrada correctamente.";
    case "activate": return operation.active ? "Tela activada." : "Tela desactivada.";
  }
}

export async function executeStockOperationAction(
  _previous: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  const parsed = stockOperationSchema.safeParse({
    action: formValue(formData, "action"),
    idempotencyKey: formValue(formData, "idempotencyKey"),
    itemId: formValue(formData, "itemId"),
    movementId: formValue(formData, "movementId"),
    name: formValue(formData, "name"),
    quantity: formValue(formData, "quantity"),
    date: formValue(formData, "date"),
    price: formValue(formData, "price"),
    reason: formValue(formData, "reason"),
    active: formValue(formData, "active"),
  });

  if (!parsed.success) {
    return mutationResult(
      "error",
      parsed.error.issues[0]?.message ?? "Revisá los datos del stock.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canManageFabricStock(profile.role)) {
    return mutationResult("error", "No tenés permiso para administrar el stock de telas.");
  }

  const { action, idempotencyKey, ...data } = parsed.data;
  const supabase = await createClient();
  const args: Database["public"]["Functions"]["execute_stock_operation"]["Args"] = {
    p_action: action,
    p_data: data,
    p_key: idempotencyKey,
  };
  const { data: result, error } = await supabase.rpc("execute_stock_operation", args);
  if (error) return mutationResult("error", stockErrorMessage(error.message));
  if (!result || Array.isArray(result) || typeof result !== "object" || typeof result.item_id !== "string") {
    return mutationResult("error", "La operación de stock no devolvió un resultado válido.");
  }

  revalidatePath("/stock");
  return { ...mutationResult("success", successMessage(parsed.data)), resetKey: crypto.randomUUID() };
}
