import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeAggregateMoney, normalizeMoney } from "@/lib/money/decimal";

export type CashCategory = {
  id: string;
  code: string;
  name: string;
};

export type CashMovement = {
  id: string;
  direction: "income" | "expense";
  amount: string;
  description: string | null;
  expenseCategoryId: string | null;
  expenseCategoryCode: string | null;
  expenseCategoryName: string | null;
  actorId: string;
  createdAt: string;
};

export type CashSummary = {
  cashDayId: string;
  operationalDate: string;
  openingBalance: string;
  openingUpdatedAt: string;
  currentBalance: string;
  movements: CashMovement[];
  categories: CashCategory[];
};

type CashSummaryRpcRow = Database["public"]["Functions"]["get_current_cash_summary"]["Returns"][number];
type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`La respuesta de caja no contiene ${label} válido.`);
  return value as JsonRecord;
}

function text(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`La respuesta de caja no contiene ${label} válido.`);
  return value;
}

function nullableText(value: unknown) {
  return value === null || value === undefined ? null : text(value, "un dato");
}

function decimal(value: unknown, label: string, normalize: (value: string) => string = normalizeMoney) {
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`La respuesta de caja no contiene ${label} válido.`);
  try {
    return normalize(String(value));
  } catch {
    throw new Error(`La respuesta de caja no contiene ${label} válido.`);
  }
}

function array(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`La respuesta de caja no contiene ${label} válido.`);
  return value;
}

function mapCategory(value: unknown): CashCategory {
  const category = record(value, "la categoría");
  return {
    id: text(category.id, "el identificador de categoría"),
    code: text(category.code, "el código de categoría"),
    name: text(category.name, "el nombre de categoría"),
  };
}

function mapMovement(value: unknown): CashMovement {
  const movement = record(value, "el movimiento");
  const direction = movement.direction;
  if (direction !== "income" && direction !== "expense") throw new Error("La respuesta de caja contiene un movimiento inválido.");

  return {
    id: text(movement.id, "el identificador de movimiento"),
    direction,
    amount: decimal(movement.amount, "el importe del movimiento"),
    description: nullableText(movement.description),
    expenseCategoryId: nullableText(movement.expense_category_id),
    expenseCategoryCode: nullableText(movement.expense_category_code),
    expenseCategoryName: nullableText(movement.expense_category_name),
    actorId: text(movement.actor_id, "el actor del movimiento"),
    createdAt: text(movement.created_at, "la fecha del movimiento"),
  };
}

export function mapCashSummary(row: CashSummaryRpcRow): CashSummary {
  return {
    cashDayId: text(row.cash_day_id, "el identificador de caja"),
    operationalDate: text(row.operational_date, "el día operativo"),
    openingBalance: decimal(row.opening_balance, "el saldo inicial"),
    openingUpdatedAt: text(row.opening_updated_at, "la versión de apertura"),
    currentBalance: decimal(row.current_balance, "el saldo actual", normalizeAggregateMoney),
    movements: array(row.movements, "la lista de movimientos").map(mapMovement),
    categories: array(row.categories, "la lista de categorías").map(mapCategory),
  };
}

function cashQueryErrorMessage(message: string) {
  return message.includes("No tenés permiso")
    ? "No tenés permiso para consultar la caja."
    : "No se pudo cargar la caja del día. Intentá nuevamente.";
}

export async function getCurrentCash() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_current_cash_summary");
  if (error) throw new Error(cashQueryErrorMessage(error.message));

  const row = data?.[0];
  if (!row) throw new Error("La consulta de caja no devolvió un resumen válido.");
  return mapCashSummary(row);
}
