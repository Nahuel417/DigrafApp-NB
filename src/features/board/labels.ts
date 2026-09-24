import type { OrderLabel } from "./schemas";

export const orderLabelOptions = [
  { value: "urgent", name: "Urgente" },
  { value: "returned", name: "Devuelta" },
  { value: "review", name: "Revisión" },
  { value: "ready_for_delivery", name: "APROBADO PARA ENTREGA" },
  { value: "needs_finishing", name: "FALTA TERMINACIÓN" },
  { value: "needs_cleaning", name: "FALTA LIMPIAR" },
] as const satisfies ReadonlyArray<{ value: OrderLabel; name: string }>;

export const orderLabelReferenceOptions = [
  { value: "ready_for_delivery", description: "Pedido listo para entregar." },
  { value: "needs_finishing", description: "Falta completar la terminación." },
  { value: "needs_cleaning", description: "Falta limpiar antes de entregar." },
] as const satisfies ReadonlyArray<{ value: OrderLabel; description: string }>;

export function orderLabelName(label: OrderLabel) {
  return orderLabelOptions.find((option) => option.value === label)?.name ?? "Sin etiqueta";
}

export function orderLabelClassName(label: OrderLabel) {
  switch (label) {
    case "urgent":
      return "border-error/30 bg-error/10 text-error";
    case "returned":
      return "border-label-returned-foreground/20 bg-label-returned text-label-returned-foreground";
    case "review":
      return "border-label-review-foreground/20 bg-label-review text-label-review-foreground";
    case "ready_for_delivery":
      return "border-success-foreground/20 bg-success text-success-foreground";
    case "needs_finishing":
      return "border-info-foreground/20 bg-info text-info-foreground";
    case "needs_cleaning":
      return "border-warning-foreground/20 bg-warning text-warning-foreground";
  }
}

export function orderLabelCardClassName(label: OrderLabel | null) {
  switch (label) {
    case "ready_for_delivery":
      return "bg-success";
    case "needs_finishing":
      return "bg-info";
    case "needs_cleaning":
      return "bg-warning";
    default:
      return "bg-card";
  }
}

export function orderLabelAccentClassName(label: OrderLabel) {
  switch (label) {
    case "urgent":
      return "bg-error/20";
    case "returned":
      return "bg-label-returned-foreground/30";
    case "review":
      return "bg-label-review-foreground/30";
    case "ready_for_delivery":
      return "bg-success-foreground/30";
    case "needs_finishing":
      return "bg-info-foreground/30";
    case "needs_cleaning":
      return "bg-warning-foreground/30";
  }
}
