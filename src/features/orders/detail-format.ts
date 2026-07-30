import type { OrderDetail, OrderDetailCatalogs, OrderFinancials, OrderSelection } from "./detail-queries";

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

export function selectionsForEdit(selections: OrderSelection[], catalogs: OrderDetailCatalogs) {
  return {
    garmentUpperId: findSelection(selections, "garment_upper")?.catalogItemId ?? "",
    garmentLowerId: findSelection(selections, "garment_lower")?.catalogItemId ?? "",
    necklineId: findSelection(selections, "neckline")?.catalogItemId ?? "",
    upperPatternId: findSelection(selections, "upper_pattern")?.catalogItemId ?? "",
    lowerPatternId: findSelection(selections, "lower_pattern")?.catalogItemId ?? "",
    fabricId: findSelection(selections, "fabric")?.catalogItemId ?? "",
    extraIds: findSelectionByKind(selections, "extra").map((selection) => selection.catalogItemId ?? "").filter(Boolean),
    individualLayer: determineIndividualLayer(selections, catalogs),
  };
}

function determineIndividualLayer(selections: OrderSelection[], catalogs: OrderDetailCatalogs): "" | "upper" | "lower" {
  const upperGarment = findSelection(selections, "garment_upper");
  const lowerGarment = findSelection(selections, "garment_lower");
  if (upperGarment?.catalogItemId) {
    const stillActive = catalogs.garments.some((garment) => garment.id === upperGarment.catalogItemId);
    if (stillActive || upperGarment.catalogItemId === null) return "upper";
  }
  if (lowerGarment?.catalogItemId) {
    const stillActive = catalogs.garments.some((garment) => garment.id === lowerGarment.catalogItemId);
    if (stillActive || lowerGarment.catalogItemId === null) return "lower";
  }
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
