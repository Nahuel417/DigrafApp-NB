import { createClient } from "@/lib/supabase/server";
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
  actorDisplayName: string;
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
  closedAt: string | null; closedBy: string | null; closedByDisplayName: string | null; closureKind: string | null; closingBalance: string | null;
};

export type ClosedCashDay = { cashDayId: string; operationalDate: string; closedAt: string; closedBy: string | null; closedByDisplayName: string | null; closureKind: string; closingBalance: string };

export type CashMovementEvent = { id: string; movementId: string; eventType: "correction" | "void"; previousState: JsonRecord; newState: JsonRecord | null; reason: string | null; actorId: string; actorDisplayName: string; createdAt: string };
export type CashLifecycleEvent = { id: string; sequenceNo: number; eventType: "close" | "reopen"; closureKind: string | null; closingBalance: string | null; actorId: string | null; actorDisplayName: string; createdAt: string; reason: string | null };

export type CashDaySummary = { cashDayId: string; operationalDate: string; openingBalance: string; openingUpdatedAt: string; closedAt: string | null; closedBy: string | null; closedByDisplayName: string | null; closureKind: string | null; closingBalance: string | null; movements: CashMovement[]; events: CashMovementEvent[]; lifecycleEvents: CashLifecycleEvent[] };

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

function actorDisplayName(value: unknown) { return typeof value === "string" && value.length > 0 ? value : "Sistema"; }

function nullableDecimal(value: unknown, label: string) { return value === null || value === undefined ? null : decimal(value, label); }

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
    actorId: text(movement.actor_id, "el actor del movimiento"), actorDisplayName: actorDisplayName(movement.actor_display_name),
    createdAt: text(movement.created_at, "la fecha del movimiento"),
  };
}

function mapEvent(value: unknown): CashMovementEvent { const event = record(value, "el evento de caja"); const eventType = event.event_type; if (eventType !== "correction" && eventType !== "void") throw new Error("La respuesta de caja contiene un evento inválido."); return { id: text(event.id, "el identificador del evento"), movementId: text(event.movement_id, "el movimiento del evento"), eventType, previousState: record(event.previous_state, "el estado anterior del evento"), newState: event.new_state === null || event.new_state === undefined ? null : record(event.new_state, "el estado nuevo del evento"), reason: nullableText(event.reason), actorId: text(event.actor_id, "el actor del evento"), actorDisplayName: actorDisplayName(event.actor_display_name), createdAt: text(event.created_at, "la fecha del evento") }; }

function mapLifecycleEvent(value: unknown): CashLifecycleEvent { const event = record(value, "el ciclo de caja"); const eventType = event.event_type; if (eventType !== "close" && eventType !== "reopen") throw new Error("La respuesta de caja contiene un ciclo inválido."); return { id: text(event.id, "el identificador del ciclo"), sequenceNo: typeof event.sequence_no === "number" ? event.sequence_no : Number(event.sequence_no), eventType, closureKind: nullableText(event.closure_kind), closingBalance: nullableDecimal(event.closing_balance, "el saldo del ciclo"), actorId: nullableText(event.actor_id), actorDisplayName: actorDisplayName(event.actor_display_name), createdAt: text(event.created_at, "la fecha del ciclo"), reason: nullableText(event.reason) }; }

function closureFields(row: JsonRecord) { return { closedAt: nullableText(row.closed_at), closedBy: nullableText(row.closed_by), closedByDisplayName: nullableText(row.closed_by_display_name), closureKind: nullableText(row.closure_kind), closingBalance: nullableDecimal(row.closing_balance, "el saldo de cierre") }; }

export function mapCashSummary(row: unknown): CashSummary {
  const value = record(row, "el resumen");
  return {
    cashDayId: text(value.cash_day_id, "el identificador de caja"), operationalDate: text(value.operational_date, "el día operativo"), openingBalance: decimal(value.opening_balance, "el saldo inicial"), openingUpdatedAt: text(value.opening_updated_at, "la versión de apertura"), currentBalance: decimal(value.current_balance, "el saldo actual", normalizeAggregateMoney), movements: array(value.movements, "la lista de movimientos").map(mapMovement), categories: array(value.categories, "la lista de categorías").map(mapCategory), ...closureFields(value),
  };
}

export function mapClosedCashDay(row: unknown): ClosedCashDay { const value = record(row, "la caja cerrada"); const fields = closureFields(value); if (!fields.closedAt || !fields.closureKind || !fields.closingBalance) throw new Error("La respuesta de caja no contiene datos de cierre válidos."); return { cashDayId: text(value.cash_day_id, "el identificador de caja"), operationalDate: text(value.operational_date, "el día operativo"), closedAt: fields.closedAt, closedBy: fields.closedBy, closedByDisplayName: fields.closedByDisplayName, closureKind: fields.closureKind, closingBalance: fields.closingBalance }; }

export function mapCashDaySummary(row: unknown): CashDaySummary { const value = record(row, "el historial"); return { cashDayId: text(value.cash_day_id, "el identificador de caja"), operationalDate: text(value.operational_date, "el día operativo"), openingBalance: decimal(value.opening_balance, "el saldo inicial"), openingUpdatedAt: text(value.opening_updated_at, "la versión de apertura"), ...closureFields(value), movements: array(value.movements, "la lista de movimientos").map(mapMovement), events: array(value.events, "la lista de eventos").map(mapEvent), lifecycleEvents: array(value.lifecycle_events ?? [], "la lista de ciclos").map(mapLifecycleEvent) }; }

export function shouldLoadCashHistory(cashDayId: string | undefined, summary: Pick<CashSummary, "cashDayId" | "closedAt">): cashDayId is string {
  return Boolean(cashDayId && cashDayId !== summary.cashDayId);
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

export async function listClosedCashDays() { const supabase = await createClient(); const { data, error } = await supabase.rpc("list_closed_cash_days"); if (error) throw new Error(cashQueryErrorMessage(error.message)); return array(data, "la lista de cajas cerradas").map(mapClosedCashDay); }

export async function getCashDaySummary(cashDayId: string) { const supabase = await createClient(); const { data, error } = await supabase.rpc("get_cash_day_summary", { p_cash_day_id: cashDayId }); if (error) throw new Error(cashQueryErrorMessage(error.message)); const row = data?.[0]; if (!row) throw new Error("La consulta de caja no devolvió un historial válido."); return mapCashDaySummary(row); }
