import { z } from "zod";

import { normalizeAggregateMoney } from "../../lib/money/decimal";

export type MetricsProductTypeValue = "individual" | "set" | "premium_set" | "flag" | "bag" | "shield";

const optionSchema = z.object({ id: z.uuid(), name: z.string() });
const cashDailySeriesSchema = z.object({ date: z.iso.date(), income: z.string(), expense: z.string() });
const salesDailySeriesSchema = z.object({
  date: z.iso.date(),
  loose_garments: z.number().int().nonnegative(),
  sets: z.object({ common: z.number().int().nonnegative(), premium: z.number().int().nonnegative() }),
});
const productSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(["garment", "flag", "bag", "shield"]),
  garment_layer: z.enum(["upper", "lower"]).nullable(),
  quantity: z.number().int().nonnegative(),
});

const attributeRankingSchema = z.array(z.object({ id: z.string(), name: z.string(), quantity: z.number().int().nonnegative() }));

const metricsSalesSchema = z.object({
  rankings: z.object({
    fabric: attributeRankingSchema,
    neckline: attributeRankingSchema,
    upper_pattern: attributeRankingSchema,
    lower_pattern: attributeRankingSchema,
    product_type: attributeRankingSchema,
  }).optional(),
  products: z.array(productSchema),
  loose_garments: z.number().int().nonnegative(),
  sets: z.object({ common: z.number().int().nonnegative(), premium: z.number().int().nonnegative() }),
  daily_series: z.array(salesDailySeriesSchema),
});

const metricsCashSchema = z.object({
  income: z.string(),
  expense: z.string(),
  net: z.string(),
  daily_series: z.array(cashDailySeriesSchema),
});

const metricsSummarySchema = z.object({
  generated_at: z.iso.datetime({ offset: true }),
  period: z.object({ from: z.iso.date(), to: z.iso.date() }).refine((period) => period.from <= period.to),
  cash: z.object({ income: z.string(), expense: z.string(), net: z.string() }),
  loose_garments: z.number().int().nonnegative(),
});

const metricsDashboardSchema = z.object({
  generated_at: z.iso.datetime({ offset: true }),
  period: z.object({ from: z.string(), to: z.string() }),
  cash: metricsCashSchema,
  incidents: z.object({
    total: z.number().int().nonnegative(),
    returns: z.number().int().nonnegative(),
    internal: z.number().int().nonnegative(),
    without_return: z.number().int().nonnegative(),
    reasons: z.array(z.object({
      code: z.string(),
      label: z.string(),
      internal: z.number().int().nonnegative(),
      without_return: z.number().int().nonnegative(),
      returns: z.number().int().nonnegative(),
    })),
  }),
  sales: metricsSalesSchema,
  filters: z.object({
    products: z.array(optionSchema.extend({ kind: z.enum(["garment", "flag", "bag", "shield"]), garment_layer: z.enum(["upper", "lower"]).nullable() })),
    fabrics: z.array(optionSchema),
    necklines: z.array(optionSchema),
    upper_patterns: z.array(optionSchema),
    lower_patterns: z.array(optionSchema),
  }),
});

export type MetricsProduct = z.infer<typeof productSchema>;
export type MetricsOption = z.infer<typeof optionSchema>;
export type MetricsCashDaily = z.infer<typeof cashDailySeriesSchema>;
export type MetricsSales = z.infer<typeof metricsSalesSchema>;
export type MetricsSalesDaily = z.infer<typeof salesDailySeriesSchema>;
export type MetricsDashboard = z.infer<typeof metricsDashboardSchema>;
export type MetricsSummary = z.infer<typeof metricsSummarySchema>;

export function parseMetricsDashboard(value: unknown): MetricsDashboard {
  const parsed = metricsDashboardSchema.safeParse(value);
  if (!parsed.success) throw new Error("La respuesta de métricas no tiene un formato válido.");

  return {
    ...parsed.data,
    cash: {
      income: normalizeAggregateMoney(parsed.data.cash.income),
      expense: normalizeAggregateMoney(parsed.data.cash.expense),
      net: normalizeAggregateMoney(parsed.data.cash.net),
      daily_series: parsed.data.cash.daily_series.map((day) => ({
        ...day,
        income: normalizeAggregateMoney(day.income),
        expense: normalizeAggregateMoney(day.expense),
      })),
    },
  };
}

export function parseMetricsSales(value: unknown): MetricsSales {
  const parsed = metricsSalesSchema.safeParse(value);
  if (!parsed.success) throw new Error("La respuesta de métricas no tiene un formato válido.");
  return parsed.data;
}

export function parseMetricsSummary(value: unknown): MetricsSummary {
  const parsed = metricsSummarySchema.safeParse(value);
  if (!parsed.success) throw new Error("La respuesta de métricas no tiene un formato válido.");

  return {
    ...parsed.data,
    cash: {
      income: normalizeAggregateMoney(parsed.data.cash.income),
      expense: normalizeAggregateMoney(parsed.data.cash.expense),
      net: normalizeAggregateMoney(parsed.data.cash.net),
    },
  };
}

export const metricsProductTypes: Array<{ value: MetricsProductTypeValue; label: string }> = [
  { value: "individual", label: "Prenda suelta" },
  { value: "set", label: "Conjunto común" },
  { value: "premium_set", label: "Conjunto premium" },
  { value: "flag", label: "Bandera" },
  { value: "bag", label: "Bolso" },
  { value: "shield", label: "Escudo" },
];
