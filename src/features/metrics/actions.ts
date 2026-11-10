"use server";

import { requireActiveProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

import { canViewMetrics } from "./access";
import { parseMetricsDashboard, parseMetricsSales, parseMetricsSummary } from "./contract";
import { normalizeMetricsFilters } from "./filters";

type GeneratedMetricsArgs = Database["public"]["Functions"]["get_metrics_dashboard"]["Args"];
type MetricsArgs = { [K in keyof GeneratedMetricsArgs]: K extends "p_from" | "p_to" ? string : string | null };
type MetricsRpc = (
  name: "get_metrics_dashboard" | "get_metrics_sales" | "get_metrics_summary",
  args: MetricsArgs,
) => PromiseLike<{ data: Json | null; error: { message: string } | null }>;

function metricsRpc(client: Awaited<ReturnType<typeof createClient>>) {
  // Generated RPC types omit SQL parameter nullability; NULL explicitly means no catalog filter.
  return client.rpc.bind(client) as MetricsRpc;
}

export async function getMetricsDashboardAction(input: unknown) {
  const profile = await requireActiveProfile();
  if (!canViewMetrics(profile.role)) throw new Error("No tenés permiso para consultar las métricas.");

  let filters;
  try {
    filters = normalizeMetricsFilters(input);
  } catch {
    throw new Error("Revisá los filtros de métricas.");
  }

  const supabase = await createClient();
  const { data, error } = await metricsRpc(supabase)("get_metrics_dashboard", {
    p_from: filters.from,
    p_to: filters.to,
    p_product_id: filters.productId,
    p_fabric_id: filters.fabricId,
    p_neckline_id: filters.necklineId,
    p_upper_pattern_id: filters.upperPatternId,
    p_lower_pattern_id: filters.lowerPatternId,
    p_product_type: filters.productType,
  });
  if (error) {
    if (error.message.includes("No tenés permiso")) throw new Error("No tenés permiso para consultar las métricas.");
    throw new Error("No se pudieron cargar las métricas. Intentá nuevamente.");
  }

  return parseMetricsDashboard(data);
}

export async function getMetricsSummaryAction(input: unknown) {
  const profile = await requireActiveProfile();
  if (!canViewMetrics(profile.role)) throw new Error("No tenés permiso para consultar las métricas.");

  let filters;
  try {
    filters = normalizeMetricsFilters(input);
  } catch {
    throw new Error("Revisá los filtros de métricas.");
  }

  const supabase = await createClient();
  const { data, error } = await metricsRpc(supabase)("get_metrics_summary", {
    p_from: filters.from,
    p_to: filters.to,
    p_product_id: filters.productId,
    p_fabric_id: filters.fabricId,
    p_neckline_id: filters.necklineId,
    p_upper_pattern_id: filters.upperPatternId,
    p_lower_pattern_id: filters.lowerPatternId,
    p_product_type: filters.productType,
  });
  if (error) {
    if (error.message.includes("No tenés permiso")) throw new Error("No tenés permiso para consultar las métricas.");
    throw new Error("No se pudieron cargar las métricas. Intentá nuevamente.");
  }

  return parseMetricsSummary(data);
}

export async function getMetricsSalesAction(input: unknown) {
  const profile = await requireActiveProfile();
  if (!canViewMetrics(profile.role)) throw new Error("No tenés permiso para consultar las métricas.");

  let filters;
  try {
    filters = normalizeMetricsFilters(input);
  } catch {
    throw new Error("Revisá los filtros de métricas.");
  }

  const supabase = await createClient();
  const { data, error } = await metricsRpc(supabase)("get_metrics_sales", {
    p_from: filters.from,
    p_to: filters.to,
    p_product_id: filters.productId,
    p_fabric_id: filters.fabricId,
    p_neckline_id: filters.necklineId,
    p_upper_pattern_id: filters.upperPatternId,
    p_lower_pattern_id: filters.lowerPatternId,
    p_product_type: filters.productType,
  });
  if (error) {
    if (error.message.includes("No tenés permiso")) throw new Error("No tenés permiso para consultar las métricas.");
    throw new Error("No se pudieron cargar las métricas. Intentá nuevamente.");
  }

  return parseMetricsSales(data);
}
