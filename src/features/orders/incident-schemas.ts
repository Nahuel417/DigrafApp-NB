import { z } from "zod";

import { canEditOrderSensitive } from "@/lib/auth/permissions";
import type { Database } from "@/lib/supabase/database.types";

export const incidentKinds = {
  internal: "Interna",
  complaint_without_return: "Reclamo sin devolución",
  complaint_with_return: "Reclamo con devolución",
} as const;
export const incidentReasons = {
  sewing: "Falla de costura",
  design: "Diseño",
  incomplete: "Pedido incompleto",
  calendering: "Problema en calandrado",
  customer_service: "Atención al público",
} as const;
export type IncidentKind = keyof typeof incidentKinds;
export type IncidentReason = keyof typeof incidentReasons;
export const canCorrectIncident = canEditOrderSensitive;
export function canCreateIncident(role: Database["public"]["Enums"]["app_role"], kind: string) {
  return kind in incidentKinds && (canCorrectIncident(role) || (role === "employee" && kind === "internal"));
}

export const incidentSchema = z.object({
  orderId: z.uuid("El pedido no es válido."),
  incidentId: z.uuid("La incidencia no es válida."),
  requestId: z.uuid("La solicitud no es válida."),
  kind: z.enum(["internal", "complaint_without_return", "complaint_with_return"], { error: "Seleccione un tipo de incidencia." }),
  reasons: z.array(z.enum(["sewing", "design", "incomplete", "calendering", "customer_service"], { error: "Seleccione motivos válidos." }))
    .min(1, "Seleccione al menos un motivo.").max(5, "Seleccione como máximo cinco motivos."),
  expectedVersion: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().min(0).max(2147483646)),
});
