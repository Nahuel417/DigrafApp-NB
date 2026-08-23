import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canArchiveDeliveredOrder, canManageOrderLifecycle } from "@/lib/auth/permissions";
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

export type ArchivedDeliveredOrder = {
  id: string;
  publicNumber: number;
  customerName: string;
  teamName: string;
  quantity: number;
  currentStageName: string;
  orderDate: string;
  promisedDeliveryDate: string;
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

type ArchivedDeliveredRow = {
  id: string;
  public_number: number;
  customer_name: string | null;
  client_name: string | null;
  team_name: string | null;
  quantity: number;
  order_date: string;
  promised_delivery_date: string;
  current_stage_id: string;
  updated_at: string;
};

type ViewQueryResult = { data: unknown[] | null; error: { message: string } | null };
type ViewClient = { from(table: string): { select(columns: string): { order(column: string, options: { ascending: boolean }): Promise<ViewQueryResult> } } };

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

export function mapArchivedDeliveredRows(rows: ArchivedDeliveredRow[], stages: LookupRow[]): ArchivedDeliveredOrder[] {
  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name ?? "Etapa no disponible"]));
  return rows.map((row) => ({
    id: row.id,
    publicNumber: row.public_number,
    customerName: row.client_name ?? row.customer_name ?? "Cliente histórico",
    teamName: row.team_name ?? "Equipo histórico",
    quantity: row.quantity,
    currentStageName: stageNames.get(row.current_stage_id) ?? "Etapa no disponible",
    orderDate: row.order_date,
    promisedDeliveryDate: row.promised_delivery_date,
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

export async function getArchivedDeliveredOrders(): Promise<ArchivedDeliveredOrder[] | null> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canArchiveDeliveredOrder(profile.role)) return null;

  const supabase = await createClient();
  const viewClient = supabase as unknown as ViewClient;
  const [{ data: rawRows, error }, { data: stages }] = await Promise.all([
    viewClient.from("archived_delivered_orders").select("id, public_number, customer_name, client_name, team_name, quantity, order_date, promised_delivery_date, current_stage_id, updated_at").order("updated_at", { ascending: false }),
    supabase.from("workflow_stages").select("id, name"),
  ]);
  if (error) throw new Error("No se pudo cargar el Archivo de entregados.");

  const rows = (rawRows ?? []).flatMap((row) => {
    if (typeof row !== "object" || row === null) return [];
    const value = row as Record<string, unknown>;
    if (typeof value.id !== "string" || typeof value.public_number !== "number" || typeof value.quantity !== "number" || typeof value.current_stage_id !== "string" || typeof value.order_date !== "string" || typeof value.promised_delivery_date !== "string" || typeof value.updated_at !== "string") return [];
    return [value as unknown as ArchivedDeliveredRow];
  });
  return mapArchivedDeliveredRows(rows, (stages ?? []) as LookupRow[]);
}
