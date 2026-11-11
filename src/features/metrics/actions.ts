"use server";

import { requireActiveProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

import { canViewMetrics } from "./access";
import { parseMetricsDashboard, parseMetricsSales, parseMetricsSummary, type MetricsDashboard } from "./contract";
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

export async function getMetricsFilterOptionsAction(): Promise<MetricsDashboard["filters"]> {
  const profile = await requireActiveProfile();
  if (!canViewMetrics(profile.role)) throw new Error("No tenés permiso para consultar las métricas.");

  const supabase = await createClient();
  const [productsResult, itemsResult, optionsResult] = await Promise.all([
    supabase.from("catalog_products").select("id, name, kind, garment_layer").eq("is_active", true).order("kind").order("name"),
    supabase.from("catalog_items").select("id, name, kind").eq("is_active", true).order("kind").order("name"),
    supabase.from("catalog_product_options")
      .select("name, catalog_products!inner(is_active), catalog_product_option_values!inner(id, value, is_active)")
      .eq("is_active", true)
      .eq("catalog_products.is_active", true)
      .eq("catalog_product_option_values.is_active", true),
  ]);
  if (productsResult.error || itemsResult.error || optionsResult.error) {
    throw new Error("No se pudieron cargar los filtros de métricas. Intentá nuevamente.");
  }

  const items = {
    fabric: [] as Array<{ id: string; name: string }>,
    neckline: [] as Array<{ id: string; name: string }>,
    upper_pattern: [] as Array<{ id: string; name: string }>,
    lower_pattern: [] as Array<{ id: string; name: string }>,
  };
  for (const item of itemsResult.data) {
    if (item.kind === "fabric" || item.kind === "neckline" || item.kind === "upper_pattern" || item.kind === "lower_pattern") {
      items[item.kind].push({ id: item.id, name: item.name });
    }
  }

  const optionKinds: Record<string, keyof typeof items | undefined> = {
    fabric: "fabric", tela: "fabric", neckline: "neckline", cuello: "neckline",
    "upper pattern": "upper_pattern", "molde superior": "upper_pattern",
    "lower pattern": "lower_pattern", "molde inferior": "lower_pattern",
  };
  for (const option of optionsResult.data) {
    const kind = optionKinds[option.name.trim().toLowerCase()];
    if (!kind) continue;
    for (const value of option.catalog_product_option_values) items[kind].push({ id: value.id, name: value.value });
  }
  for (const options of Object.values(items)) options.sort((a, b) => a.name.localeCompare(b.name, "es-AR") || a.id.localeCompare(b.id));

  return {
    products: productsResult.data,
    fabrics: items.fabric,
    necklines: items.neckline,
    upper_patterns: items.upper_pattern,
    lower_patterns: items.lower_pattern,
  };
}
