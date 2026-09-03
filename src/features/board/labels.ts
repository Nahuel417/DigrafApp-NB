import type { OrderLabel } from "./schemas";

export const orderLabelOptions = [
  { value: "urgent", name: "Urgente" },
  { value: "returned", name: "Devuelta" },
  { value: "review", name: "Revisión" },
] as const satisfies ReadonlyArray<{ value: OrderLabel; name: string }>;

export function orderLabelName(label: OrderLabel) {
  return orderLabelOptions.find((option) => option.value === label)?.name ?? "Sin etiqueta";
}

export function orderLabelClassName(label: OrderLabel) {
  switch (label) {
    case "urgent":
      return "border-error/30 bg-error/10 text-error";
    case "returned":
      return "border-warning-foreground/20 bg-warning text-warning-foreground";
    case "review":
      return "border-label-review-foreground/20 bg-label-review text-label-review-foreground";
  }
}
