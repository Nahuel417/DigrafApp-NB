import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canArchiveDeliveredOrder, canManageOrderLifecycle } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

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

export type ArchiveFilters = {
  search?: string;
  from?: string;
  to?: string;
};

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const archiveSearchSchema = z.string().trim().max(80);
const archiveDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate);

export function normalizeArchiveFilters(input: ArchiveFilters): ArchiveFilters {
  const parsedSearch = archiveSearchSchema.safeParse(input.search);
  const parsedFrom = archiveDateSchema.safeParse(input.from);
  const parsedTo = archiveDateSchema.safeParse(input.to);
  const search = parsedSearch.success ? parsedSearch.data.replace(/[^\p{L}\p{N}\s_-]/gu, " ").replace(/\s+/g, " ").trim() : undefined;
  const from = parsedFrom.success ? parsedFrom.data : undefined;
  const to = parsedTo.success ? parsedTo.data : undefined;
  return { search: search || undefined, from, to };
}

export function hasInvalidArchiveDateRange(filters: ArchiveFilters): boolean {
  return Boolean(filters.from && filters.to && filters.from > filters.to);
}

function buildArchiveSearch(search: string, columns: string[]): string | null {
  const publicNumberValue = search.replace(/^ped[-\s]?/i, "");
  const publicNumber = /^\d+$/.test(publicNumberValue) ? Number(publicNumberValue) : null;
  const conditions = columns.map((column) => `${column}.ilike.%${search}%`);
  if (publicNumber !== null && Number.isSafeInteger(publicNumber)) conditions.push(`public_number.eq.${publicNumber}`);
  return conditions.length > 0 ? conditions.join(",") : null;
}

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

export async function getOrderArchive(page: number, pageSize: number = ARCHIVE_PAGE_SIZE, filters: ArchiveFilters = {}): Promise<ArchivePage<ArchivedOrder> | null> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canManageOrderLifecycle(profile.role)) return null;

  const supabase = await createClient();
  const normalizedFilters = normalizeArchiveFilters(filters);
  const hasValidDateRange = !hasInvalidArchiveDateRange(normalizedFilters);
  const result = await resolveArchivePage<ArchiveRow>(
    async (from, to) => {
      let query = supabase
        .from("orders")
        .select("id, public_number, customer_name, current_stage_id, cancelled_at, cancelled_by, cancellation_reason, updated_at", { count: "exact" })
        .eq("lifecycle_state", "cancelled");
      if (normalizedFilters.search) {
        const search = buildArchiveSearch(normalizedFilters.search, ["customer_name"]);
        if (search) query = query.or(search);
      }
      if (hasValidDateRange && normalizedFilters.from) query = query.gte("cancelled_at", `${normalizedFilters.from}T00:00:00-03:00`);
      if (hasValidDateRange && normalizedFilters.to) query = query.lte("cancelled_at", `${normalizedFilters.to}T23:59:59.999-03:00`);
      const { data, count, error } = await query
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
      : supabase.rpc("get_cancelled_order_actor_names", { p_order_ids: result.orders.map((row) => row.id) }),
  ]);
  return { ...result, orders: mapArchiveRows(result.orders, (stages ?? []) as LookupRow[], (profiles ?? []) as LookupRow[]) };
}

export async function getArchivedDeliveredOrders(page: number, pageSize: number = ARCHIVE_PAGE_SIZE, filters: ArchiveFilters = {}): Promise<ArchivePage<ArchivedDeliveredOrder> | null> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canArchiveDeliveredOrder(profile.role)) return null;

  const supabase = await createClient();
  const normalizedFilters = normalizeArchiveFilters(filters);
  const hasValidDateRange = !hasInvalidArchiveDateRange(normalizedFilters);
  const result = await resolveArchivePage<ArchivedDeliveredRow>(
    async (from, to) => {
      let query = supabase
        .from("archived_delivered_orders")
        .select("id, public_number, customer_name, client_name, team_name, quantity, order_date, promised_delivery_date, current_stage_id, updated_at", { count: "exact" })
      if (normalizedFilters.search) {
        const search = buildArchiveSearch(normalizedFilters.search, ["client_name", "customer_name"]);
        if (search) query = query.or(search);
      }
      if (hasValidDateRange && normalizedFilters.from) query = query.gte("updated_at", `${normalizedFilters.from}T00:00:00-03:00`);
      if (hasValidDateRange && normalizedFilters.to) query = query.lte("updated_at", `${normalizedFilters.to}T23:59:59.999-03:00`);
      const { data, count, error } = await query
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
