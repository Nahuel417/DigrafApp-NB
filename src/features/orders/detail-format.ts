import type { OrderDetail, OrderFinancials, OrderSelection } from "./detail-queries";
import type { OrderLineInput, CatalogOptionSelection, LegacyLineOptions } from "./line-contracts";

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

export function timelineStageName(snapshotName: string | null, currentName: string | undefined) {
  return snapshotName ?? currentName;
}

export function orderTypeLabel(orderType: OrderDetail["orderType"]) {
  if (orderType === null) return "Tipo histórico no disponible";
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

function optionSelections(value: unknown): CatalogOptionSelection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.option_id !== "string" || !Array.isArray(item.values)) return [];
    const valueIds = item.values.flatMap((entry) => isRecord(entry) && typeof entry.value_id === "string" ? [entry.value_id] : []);
    return [{ option_id: item.option_id, value_ids: valueIds }];
  });
}

function legacyOptions(value: unknown): LegacyLineOptions {
  if (!isRecord(value)) return {};
  const id = (key: string) => typeof value[key] === "string" ? value[key] : isRecord(value[key]) && typeof value[key].id === "string" ? value[key].id : undefined;
  const extras = Array.isArray(value.extras) ? value.extras.flatMap((entry) => isRecord(entry) && typeof entry.id === "string" ? [entry.id] : []) : undefined;
  return {
    ...(id("neckline") ? { neckline_id: id("neckline") } : {}),
    ...(id("upper_pattern") ? { upper_pattern_id: id("upper_pattern") } : {}),
    ...(id("lower_pattern") ? { lower_pattern_id: id("lower_pattern") } : {}),
    ...(id("fabric") ? { fabric_id: id("fabric") } : {}),
    ...(extras ? { extra_ids: extras } : {}),
  };
}

export function orderLinesForEdit(lines: OrderDetail["lines"]): OrderLineInput[] {
  return lines.map((line) => {
    const configuration = line.configurationSnapshot;
    if (line.lineType === "set") {
      const upper = isRecord(configuration.upper) ? configuration.upper : null;
      const lower = isRecord(configuration.lower) ? configuration.lower : null;
      return {
        position: line.position,
        line_type: "set",
        quantity: line.quantity,
        color: line.color,
         configuration: {
           ...(upper && typeof upper.product_id === "string" ? { upper: { product_id: upper.product_id, options: optionSelections(upper.options) } } : {}),
           ...(lower && typeof lower.product_id === "string" ? { lower: { product_id: lower.product_id, options: optionSelections(lower.options) } } : {}),
           legacy_options: legacyOptions(configuration.legacy_options),
         },
         shield_product_ids: line.shieldProductIds,
      };
    }
    return {
      position: line.position,
      line_type: line.lineType,
      product_id: line.productId ?? undefined,
      quantity: line.quantity,
       color: line.color,
       options: optionSelections(configuration.options),
       configuration: { legacy_options: legacyOptions(configuration.legacy_options) },
       shield_product_ids: line.shieldProductIds,
     };
  });
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
