import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canManageOrderLifecycle } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export type ArchivedOrder = {
  id: string;
  publicNumber: number;
  customerName: string;
  currentStageName: string;
  cancelledAt: string;
  cancelledByDisplayName: string;
  cancellationReason: string;
  updatedAt: string;
};

type ArchiveRow = {
  id: string;
  public_number: number;
  customer_name: string;
  current_stage_id: string;
  cancelled_at: string;
  cancelled_by: string;
  cancellation_reason: string;
  updated_at: string;
};

type LookupRow = { id: string; name?: string; display_name?: string };

export function mapArchiveRows(rows: ArchiveRow[], stages: LookupRow[], profiles: LookupRow[]): ArchivedOrder[] {
  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name ?? "Etapa no disponible"]));
  const profileNames = new Map(profiles.map((profile) => [profile.id, profile.display_name ?? "Perfil no disponible"]));
  return rows.map((row) => ({
    id: row.id,
    publicNumber: row.public_number,
    customerName: row.customer_name,
    currentStageName: stageNames.get(row.current_stage_id) ?? "Etapa no disponible",
    cancelledAt: row.cancelled_at,
    cancelledByDisplayName: profileNames.get(row.cancelled_by) ?? "Perfil no disponible",
    cancellationReason: row.cancellation_reason,
    updatedAt: row.updated_at,
  }));
}

export async function getOrderArchive(): Promise<ArchivedOrder[] | null> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canManageOrderLifecycle(profile.role)) return null;

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("orders")
    .select("id, public_number, customer_name, current_stage_id, cancelled_at, cancelled_by, cancellation_reason, updated_at")
    .eq("lifecycle_state", "cancelled")
    .order("cancelled_at", { ascending: false });
  if (error) throw new Error("No se pudo cargar el Archivo de pedidos.");

  const [{ data: stages }, { data: profiles }] = await Promise.all([
    supabase.from("workflow_stages").select("id, name"),
    supabase.from("profiles").select("id, display_name").in("id", (rows ?? []).map((row) => row.cancelled_by).filter((id): id is string => Boolean(id))),
  ]);
  return mapArchiveRows((rows ?? []) as ArchiveRow[], (stages ?? []) as LookupRow[], (profiles ?? []) as LookupRow[]);
}
