"use server";

import { revalidatePath } from "next/cache";

import { mutationResult, type MutationState } from "@/lib/action-state";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";

import { canCorrectIncident, canCreateIncident, incidentSchema } from "./incident-schemas";

export async function saveOrderIncidentAction(_previous: MutationState, formData: FormData): Promise<MutationState> {
  const parsed = incidentSchema.safeParse({ ...Object.fromEntries(formData), reasons: formData.getAll("reasons") });
  if (!parsed.success) return mutationResult("error", parsed.error.issues[0]?.message ?? "Revise los datos de la incidencia.", parsed.error.flatten().fieldErrors);
  const profile = await getCurrentProfile();
  const data = parsed.data;
  if (!profile || !profile.isActive || profile.mustChangePassword
    || !canCreateIncident(profile.role, data.kind) || (data.expectedVersion > 0 && !canCorrectIncident(profile.role))) {
    return mutationResult("error", "No tiene permiso para realizar esta operación.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_order_incident", {
    p_order_id: data.orderId, p_incident_id: data.incidentId, p_kind: data.kind, p_reasons: data.reasons,
    p_expected_version: data.expectedVersion, p_request_id: data.requestId,
  });
  if (error) {
    const messages = [
      "La incidencia cambió en otra sesión. Actualice el pedido.", "No hay cambios para guardar.",
      "El pedido no está disponible para registrar o corregir incidencias.", "La incidencia no está disponible.",
      "La incidencia ya existe. Actualice el pedido.", "La solicitud ya fue utilizada para otra incidencia.",
    ];
    return mutationResult("error", messages.find((message) => error.message.includes(message)) ?? "No se pudo guardar la incidencia. Intente nuevamente.");
  }
  revalidatePath(`/orders/${data.orderId}`);
  return mutationResult("success", data.expectedVersion === 0 ? "Incidencia registrada." : "Incidencia corregida. Se conservó el historial.");
}
