"use client";

import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChartNoAxesCombined, ChevronDown, Filter, RefreshCw, RotateCcw, Shirt, Table2, Wallet } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatArs } from "@/lib/money/decimal";

import { getMetricsDashboardAction, getMetricsFilterOptionsAction, getMetricsSalesAction } from "../actions";
import { type MetricsDashboard, type MetricsOption, type MetricsProduct, type MetricsSales, metricsProductTypes } from "../contract";
import { normalizeMetricsFilters, resolveMetricsDateRange, type MetricsPeriod } from "../filters";
import { useMetricsCache } from "./metrics-cache-provider";

const MetricsCashChart = dynamic(() => import("./metrics-charts").then((module) => module.MetricsCashChart));
const MetricsIncidentChart = dynamic(() => import("./metrics-charts").then((module) => module.MetricsIncidentChart));
const MetricsProductChart = dynamic(() => import("./metrics-charts").then((module) => module.MetricsProductChart));
const MetricsReasonChart = dynamic(() => import("./metrics-charts").then((module) => module.MetricsReasonChart));
const MetricsSalesChart = dynamic(() => import("./metrics-charts").then((module) => module.MetricsSalesChart));
const MetricsSetsChart = dynamic(() => import("./metrics-charts").then((module) => module.MetricsSetsChart));

type IncidentKind = "all" | "internal" | "without_return" | "returns";

const incidentKindOptions: Array<{ value: IncidentKind; label: string }> = [
  { value: "all", label: "Todas las incidencias" },
  { value: "internal", label: "Internas" },
  { value: "without_return", label: "Reclamo sin devolución" },
  { value: "returns", label: "Devoluciones" },
];

const periodOptions: Array<{ value: MetricsPeriod; label: string }> = [
  { value: "today", label: "Hoy" },
  { value: "last7", label: "Últimos 7 días" },
  { value: "currentMonth", label: "Mes actual" },
  { value: "previousMonth", label: "Mes anterior" },
  { value: "custom", label: "Rango personalizado" },
];

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Cordoba",
});

const selectContentMotionClass = "duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none";

const productKindLabels: Record<MetricsProduct["kind"], string> = {
  garment: "Prenda",
  flag: "Bandera",
  bag: "Bolso",
  shield: "Escudo",
};

type CatalogFilterKey = "productId" | "fabricId" | "necklineId" | "upperPatternId" | "lowerPatternId";

