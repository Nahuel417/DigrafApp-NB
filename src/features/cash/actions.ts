"use server";

import { revalidatePath } from "next/cache";

import { mutationResult, type MutationState } from "@/lib/action-state";
import { requireActiveProfile } from "@/lib/auth/guards";
import { canCloseCash, canOperateCash, canReopenCash } from "@/lib/auth/permissions";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { cashAttentionVoidReasonSchema, cashDayCloseSchema, cashDayReopenSchema, cashMovementCorrectionSchema, cashMovementSchema, cashOpeningSchema, cashVoidSchema } from "./schemas";

export type CashActionState = MutationState;

type CashMovementRpcArgs = Omit<Database["public"]["Functions"]["create_cash_movement"]["Args"], "p_description" | "p_expense_category_id"> & { p_description: string | null; p_expense_category_id: string | null };
type CashCorrectionRpcArgs = Omit<Database["public"]["Functions"]["correct_cash_movement"]["Args"], "p_description" | "p_expense_category_id"> & { p_description: string | null; p_expense_category_id: string | null };
type CashVoidRpcArgs = Omit<Database["public"]["Functions"]["void_cash_movement"]["Args"], "p_reason"> & { p_reason: string | null };

function formValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

async function currentCashOperator() {
  const profile = await requireActiveProfile();
  return canOperateCash(profile) ? profile : null;
}

function cashErrorMessage(message: string) {
  const knownMessages = ["No tenés permiso para modificar la apertura de caja.", "No tenés permiso para crear movimientos de caja.", "La apertura de caja no es válida.", "El movimiento de caja no es válido.", "El ingreso debe tener una descripción válida.", "Un ingreso no puede tener categoría de egreso.", "El egreso debe tener una categoría activa.", "La categoría de egreso no está disponible.", "La clave de idempotencia ya fue utilizada para otra apertura.", "La clave de idempotencia ya fue utilizada para otro movimiento.", "La clave de idempotencia ya fue utilizada para otra corrección.", "La clave de idempotencia ya fue utilizada para otra anulación.", "La apertura cambió en otra sesión. Actualizá la caja e intentá nuevamente.", "No tenés permiso para corregir movimientos de caja.", "No tenés permiso para anular movimientos de caja.", "No tenés permiso para cerrar la caja.", "No tenés permiso para reabrir la caja.", "La corrección de caja no es válida.", "La anulación de caja no es válida.", "El cierre de caja no es válido.", "La reapertura de caja no es válida.", "La clave de idempotencia ya fue utilizada para otra reapertura.", "La clave de idempotencia ya fue utilizada para otro cierre.", "Atención debe indicar un motivo de anulación de 2 a 500 caracteres.", "El motivo de anulación no puede superar los 500 caracteres.", "La caja está cerrada y no admite modificaciones."];

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
  const args: CashMovementRpcArgs = {
    p_direction: parsed.data.direction,
    p_amount: Number(parsed.data.amount),
    p_description: parsed.data.description,
    p_expense_category_id: parsed.data.expenseCategoryId,
    p_idempotency_key: parsed.data.idempotencyKey,
  };
  const { data, error } = await supabase.rpc("create_cash_movement", args as Database["public"]["Functions"]["create_cash_movement"]["Args"]);
  if (error) return mutationResult("error", cashErrorMessage(error.message));
  if (!data?.[0]) return mutationResult("error", "El movimiento no devolvió un resultado válido.");

  revalidatePath("/cash");
  return { ...mutationResult("success", parsed.data.direction === "income" ? "Ingreso registrado." : "Egreso registrado."), resetKey: crypto.randomUUID() };
}

export async function correctCashMovementAction(_previous: CashActionState, formData: FormData): Promise<CashActionState> {
  const parsed = cashMovementCorrectionSchema.safeParse({ movementId: formValue(formData, "movementId"), amount: formValue(formData, "amount"), description: formValue(formData, "description"), direction: formValue(formData, "direction"), expenseCategoryId: formValue(formData, "expenseCategoryId"), idempotencyKey: formValue(formData, "idempotencyKey") });
  if (!parsed.success) return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá la corrección de caja.", parsed.error.flatten().fieldErrors);
  if (!await currentCashOperator()) return mutationResult("error", "No tenés permiso para corregir movimientos de caja.");
  const supabase = await createClient(); const args: CashCorrectionRpcArgs = { p_movement_id: parsed.data.movementId, p_direction: parsed.data.direction, p_amount: Number(parsed.data.amount), p_description: parsed.data.description, p_expense_category_id: parsed.data.expenseCategoryId, p_idempotency_key: parsed.data.idempotencyKey };
  const { data, error } = await supabase.rpc("correct_cash_movement", args as Database["public"]["Functions"]["correct_cash_movement"]["Args"]); if (error) return mutationResult("error", cashErrorMessage(error.message)); if (!data?.[0]) return mutationResult("error", "La corrección no devolvió un resultado válido."); revalidatePath("/cash"); return { ...mutationResult("success", "Movimiento corregido."), resetKey: crypto.randomUUID() };
}

