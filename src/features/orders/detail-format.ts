import type { OrderDetail, OrderFinancials, OrderSelection } from "./detail-queries";

export function formatOrderNumber(publicNumber: number) {
  return `PED-${String(publicNumber).padStart(6, "0")}`;
}

export function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Cordoba",
  }).format(date);
}

export function orderTypeLabel(orderType: OrderDetail["orderType"]) {
  return orderType === "set" ? "Conjunto" : "Prenda individual";
}

export function selectionLabel(selection: OrderSelection) {
  const labels: Record<string, string> = {
    garment_upper: "Prenda superior",
    garment_lower: "Prenda inferior",
    neckline: "Cuello",
    upper_pattern: "Molde superior",
    lower_pattern: "Molde inferior",
    fabric: "Tela",
    extra: "Extra",
  };
  return labels[selection.selectionKey] ?? selection.selectionKey;
}

export function findSelection(selections: OrderSelection[], key: string) {
  return selections.find((selection) => selection.selectionKey === key);
}

export function findSelectionByKind(selections: OrderSelection[], kind: OrderSelection["catalogKind"]) {
  return selections.filter((selection) => selection.catalogKind === kind);
}

export function selectionsForEdit(selections: OrderSelection[]) {
  return {
    garmentUpperId: findSelection(selections, "garment_upper")?.catalogItemId ?? "",
    garmentLowerId: findSelection(selections, "garment_lower")?.catalogItemId ?? "",
    necklineId: findSelection(selections, "neckline")?.catalogItemId ?? "",
    upperPatternId: findSelection(selections, "upper_pattern")?.catalogItemId ?? "",
    lowerPatternId: findSelection(selections, "lower_pattern")?.catalogItemId ?? "",
    fabricId: findSelection(selections, "fabric")?.catalogItemId ?? "",
    extraIds: findSelectionByKind(selections, "extra").map((selection) => selection.catalogItemId ?? "").filter(Boolean),
    individualLayer: determineIndividualLayer(selections),
  };
}

function determineIndividualLayer(selections: OrderSelection[]): "" | "upper" | "lower" {
  const upperGarment = findSelection(selections, "garment_upper");
  const lowerGarment = findSelection(selections, "garment_lower");
  if (upperGarment) return "upper";
  if (lowerGarment) return "lower";
  return "";
}

export function visibleBalanceString(financials: OrderFinancials | null) {
  if (!financials) return null;
  const total = financials.totalAmount.toFixed(2);
  const deposit = financials.depositAmount.toFixed(2);
  if (!financials.depositPaid) return total;
  const balanceCents = BigInt(total.replace(".", "")) - BigInt(deposit.replace(".", ""));
  const negative = balanceCents < BigInt(0);
  const abs = negative ? -balanceCents : balanceCents;
  const cents = abs % BigInt(100);
  const integerPart = abs / BigInt(100);
  const formatted = `${negative ? "-" : ""}${integerPart.toString()}.${cents.toString().padStart(2, "0")}`;
  return formatted;
}

export function formatArsFromNumber(value: number) {
  const [integerPart, fractionPart] = value.toFixed(2).split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$ ${groupedInteger},${fractionPart}`;
}

export function formatArsFromString(value: string) {
  const [integerPart, fractionPart] = value.split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$ ${groupedInteger},${fractionPart}`;
}

export function selectionIsHistorical(selection: OrderSelection) {
  return selection.catalogItemId === null;
}

type OperationalChange = {
  field: string;
  previous?: unknown;
  next?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function operationalChanges(details: Record<string, unknown>): OperationalChange[] {
  const changes = details.changes;
  if (!Array.isArray(changes)) return [];
  return changes.flatMap((change) => isRecord(change) && typeof change.field === "string"
    ? [{ field: change.field, previous: change.previous, next: change.next }]
    : []);
}

function changeLabel(change: OperationalChange) {
  switch (change.field) {
    case "customer_name": return "Se actualizó el cliente o equipo";
    case "quantity": return "Se actualizó la cantidad";
    case "order_type": return "Se actualizó el tipo de pedido";
    case "order_date": return "Se actualizó la fecha del pedido";
    case "promised_delivery_date": return "Se actualizó la fecha prometida";
    case "description": return "Se actualizó la descripción";
    case "total_amount": return "Se actualizó el total";
    case "deposit_amount": return "Se actualizó el monto de seña";
    case "deposit_paid": return change.next === true ? "Se marcó la seña pagada" : "Se desmarcó la seña pagada";
    case "specifications": return "Se actualizaron las especificaciones";
    default: return "Se actualizó el pedido";
  }
}

export function operationalHistorySummary(details: Record<string, unknown>) {
  const changes = operationalChanges(details);
  if (changes.length !== 1) return "Se actualizó el pedido";
  return changeLabel(changes[0]!);
}

export function operationalHistoryDetails(details: Record<string, unknown>) {
  return operationalChanges(details).map(changeLabel);
}