function FilterSelect({
  id,
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  options: MetricsOption[];
  value: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select disabled={disabled} onValueChange={onChange} value={value ?? "all"}>
        <SelectTrigger className="h-11 rounded-xl bg-card shadow-sm transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none" disabled={disabled} id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={selectContentMotionClass}>
          <SelectGroup>
            <SelectItem value="all">Todas</SelectItem>
            {options.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function productLabel(product: MetricsProduct) {
  if (product.kind === "garment" && product.garment_layer) {
    return product.garment_layer === "upper" ? "Prenda superior" : "Prenda inferior";
  }
  return productKindLabels[product.kind];
}

function MetricsLoading() {
  return (
    <section aria-busy="true" aria-label="Cargando métricas" className="flex flex-col gap-5" role="status">
      <p className="text-sm text-muted-foreground">Cargando métricas...</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 border-b border-border py-7 xl:grid-cols-4">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
      </div>
    </section>
  );
}

function MetricsPanel({ number, title, description, busy, children }: {
  number: string;
  title: string;
  description: string;
  busy?: boolean;
  children: ReactNode;
}) {
  const headingId = `metrics-panel-${number}-heading`;

  return (
    <section aria-busy={busy} aria-labelledby={headingId} className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
      <header className="mb-5 flex items-start gap-2">
        <span aria-hidden="true" className="pt-0.5 font-mono text-[10px] text-primary">{number}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold" id={headingId}>{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

export function MetricsDashboard() {
  const { cache, salesCache, filterOptionsCache, ready, scope, hasQueried, markQueried, filters, period, setFilters, setPeriod, initializeFilters } = useMetricsCache();
  const [detailSnapshot, setDetailSnapshot] = useState<{ scope: string; periodKey: string; filterKey: string; dashboard: MetricsDashboard; sales: MetricsSales } | null>(null);
  const [filterOptionsSnapshot, setFilterOptionsSnapshot] = useState<{ scope: string; options: MetricsDashboard["filters"] } | null>(null);
  const [catalogFiltersOpen, setCatalogFiltersOpen] = useState(false);
  const [incidentKind, setIncidentKind] = useState<IncidentKind>("all");
  const [detailError, setDetailError] = useState<{ scope: string; periodKey: string; filterKey: string } | null>(null);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
  const [filterOptionsError, setFilterOptionsError] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);
  const requestVersion = useRef(0);
  const optionsRequestVersion = useRef(0);
  const skipAutomaticRequestKey = useRef<string | null>(null);

  const normalizedFilters = useMemo(() => filters ? normalizeMetricsFilters(filters) : null, [filters]);
  const requestKey = useMemo(() => normalizedFilters ? JSON.stringify(normalizedFilters) : null, [normalizedFilters]);
  const periodKey = useMemo(() => normalizedFilters ? JSON.stringify({ from: normalizedFilters.from, to: normalizedFilters.to }) : null, [normalizedFilters]);
  const hasCatalogFilters = Boolean(normalizedFilters && (
    normalizedFilters.productId !== null || normalizedFilters.fabricId !== null || normalizedFilters.necklineId !== null
    || normalizedFilters.upperPatternId !== null || normalizedFilters.lowerPatternId !== null || normalizedFilters.productType !== null
  ));
  const cachedDashboard = periodKey ? cache.peek(periodKey) : undefined;
  const cachedSales = requestKey ? salesCache.peek(requestKey) : undefined;
  const cachedFilterOptions = filterOptionsCache.peek("catalog-options");
  const selectedSnapshot = detailSnapshot?.scope === scope && detailSnapshot.periodKey === periodKey && detailSnapshot.filterKey === requestKey
    ? detailSnapshot
    : null;
  const dashboard = cachedDashboard ?? selectedSnapshot?.dashboard;
  const sales = hasCatalogFilters ? cachedSales ?? selectedSnapshot?.sales : dashboard?.sales;
  const rankings = sales?.rankings;
  const filterOptions = (filterOptionsSnapshot?.scope === scope ? filterOptionsSnapshot.options : undefined) ?? cachedFilterOptions;

  const loadFilterOptions = useCallback(() => {
    if (!ready || !scope) return;
    const cached = filterOptionsCache.peek("catalog-options");
    if (cached) {
      setFilterOptionsSnapshot({ scope, options: cached });
      return;
    }

    const version = ++optionsRequestVersion.current;
    setFilterOptionsLoading(true);
    setFilterOptionsError(false);
    void filterOptionsCache.get("catalog-options", getMetricsFilterOptionsAction).then(
      (options) => {
        if (optionsRequestVersion.current === version) setFilterOptionsSnapshot({ scope, options });
      },
      () => {
        if (optionsRequestVersion.current === version) setFilterOptionsError(true);
      },
    ).finally(() => {
      if (optionsRequestVersion.current === version) setFilterOptionsLoading(false);
    });
  }, [filterOptionsCache, ready, scope]);

  const loadMetrics = useCallback(async (refresh = false) => {
    if (!ready || !scope || !normalizedFilters || !requestKey || !periodKey) return;
    const version = ++requestVersion.current;
    setRequestLoading(true);
    setDetailError(null);
    if (refresh) setDetailSnapshot(null);

    try {
      const aggregateFilters = { ...normalizedFilters, productId: null, fabricId: null, necklineId: null, upperPatternId: null, lowerPatternId: null, productType: null };
      const dashboardRequest = cache.get(periodKey, () => getMetricsDashboardAction(aggregateFilters), { refresh });
      const salesRequest = hasCatalogFilters
        ? salesCache.get(requestKey, () => getMetricsSalesAction(normalizedFilters), { refresh })
        : dashboardRequest.then((result) => result.sales);
      const [loadedDashboard, loadedSales] = await Promise.all([dashboardRequest, salesRequest]);
      if (requestVersion.current === version) setDetailSnapshot({ scope, periodKey, filterKey: requestKey, dashboard: loadedDashboard, sales: loadedSales });
    } catch {
      if (requestVersion.current === version) setDetailError({ scope, periodKey, filterKey: requestKey });
    } finally {
      if (requestVersion.current === version) setRequestLoading(false);
    }
  }, [cache, hasCatalogFilters, normalizedFilters, periodKey, ready, requestKey, salesCache, scope]);

  useEffect(() => {
    if (ready && !filters) initializeFilters();
  }, [ready, filters, initializeFilters]);

  useEffect(() => {
    if (!hasQueried || !requestKey || !periodKey) return;
    if (skipAutomaticRequestKey.current === requestKey) {
      return;
    }

    skipAutomaticRequestKey.current = null;
    requestVersion.current += 1;
    const hasCachedData = Boolean(cache.peek(periodKey) && (!hasCatalogFilters || salesCache.peek(requestKey)));
    setDetailError(null);
    setRequestLoading(!hasCachedData);
    if (hasCachedData) return;

    const timeout = window.setTimeout(() => void loadMetrics(), 180);
    return () => window.clearTimeout(timeout);
  }, [cache, hasCatalogFilters, hasQueried, loadMetrics, periodKey, requestKey, salesCache]);

  const currentDetailError = detailError?.scope === scope && detailError.periodKey === periodKey && detailError.filterKey === requestKey;
  const loading = requestLoading || (hasQueried && !currentDetailError && (!dashboard || !sales));

  const incidentTotal = dashboard?.incidents.total ?? 0;
  const selectedIncidentLabel = incidentKindOptions.find((option) => option.value === incidentKind)?.label ?? "Todas las incidencias";
  const selectedIncidentCount = incidentKind === "all" ? incidentTotal : dashboard?.incidents[incidentKind] ?? 0;
  const selectedReasonKinds: Array<"internal" | "without_return" | "returns"> = incidentKind === "all"
    ? ["internal", "without_return", "returns"]
    : [incidentKind];
  const selectedIncidentReasons = dashboard?.incidents.reasons.map((reason) => ({
    code: reason.code,
    label: reason.label,
    internal: incidentKind === "all" || incidentKind === "internal" ? reason.internal : 0,
    without_return: incidentKind === "all" || incidentKind === "without_return" ? reason.without_return : 0,
    returns: incidentKind === "all" || incidentKind === "returns" ? reason.returns : 0,
  })) ?? [];

  function queryMetrics() {
    if (!ready || !filters || !requestKey) return;
    markQueried();
    skipAutomaticRequestKey.current = requestKey;
    void loadMetrics();
  }

  function refreshMetrics() {
    if (!ready || !filters) return;
    void loadMetrics(true);
  }

  function updateCatalogFilter(key: CatalogFilterKey, value: string) {
    setFilters((current) => current ? { ...current, [key]: value === "all" ? null : value } : current);
  }

  function updateDate(key: "from" | "to", value: string) {
    setPeriod("custom");
    setFilters((current) => current ? { ...current, [key]: value } : current);
  }

  function changePeriod(value: string) {
    const nextPeriod = periodOptions.find((option) => option.value === value)?.value;
    if (!nextPeriod) return;
    setPeriod(nextPeriod);
    if (nextPeriod === "custom") return;
    const range = resolveMetricsDateRange(nextPeriod);
    setFilters((current) => current ? { ...current, ...range } : current);
  }

  function changeProductType(value: string) {
    const productType = metricsProductTypes.find((option) => option.value === value)?.value ?? null;
    setFilters((current) => current ? { ...current, productType } : current);
  }

  function clearCatalogFilters() {
    setFilters((current) => current ? {
      ...current,
      productId: null,
      fabricId: null,
      necklineId: null,
      upperPatternId: null,
      lowerPatternId: null,
      productType: null,
    } : current);
  }

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col px-5 py-8 lg:px-9 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium tracking-label text-primary">
            <ChartNoAxesCombined aria-hidden="true" className="size-4" />
            DIGRAF / OPERACIONES
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-display">Métricas</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Ventas, caja y producción en perspectiva.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {dashboard ? <p className="text-right text-xs text-muted-foreground">Consultado el <time dateTime={dashboard.generated_at}>{dateTimeFormatter.format(new Date(dashboard.generated_at))}</time></p> : null}
          <Button className="group" disabled={!ready || !filters || (hasQueried && loading)} onClick={hasQueried ? refreshMetrics : queryMetrics} type="button" variant="outline">
            <RefreshCw aria-hidden="true" className="transition-transform duration-200 group-hover:rotate-180 group-focus-visible:rotate-180 group-active:scale-90 motion-reduce:transition-none" data-icon="inline-start" />
            {hasQueried ? "Actualizar" : "Consultar"}
          </Button>
        </div>
      </header>

      {filters ? (
        <section aria-labelledby="metrics-filters-heading" className="mt-7 border-y border-border py-5">
          <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap sm:gap-3">
            <Field className="col-span-2 min-w-0 sm:col-span-1 sm:w-40 sm:flex-none">
              <FieldLabel className="flex items-center gap-1.5 text-xs" htmlFor="metrics-period">
                <CalendarDays aria-hidden="true" className="size-3.5 text-primary" />
                Período
              </FieldLabel>
              <Select onValueChange={changePeriod} value={period}>
                <SelectTrigger className="h-11 rounded-xl bg-card shadow-sm transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none" id="metrics-period"><SelectValue /></SelectTrigger>
                <SelectContent className={selectContentMotionClass}><SelectGroup>{periodOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field className="min-w-0 sm:w-40 sm:flex-none">
              <FieldLabel className="flex items-center gap-1.5 text-xs" htmlFor="metrics-from"><CalendarDays aria-hidden="true" className="size-3.5 text-primary" />Desde</FieldLabel>
              <DatePickerField className="h-11 rounded-xl bg-card shadow-sm" id="metrics-from" label="la fecha Desde" max={filters.to} onChange={(value) => updateDate("from", value)} triggerLabel="Abrir calendario Desde" value={filters.from} />
            </Field>
            <Field className="min-w-0 sm:w-40 sm:flex-none">
              <FieldLabel className="flex items-center gap-1.5 text-xs" htmlFor="metrics-to"><CalendarDays aria-hidden="true" className="size-3.5 text-primary" />Hasta</FieldLabel>
              <DatePickerField className="h-11 rounded-xl bg-card shadow-sm" id="metrics-to" label="la fecha Hasta" min={filters.from} onChange={(value) => updateDate("to", value)} triggerLabel="Abrir calendario Hasta" value={filters.to} />
            </Field>
            <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
              <Button aria-controls="metrics-catalog-filters" aria-expanded={catalogFiltersOpen} className="group h-11 flex-1 rounded-xl px-3 sm:flex-none" onClick={() => {
                const opening = !catalogFiltersOpen;
                setCatalogFiltersOpen(opening);
                if (opening) loadFilterOptions();
              }} type="button" variant="outline">
                <Filter aria-hidden="true" className="transition-transform duration-150 group-hover:-translate-y-px group-focus-visible:-translate-y-px group-active:scale-90 motion-reduce:transition-none" data-icon="inline-start" />
                Filtros
                {hasCatalogFilters ? <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" /> : null}
                <ChevronDown aria-hidden="true" className={`size-4 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none ${catalogFiltersOpen ? "rotate-180" : ""}`} data-icon="inline-end" />
              </Button>
              <Button aria-label="Limpiar filtros" className="group size-11 shrink-0 rounded-xl border border-border bg-card p-0 shadow-sm" disabled={!hasCatalogFilters} onClick={clearCatalogFilters} title="Limpiar filtros" type="button" variant="ghost">
                <RotateCcw aria-hidden="true" className="transition-transform duration-150 group-hover:-rotate-45 group-focus-visible:-rotate-45 group-active:scale-90 motion-reduce:transition-none" />
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Los filtros de catálogo afectan ventas. Caja e incidencias: Total del período · no afectado por filtros de catálogo.</p>
          <span className="sr-only" id="metrics-filters-heading">Filtros de catálogo</span>
          <div aria-hidden={!catalogFiltersOpen} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${catalogFiltersOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`} id="metrics-catalog-filters" inert={!catalogFiltersOpen}>
            <div className="min-h-0 overflow-hidden">
              <FieldGroup className="grid gap-4 pt-4 sm:grid-cols-2 xl:grid-cols-3">
                <FilterSelect disabled={!filterOptions} id="metrics-product" label="Producto o prenda" options={filterOptions?.products ?? []} value={filters.productId} onChange={(value) => updateCatalogFilter("productId", value)} />
                <FilterSelect disabled={!filterOptions} id="metrics-fabric" label="Tela" options={filterOptions?.fabrics ?? []} value={filters.fabricId} onChange={(value) => updateCatalogFilter("fabricId", value)} />
                <FilterSelect disabled={!filterOptions} id="metrics-neckline" label="Cuello" options={filterOptions?.necklines ?? []} value={filters.necklineId} onChange={(value) => updateCatalogFilter("necklineId", value)} />
                <FilterSelect disabled={!filterOptions} id="metrics-upper-pattern" label="Molde superior" options={filterOptions?.upper_patterns ?? []} value={filters.upperPatternId} onChange={(value) => updateCatalogFilter("upperPatternId", value)} />
                <FilterSelect disabled={!filterOptions} id="metrics-lower-pattern" label="Molde inferior" options={filterOptions?.lower_patterns ?? []} value={filters.lowerPatternId} onChange={(value) => updateCatalogFilter("lowerPatternId", value)} />
                <Field>
                  <FieldLabel htmlFor="metrics-product-type">Tipo de producto</FieldLabel>
                  <Select onValueChange={changeProductType} value={filters.productType ?? "all"}>
                    <SelectTrigger className="h-11 rounded-xl bg-card shadow-sm transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none" id="metrics-product-type"><SelectValue /></SelectTrigger>
                    <SelectContent className={selectContentMotionClass}>
                      <SelectGroup>
                        <SelectItem value="all">Todos los tipos</SelectItem>
                        {metricsProductTypes.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              {filterOptionsLoading ? <p className="mt-3 text-xs text-muted-foreground" role="status">Cargando opciones de catálogo...</p> : null}
              {filterOptionsError ? <div className="mt-3 flex items-center gap-3 text-xs text-destructive"><span role="alert">No se pudieron cargar los filtros de catálogo.</span><Button onClick={loadFilterOptions} size="sm" type="button" variant="outline">Reintentar</Button></div> : null}
            </div>
          </div>
        </section>
      ) : null}

      {!ready ? <p className="mt-5 text-sm text-muted-foreground" role="status">Validando la sesión...</p> : null}
      {!hasQueried ? <p className="mt-7 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">Elegí los filtros que quieras y presioná Consultar para cargar las métricas.</p> : null}
      {currentDetailError ? (
        <Alert className="mt-5" role="alert" variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>No se pudieron cargar todos los datos de métricas. Intentá nuevamente.</span>
            <Button className="group" disabled={requestLoading} onClick={() => void loadMetrics()} size="sm" type="button" variant="outline">
              <RefreshCw aria-hidden="true" className="transition-transform duration-200 group-hover:rotate-180 group-focus-visible:rotate-180 group-active:scale-90 motion-reduce:transition-none" data-icon="inline-start" />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {hasQueried ? (
        <>
          <section aria-label="Resumen del período" aria-busy={!dashboard || !sales} className="mt-3 border-b border-border py-4">
            <p className="mb-4 text-xs text-muted-foreground">Ingresos, egresos y saldo neto: Total del período · no afectado por filtros de catálogo.</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
              <div className="min-w-0">
                <dt className="flex items-center gap-2 text-sm text-success-foreground"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-success"><ArrowDownLeft aria-hidden="true" className="size-4 text-success-foreground" /></span>Ingresos</dt>
                <dd className="mt-2 break-words font-mono text-xl font-semibold tabular-nums text-success-foreground sm:text-2xl">{dashboard ? formatArs(dashboard.cash.income) : <Skeleton className="mt-2 h-7 w-28" />}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-2 text-sm text-error"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-error/10"><ArrowUpRight aria-hidden="true" className="size-4 text-error" /></span>Egresos</dt>
                <dd className="mt-2 break-words font-mono text-xl font-semibold tabular-nums text-error sm:text-2xl">{dashboard ? formatArs(dashboard.cash.expense) : <Skeleton className="mt-2 h-7 w-28" />}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10"><Wallet aria-hidden="true" className="size-4 text-primary" /></span>Saldo neto</dt>
                <dd className="mt-2 break-words font-mono text-xl font-semibold tabular-nums sm:text-2xl">{dashboard ? formatArs(dashboard.cash.net) : <Skeleton className="mt-2 h-7 w-28" />}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-info"><Shirt aria-hidden="true" className="size-4 text-info-foreground" /></span>Prendas sueltas</dt>
                <dd className="mt-2 font-mono text-xl font-semibold tabular-nums sm:text-2xl">{sales ? sales.loose_garments.toLocaleString("es-AR") : <Skeleton className="mt-2 h-7 w-16" />}</dd>
              </div>
            </dl>
          </section>

          <div aria-label="Detalle de métricas" className="mt-7" id="metrics-detail">
            <section aria-labelledby="metrics-attributes-heading" aria-busy={!sales} className="mb-5">
              <h2 className="text-lg font-semibold" id="metrics-attributes-heading">Lo más vendido por atributo</h2>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">Según el período y los filtros seleccionados. Telas, cuellos y moldes cuentan prendas: cada parte del conjunto por separado. Los tipos de producto cuentan unidades vendidas, sin sumar categorías.</p>
              {!sales ? <MetricsLoading /> : !rankings ? <p className="text-sm text-muted-foreground">El ranking requiere actualizar la base de datos de métricas.</p> : (
                <div className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {([
                    ["fabric", "Telas más vendidas"], ["neckline", "Cuellos más vendidos"],
                    ["upper_pattern", "Moldes superiores más vendidos"], ["lower_pattern", "Moldes inferiores más vendidos"],
                    ["product_type", "Ventas por tipo de producto"],
                  ] as const).map(([kind, title]) => (
                    <section aria-label={title} className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-sm" key={kind}>
                      <h3 className="text-sm font-semibold">{title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{kind === "product_type" ? "Unidades por categoría" : "Prendas vendidas"}</p>
                      {rankings[kind].length ? (
                        <ol className="mt-3 max-h-80 overflow-auto divide-y divide-border">
                          {rankings[kind].map((item) => <li className="flex items-center justify-between gap-3 py-3 text-sm" key={item.id}>
                            <span className="min-w-0 break-words">{item.name}</span>
                            <span className="shrink-0 font-mono tabular-nums">{item.quantity.toLocaleString("es-AR")}</span>
                          </li>)}
                        </ol>
                      ) : <p className="mt-3 text-sm text-muted-foreground">No hay ventas con este atributo registrado.</p>}
                    </section>
                  ))}
                </div>
              )}
            </section>
            <div className="grid min-w-0 gap-5 xl:grid-cols-2">
              <MetricsPanel busy={!dashboard} description="Total del período · no afectado por filtros de catálogo. El saldo neto no representa la ganancia." number="01" title="Caja del período">
                {dashboard ? <MetricsCashChart series={dashboard.cash.daily_series} /> : <MetricsLoading />}
              </MetricsPanel>

              <MetricsPanel busy={!sales} description="Prendas sueltas y conjuntos vendidos por día." number="02" title="Ventas por categoría">
                {sales ? <MetricsSalesChart dailySeries={sales.daily_series} /> : <MetricsLoading />}
              </MetricsPanel>
            </div>

            <div className="mt-5 grid min-w-0 items-start gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <MetricsPanel busy={!sales} description="Comunes frente a premium" number="03" title="Conjuntos vendidos">
                {sales ? <MetricsSetsChart sets={sales.sets} /> : <MetricsLoading />}
              </MetricsPanel>

              <MetricsPanel busy={!sales} description="Hasta 6 productos por unidades pagadas" number="04" title="Productos vendidos">
                {sales ? <MetricsProductChart products={sales.products} /> : <MetricsLoading />}
              </MetricsPanel>
            </div>

            <div className="mt-5 grid min-w-0 items-start gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <MetricsPanel busy={!dashboard} description="Total del período · no afectado por filtros de catálogo." number="05" title="Incidencias">
                {dashboard ? <>
                  <dl className="mb-5 border-b border-border pb-4">
                    <dt className="text-xs text-muted-foreground">Total</dt>
                    <dd className="mt-1 font-mono text-2xl font-medium tabular-nums">{dashboard.incidents.total.toLocaleString("es-AR")}</dd>
                  </dl>
                  <MetricsIncidentChart
                    internal={dashboard.incidents.internal}
                    returns={dashboard.incidents.returns}
                    total={dashboard.incidents.total}
                    withoutReturn={dashboard.incidents.without_return}
                  />
                </> : <MetricsLoading />}
              </MetricsPanel>

              <MetricsPanel busy={!dashboard} description="Elegí el tipo de incidencia · total del período." number="06" title="Motivos de incidencias">
                {dashboard ? <>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
                    <dl>
                      <dt className="text-xs text-muted-foreground">{selectedIncidentLabel}</dt>
                      <dd className="mt-1 font-mono text-2xl font-medium tabular-nums">{selectedIncidentCount.toLocaleString("es-AR")}</dd>
                    </dl>
                    <Select onValueChange={(value) => setIncidentKind(value as IncidentKind)} value={incidentKind}>
                      <SelectTrigger aria-label="Tipo de incidencia" className="w-full sm:w-52"><SelectValue /></SelectTrigger>
                      <SelectContent className={selectContentMotionClass}>
                        <SelectGroup>{incidentKindOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">Motivos</p>
                  <MetricsReasonChart kinds={selectedReasonKinds} reasons={selectedIncidentReasons} />
                </> : <MetricsLoading />}
              </MetricsPanel>
            </div>

            <section aria-labelledby="metrics-products-query-heading" aria-busy={!sales} className="mt-7 min-w-0 rounded-xl border border-border bg-card p-5 shadow-sm">
              <header className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Table2 aria-hidden="true" className="size-5" /></span>
                <div>
                  <h2 className="text-lg font-semibold" id="metrics-products-query-heading">Consulta de productos</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Detalle completo para el período y los filtros seleccionados.</p>
                </div>
              </header>
              {!sales ? <MetricsLoading /> : sales.products.length ? (
                <details className="group mt-4 border-t border-border pt-3 [interpolate-size:allow-keywords] [&::details-content]:h-0 [&::details-content]:overflow-clip [&::details-content]:opacity-0 [&::details-content]:[transition:height_200ms_ease,opacity_200ms_ease,content-visibility_200ms_allow-discrete] [&[open]::details-content]:h-auto [&[open]::details-content]:opacity-100 motion-reduce:[&::details-content]:transition-none">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-medium text-primary transition-colors duration-150 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
                    <span>Consultar productos ({sales.products.length.toLocaleString("es-AR")})</span>
                    <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
                  </summary>
                  <p className="my-3 text-xs leading-relaxed text-muted-foreground">Solo se incluyen productos activos del catálogo; los desactivados no están disponibles para este ranking ni como filtros.</p>
                  <div className="max-h-96 overflow-auto rounded-lg border border-border">
                    <Table aria-label="Ranking de productos vendidos">
                      <TableHeader className="sticky top-0 bg-muted">
                        <TableRow><TableHead>Producto</TableHead><TableHead className="hidden sm:table-cell">Tipo</TableHead><TableHead className="text-right">Unidades</TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {sales.products.map((product) => (
                          <TableRow key={product.id}>
                            <TableCell className="min-w-44 font-medium">{product.name}</TableCell>
                            <TableCell className="hidden text-muted-foreground sm:table-cell">{productLabel(product)}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{product.quantity.toLocaleString("es-AR")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </details>
              ) : <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">No hay productos para los filtros elegidos.</p>}
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
