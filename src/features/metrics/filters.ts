import { z } from "zod";

export type MetricsDateRange = { from: string; to: string };
export type MetricsPeriod = "today" | "last7" | "currentMonth" | "previousMonth" | "custom";
export type MetricsProductType = "individual" | "set" | "premium_set" | "flag" | "bag" | "shield";

export type MetricsFilters = MetricsDateRange & {
  productId: string | null;
  fabricId: string | null;
  necklineId: string | null;
  upperPatternId: string | null;
  lowerPatternId: string | null;
  productType: MetricsProductType | null;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const productTypes = ["individual", "set", "premium_set", "flag", "bag", "shield"] as const;

function isCalendarDate(value: string) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

const dateSchema = z.string().refine(isCalendarDate, "Ingresá una fecha válida.");
const optionalUuid = z.preprocess((value) => value === "" ? null : value, z.uuid().nullable().optional())
  .transform((value) => value?.toLowerCase() ?? null);

const metricsFiltersSchema = z.object({
  from: dateSchema,
  to: dateSchema,
  productId: optionalUuid,
  fabricId: optionalUuid,
  necklineId: optionalUuid,
  upperPatternId: optionalUuid,
  lowerPatternId: optionalUuid,
  productType: z.preprocess((value) => value === "" ? null : value, z.enum(productTypes).nullable().optional()).transform((value) => value ?? null),
}).refine((filters) => filters.from <= filters.to, {
  message: "La fecha desde no puede ser posterior a la fecha hasta.",
  path: ["to"],
});

export function operationalDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(value: string, amount: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + amount));
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}

export function resolveMetricsDateRange(period: MetricsPeriod, now = new Date(), custom?: MetricsDateRange): MetricsDateRange {
  const today = operationalDate(now);
  if (period === "today") return { from: today, to: today };
  if (period === "last7") return { from: addDays(today, -6), to: today };
  if (period === "currentMonth") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (period === "previousMonth") {
    const lastDay = addDays(`${today.slice(0, 7)}-01`, -1);
    return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
  }

  if (!custom) throw new Error("Ingresá las fechas del período personalizado.");
  const normalized = normalizeMetricsFilters(custom);
  return { from: normalized.from, to: normalized.to };
}

export function normalizeMetricsFilters(input: unknown): MetricsFilters {
  return metricsFiltersSchema.parse(input) as MetricsFilters;
}
