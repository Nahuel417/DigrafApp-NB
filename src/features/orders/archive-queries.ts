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

export type ArchivePage<T> = {
  orders: T[];
  total: number;
  page: number;
  totalPages: number;
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

type RangedResult<T> = {
  data: T[] | null;
  count: number | null;
  error: { message: string } | null;
};

type QueryError = { message: string } | null;

export const ARCHIVE_PAGE_SIZE = 10;

function normalizeArchivePage(raw: number): number {
  if (!Number.isFinite(raw) || raw < 1 || !Number.isInteger(raw)) return 1;
  return raw;
}

function computeArchiveRange(page: number, total: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * pageSize;
  const to = total === 0 ? -1 : Math.min(from + pageSize - 1, total - 1);
  return { safePage, totalPages, from, to };
}

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

async function resolveArchivePage<T>(
  fetch: (from: number, to: number) => Promise<RangedResult<T>>,
  page: number,
  pageSize: number,
  errorMessage: string,
): Promise<ArchivePage<T>> {
  const normalized = normalizeArchivePage(page);
  const initialFrom = (normalized - 1) * pageSize;
  const initialTo = initialFrom + pageSize - 1;
  const first = await fetch(initialFrom, initialTo);
  if (first.error) throw new Error(errorMessage);
  const total = first.count ?? 0;
  const { totalPages, safePage, from, to } = computeArchiveRange(normalized, total, pageSize);

  if (safePage !== normalized) {
    const fallback = await fetch(from, to);
    if (fallback.error) throw new Error(errorMessage);
    return { orders: fallback.data ?? [], total, page: safePage, totalPages };
  }

  return { orders: first.data ?? [], total, page: safePage, totalPages };
}

export async function getOrderArchive(page: number, pageSize: number = ARCHIVE_PAGE_SIZE): Promise<ArchivePage<ArchivedOrder> | null> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canManageOrderLifecycle(profile.role)) return null;

  const supabase = await createClient();
  const result = await resolveArchivePage<ArchiveRow>(
    async (from, to) => {
      const { data, count, error } = await supabase
        .from("orders")
        .select("id, public_number, customer_name, current_stage_id, cancelled_at, cancelled_by, cancellation_reason, updated_at", { count: "exact" })
        .eq("lifecycle_state", "cancelled")
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      return { data: (data ?? null) as ArchiveRow[] | null, count, error: error as QueryError };
    },
    page,
    pageSize,
    "No se pudo cargar el Archivo de pedidos.",
  );

  const empty = result.orders.length === 0;
  const [{ data: stages }, { data: profiles }] = await Promise.all([
    supabase.from("workflow_stages").select("id, name"),
    empty
      ? Promise.resolve({ data: [] as LookupRow[] | null, error: null as QueryError })
      : supabase.from("profiles").select("id, display_name").in("id", result.orders.map((row) => row.cancelled_by).filter((id): id is string => Boolean(id))),
  ]);
  return { ...result, orders: mapArchiveRows(result.orders, (stages ?? []) as LookupRow[], (profiles ?? []) as LookupRow[]) };
}

export async function getArchivedDeliveredOrders(page: number, pageSize: number = ARCHIVE_PAGE_SIZE): Promise<ArchivePage<ArchivedDeliveredOrder> | null> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canArchiveDeliveredOrder(profile.role)) return null;

  const supabase = await createClient();
  const result = await resolveArchivePage<ArchivedDeliveredRow>(
    async (from, to) => {
      const { data, count, error } = await supabase
        .from("archived_delivered_orders")
        .select("id, public_number, customer_name, client_name, team_name, quantity, order_date, promised_delivery_date, current_stage_id, updated_at", { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      return { data: (data ?? null) as ArchivedDeliveredRow[] | null, count, error: error as QueryError };
    },
    page,
    pageSize,
    "No se pudo cargar el Archivo de entregados.",
  );

  const { data: stages } = await supabase.from("workflow_stages").select("id, name");
  return { ...result, orders: mapArchivedDeliveredRows(result.orders, (stages ?? []) as LookupRow[]) };
}