export async function voidCashMovementAction(_previous: CashActionState, formData: FormData): Promise<CashActionState> {
  const parsed = cashVoidSchema.safeParse({ movementId: formValue(formData, "movementId"), reason: formValue(formData, "reason"), idempotencyKey: formValue(formData, "idempotencyKey") });
  if (!parsed.success) return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá la anulación de caja.", parsed.error.flatten().fieldErrors);
  const profile = await currentCashOperator(); if (!profile) return mutationResult("error", "No tenés permiso para anular movimientos de caja.");
  if (profile.role === "attention") { const reason = cashAttentionVoidReasonSchema.safeParse(parsed.data.reason ?? ""); if (!reason.success) return mutationResult("error", reason.error.issues[0]?.message ?? "Indicá un motivo de anulación.", { reason: [reason.error.issues[0]?.message ?? "Indicá un motivo de anulación."] }); }
  const supabase = await createClient(); const args: CashVoidRpcArgs = { p_movement_id: parsed.data.movementId, p_reason: parsed.data.reason, p_idempotency_key: parsed.data.idempotencyKey };
  const { data, error } = await supabase.rpc("void_cash_movement", args as Database["public"]["Functions"]["void_cash_movement"]["Args"]); if (error) return mutationResult("error", cashErrorMessage(error.message)); if (!data?.[0]) return mutationResult("error", "La anulación no devolvió un resultado válido."); revalidatePath("/cash"); return { ...mutationResult("success", "Movimiento anulado."), resetKey: crypto.randomUUID() };
}

export async function closeCashDayAction(_previous: CashActionState, formData: FormData): Promise<CashActionState> {
  const parsed = cashDayCloseSchema.safeParse({ cashDayId: formValue(formData, "cashDayId"), idempotencyKey: formValue(formData, "idempotencyKey") });
  if (!parsed.success) return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá el cierre de caja.", parsed.error.flatten().fieldErrors);
  const profile = await requireActiveProfile(); if (!canCloseCash(profile.role)) return mutationResult("error", "No tenés permiso para cerrar la caja.");
  const supabase = await createClient(); const args: Database["public"]["Functions"]["close_cash_day"]["Args"] = { p_cash_day_id: parsed.data.cashDayId, p_idempotency_key: parsed.data.idempotencyKey }; const { data, error } = await supabase.rpc("close_cash_day", args);
  if (error) return mutationResult("error", cashErrorMessage(error.message)); if (!data?.[0]) return mutationResult("error", "El cierre no devolvió un resultado válido."); revalidatePath("/cash"); return { ...mutationResult("success", "Caja cerrada."), resetKey: crypto.randomUUID() };
}

export async function reopenCashDayAction(_previous: CashActionState, formData: FormData): Promise<CashActionState> {
  const parsed = cashDayReopenSchema.safeParse({ cashDayId: formValue(formData, "cashDayId"), reason: formValue(formData, "reason"), idempotencyKey: formValue(formData, "idempotencyKey") });
  if (!parsed.success) return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá el motivo de reapertura.", parsed.error.flatten().fieldErrors);
  const profile = await currentCashOperator();
  if (!profile || !canReopenCash(profile.role)) return mutationResult("error", "No tenés permiso para reabrir la caja.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reopen_cash_day", { p_cash_day_id: parsed.data.cashDayId, p_reason: parsed.data.reason, p_idempotency_key: parsed.data.idempotencyKey });
  if (error) return mutationResult("error", cashErrorMessage(error.message));
  if (!data?.[0]) return mutationResult("error", "La reapertura no devolvió un resultado válido.");
  revalidatePath("/cash");
  return { ...mutationResult("success", "Caja reabierta para corrección."), resetKey: crypto.randomUUID() };
}
