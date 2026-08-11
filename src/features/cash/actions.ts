"use server";

import { revalidatePath } from "next/cache";

import { mutationResult, type MutationState } from "@/lib/action-state";
import { requireActiveProfile } from "@/lib/auth/guards";
import { canOperateCash } from "@/lib/auth/permissions";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { cashMovementSchema, cashOpeningSchema } from "./schemas";

export type CashActionState = MutationState;

function formValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

async function currentCashOperator() {
  const profile = await requireActiveProfile();
  return canOperateCash(profile) ? profile : null;
}

function cashErrorMessage(message: string) {
  const knownMessages = [
    "No tenés permiso para modificar la apertura de caja.",
    "No tenés permiso para crear movimientos de caja.",
    "La apertura de caja no es válida.",
    "El movimiento de caja no es válido.",
    "El ingreso debe tener una descripción válida.",
    "Un ingreso no puede tener categoría de egreso.",
    "El egreso debe tener una categoría activa.",
    "La categoría de egreso no está disponible.",
    "La clave de idempotencia ya fue utilizada para otra apertura.",
    "La clave de idempotencia ya fue utilizada para otro movimiento.",
    "La apertura cambió en otra sesión. Actualizá la caja e intentá nuevamente.",
  ];

  return knownMessages.find((knownMessage) => message.includes(knownMessage)) ?? "No se pudo actualizar la caja. Intentá nuevamente.";
}

export async function setCashOpeningAction(
  _previous: CashActionState,
  formData: FormData,
): Promise<CashActionState> {
  const parsed = cashOpeningSchema.safeParse({
    amount: formValue(formData, "amount"),
    expectedOpeningUpdatedAt: formValue(formData, "expectedOpeningUpdatedAt"),
    idempotencyKey: formValue(formData, "idempotencyKey"),
  });
  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá el saldo inicial.", parsed.error.flatten().fieldErrors);
  }

  if (!await currentCashOperator()) return mutationResult("error", "No tenés permiso para modificar la apertura de caja.");

  const supabase = await createClient();
  const args: Database["public"]["Functions"]["set_cash_opening"]["Args"] = {
    p_amount: Number(parsed.data.amount),
    p_expected_opening_updated_at: parsed.data.expectedOpeningUpdatedAt,
    p_idempotency_key: parsed.data.idempotencyKey,
  };
  const { data, error } = await supabase.rpc("set_cash_opening", args);
  if (error) return mutationResult("error", cashErrorMessage(error.message));
  if (!data?.[0]) return mutationResult("error", "La apertura no devolvió un resultado válido.");

  revalidatePath("/cash");
  return { ...mutationResult("success", "Saldo inicial actualizado."), resetKey: crypto.randomUUID() };
}

export async function createCashMovementAction(
  _previous: CashActionState,
  formData: FormData,
): Promise<CashActionState> {
  const parsed = cashMovementSchema.safeParse({
    amount: formValue(formData, "amount"),
    description: formValue(formData, "description"),
    direction: formValue(formData, "direction"),
    expenseCategoryId: formValue(formData, "expenseCategoryId"),
    idempotencyKey: formValue(formData, "idempotencyKey"),
  });
  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá el movimiento de caja.", parsed.error.flatten().fieldErrors);
  }

  if (!await currentCashOperator()) return mutationResult("error", "No tenés permiso para crear movimientos de caja.");

  const supabase = await createClient();
  const args = {
    p_direction: parsed.data.direction,
    p_amount: Number(parsed.data.amount),
    p_description: parsed.data.description ?? "",
    p_expense_category_id: parsed.data.expenseCategoryId,
    p_idempotency_key: parsed.data.idempotencyKey,
  } as unknown as Database["public"]["Functions"]["create_cash_movement"]["Args"];
  const { data, error } = await supabase.rpc("create_cash_movement", args);
  if (error) return mutationResult("error", cashErrorMessage(error.message));
  if (!data?.[0]) return mutationResult("error", "El movimiento no devolvió un resultado válido.");

  revalidatePath("/cash");
  return { ...mutationResult("success", parsed.data.direction === "income" ? "Ingreso registrado." : "Egreso registrado."), resetKey: crypto.randomUUID() };
}
