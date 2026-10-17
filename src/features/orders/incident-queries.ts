import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type OrderIncident = Pick<Database["public"]["Tables"]["order_incidents"]["Row"], "id" | "kind" | "reasons" | "version" | "created_at"> & {
  order_incident_events: Array<Pick<Database["public"]["Tables"]["order_incident_events"]["Row"], "version" | "kind" | "reasons" | "occurred_at">>;
};

export async function getOrderIncidents(orderId: string): Promise<{ incidents: OrderIncident[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("order_incidents")
    .select("id, kind, reasons, version, created_at, order_incident_events(version, kind, reasons, occurred_at)")
    .eq("order_id", orderId).order("created_at", { ascending: false }).order("id");
  return { incidents: data ?? [], error: error ? "No se pudieron cargar las incidencias. Actualice el pedido para intentar nuevamente." : null };
}
