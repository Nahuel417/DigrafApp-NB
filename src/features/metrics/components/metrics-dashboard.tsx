"use client";

import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChartNoAxesCombined, ChevronDown, Filter, RefreshCw, RotateCcw, Shirt, Wallet } from "lucide-react";
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

import { getMetricsDashboardAction, getMetricsSalesAction, getMetricsSummaryAction } from "../actions";
import { type MetricsDashboard, type MetricsOption, type MetricsProduct, type MetricsSales, type MetricsSummary, metricsProductTypes } from "../contract";
import { normalizeMetricsFilters, resolveMetricsDateRange, type MetricsFilters, type MetricsPeriod } from "../filters";
import { useMetricsCache } from "./metrics-cache-provider";

const MetricsCashChart = dynamic(() => import("./metrics-charts").then((module) => module.MetricsCashChart));
const MetricsProductChart = dynamic(() => import("./metrics-charts").then((module) => module.MetricsProductChart));
const MetricsReasonChart = dynamic(() => import("./metrics-charts").then((module) => module.MetricsReasonChart));
const MetricsSalesChart = dynamic(() => import("./metrics-charts").then((module) => module.MetricsSalesChart));
const MetricsSetsChart = dynamic(() => import("./metrics-charts").then((module) => module.MetricsSetsChart));

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

function MetricsPanel({ number, title, description, children }: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const headingId = `metrics-panel-${number}-heading`;

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
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
  const { cache, salesCache, summaryCache, ready, scope, filters, period, setFilters, setPeriod, initializeFilters } = useMetricsCache();
  const [summarySnapshot, setSummarySnapshot] = useState<{ scope: string; filterKey: string; summary: MetricsSummary } | null>(null);
  const [detailSnapshot, setDetailSnapshot] = useState<{ scope: string; periodKey: string; filterKey: string; dashboard: MetricsDashboard; sales: MetricsSales } | null>(null);
  const [detailRequest, setDetailRequest] = useState<{ scope: string; filterKey: string } | null>(null);
  const [catalogFiltersOpen, setCatalogFiltersOpen] = useState(false);
  const [summaryError, setSummaryError] = useState<{ scope: string; filterKey: string } | null>(null);
  const [detailError, setDetailError] = useState<{ scope: string; periodKey: string; filterKey: string } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const summaryRequestVersion = useRef(0);
  const detailRequestVersion = useRef(0);

  const normalizedFilters = useMemo(() => filters ? normalizeMetricsFilters(filters) : null, [filters]);
  const requestKey = useMemo(() => normalizedFilters ? JSON.stringify(normalizedFilters) : null, [normalizedFilters]);
  const periodKey = useMemo(() => normalizedFilters ? JSON.stringify({ from: normalizedFilters.from, to: normalizedFilters.to }) : null, [normalizedFilters]);
  const hasCatalogFilters = Boolean(normalizedFilters && (
    normalizedFilters.productId !== null || normalizedFilters.fabricId !== null || normalizedFilters.necklineId !== null
    || normalizedFilters.upperPatternId !== null || normalizedFilters.lowerPatternId !== null || normalizedFilters.productType !== null
  ));
  const cachedDashboard = periodKey ? cache.peek(periodKey) : undefined;
  const cachedSales = requestKey ? salesCache.peek(requestKey) : undefined;
  const detailRequested = Boolean(scope && detailRequest?.scope === scope && detailRequest.filterKey === requestKey);
  const detailEnabled = Boolean(detailRequested || (cachedDashboard && (!hasCatalogFilters || cachedSales)));

  const loadSummary = useCallback(async (refresh = false) => {
    if (!ready || !scope || !normalizedFilters || !requestKey || !periodKey) return;
    const version = ++summaryRequestVersion.current;
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const dashboard = cache.peek(periodKey);
      const sales = hasCatalogFilters ? salesCache.peek(requestKey) : dashboard?.sales;
      if (!refresh && dashboard && sales) {
        const summary: MetricsSummary = {
          generated_at: dashboard.generated_at,
          period: dashboard.period,
          cash: { income: dashboard.cash.income, expense: dashboard.cash.expense, net: dashboard.cash.net },
          loose_garments: sales.loose_garments,
        };
        if (summaryRequestVersion.current === version) setSummarySnapshot({ scope, filterKey: requestKey, summary });
        return;
      }

      const summary = await summaryCache.get(requestKey, () => getMetricsSummaryAction(normalizedFilters), { refresh });
      if (summaryRequestVersion.current === version) setSummarySnapshot({ scope, filterKey: requestKey, summary });
    } catch {
      if (summaryRequestVersion.current === version) setSummaryError({ scope, filterKey: requestKey });
    } finally {
      if (summaryRequestVersion.current === version) setSummaryLoading(false);
    }
  }, [cache, hasCatalogFilters, normalizedFilters, periodKey, ready, requestKey, salesCache, scope, summaryCache]);

  const loadDetails = useCallback(async (refresh = false) => {
    if (!ready || !scope || !normalizedFilters || !requestKey || !periodKey) return;
    const version = ++detailRequestVersion.current;
    setDetailLoading(true);
    setDetailError(null);

    try {
      const aggregateFilters = { ...normalizedFilters, productId: null, fabricId: null, necklineId: null, upperPatternId: null, lowerPatternId: null, productType: null };
      const dashboard = await cache.get(periodKey, () => getMetricsDashboardAction(aggregateFilters), { refresh });
      const sales = await salesCache.get(requestKey, () => hasCatalogFilters
        ? getMetricsSalesAction(normalizedFilters)
        : Promise.resolve(dashboard.sales), { refresh });
      if (detailRequestVersion.current === version) setDetailSnapshot({ scope, periodKey, filterKey: requestKey, dashboard, sales });
    } catch {
      if (detailRequestVersion.current === version) setDetailError({ scope, periodKey, filterKey: requestKey });
    } finally {
      if (detailRequestVersion.current === version) setDetailLoading(false);
    }
  }, [cache, hasCatalogFilters, normalizedFilters, periodKey, ready, requestKey, salesCache, scope]);

  useEffect(() => {
    if (ready && !filters) initializeFilters();
  }, [ready, filters, initializeFilters]);

  useEffect(() => {
    if (!ready || !filters) {
      summaryRequestVersion.current += 1;
      detailRequestVersion.current += 1;
      setSummarySnapshot(null);
      setDetailSnapshot(null);
      setSummaryError(null);
      setDetailError(null);
      setSummaryLoading(false);
      setDetailLoading(false);
      return;
    }
    if (requestKey) void loadSummary();
  }, [filters, loadSummary, ready, requestKey]);

  useEffect(() => {
    if (detailEnabled && requestKey) void loadDetails();
  }, [detailEnabled, loadDetails, requestKey]);

  const summary = summarySnapshot?.scope === scope && summarySnapshot.filterKey === requestKey
    ? summarySnapshot.summary
    : requestKey ? summaryCache.peek(requestKey) : undefined;
  const dashboard = detailSnapshot?.scope === scope && detailSnapshot.periodKey === periodKey && detailSnapshot.filterKey === requestKey
    ? detailSnapshot.dashboard
    : cachedDashboard;
  const sales = detailSnapshot?.scope === scope && detailSnapshot.periodKey === periodKey && detailSnapshot.filterKey === requestKey
    ? detailSnapshot.sales
    : hasCatalogFilters ? cachedSales : dashboard?.sales;
  const metrics = dashboard && sales ? { ...dashboard, sales } : null;
  const productOptions = dashboard?.filters.products ?? [];
  const currentSummaryError = summaryError?.scope === scope && summaryError.filterKey === requestKey;
  const currentDetailError = detailError?.scope === scope && detailError.periodKey === periodKey && detailError.filterKey === requestKey;
  const loading = summaryLoading || detailLoading;

  function refreshMetrics() {
    if (detailEnabled) void Promise.all([loadSummary(true), loadDetails(true)]);
    else void loadSummary(true);
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
          {summary ? <p className="text-right text-xs text-muted-foreground">Consultado el <time dateTime={summary.generated_at}>{dateTimeFormatter.format(new Date(summary.generated_at))}</time></p> : null}
          <Button className="group" disabled={!ready || !filters || loading} onClick={refreshMetrics} type="button" variant="outline">
            <RefreshCw aria-hidden="true" className="transition-transform duration-200 group-hover:rotate-180 group-focus-visible:rotate-180 group-active:scale-90 motion-reduce:transition-none" data-icon="inline-start" />
            Actualizar
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
              <Button aria-controls="metrics-catalog-filters" aria-expanded={catalogFiltersOpen} className="group h-11 flex-1 rounded-xl px-3 sm:flex-none" onClick={() => setCatalogFiltersOpen((current) => !current)} type="button" variant="outline">
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
          <p className="mt-3 text-xs text-muted-foreground">Los filtros de catálogo afectan ventas; caja e incidencias usan solo el período.</p>
          <span className="sr-only" id="metrics-filters-heading">Filtros de catálogo</span>
          <div aria-hidden={!catalogFiltersOpen} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${catalogFiltersOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`} id="metrics-catalog-filters" inert={!catalogFiltersOpen}>
            <div className="min-h-0 overflow-hidden">
              <FieldGroup className="grid gap-4 pt-4 sm:grid-cols-2 xl:grid-cols-3">
                <FilterSelect disabled={!dashboard} id="metrics-product" label="Producto o prenda" options={productOptions} value={filters.productId} onChange={(value) => updateCatalogFilter("productId", value)} />
                <FilterSelect disabled={!dashboard} id="metrics-fabric" label="Tela" options={dashboard?.filters.fabrics ?? []} value={filters.fabricId} onChange={(value) => updateCatalogFilter("fabricId", value)} />
                <FilterSelect disabled={!dashboard} id="metrics-neckline" label="Cuello" options={dashboard?.filters.necklines ?? []} value={filters.necklineId} onChange={(value) => updateCatalogFilter("necklineId", value)} />
                <FilterSelect disabled={!dashboard} id="metrics-upper-pattern" label="Molde superior" options={dashboard?.filters.upper_patterns ?? []} value={filters.upperPatternId} onChange={(value) => updateCatalogFilter("upperPatternId", value)} />
                <FilterSelect disabled={!dashboard} id="metrics-lower-pattern" label="Molde inferior" options={dashboard?.filters.lower_patterns ?? []} value={filters.lowerPatternId} onChange={(value) => updateCatalogFilter("lowerPatternId", value)} />
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
              {!dashboard ? <p className="mt-3 text-xs text-muted-foreground">Consultá el detalle para filtrar por catálogo.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {!ready ? <p className="mt-5 text-sm text-muted-foreground" role="status">Validando la sesión...</p> : null}
      {currentSummaryError ? (
        <Alert className="mt-5" role="alert" variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>No se pudieron cargar las métricas. Intentá nuevamente.</span>
            <Button className="group" disabled={summaryLoading} onClick={() => void loadSummary(true)} size="sm" type="button" variant="outline">
              <RefreshCw aria-hidden="true" className="transition-transform duration-200 group-hover:rotate-180 group-focus-visible:rotate-180 group-active:scale-90 motion-reduce:transition-none" data-icon="inline-start" />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {!summary && !currentSummaryError ? <div className="mt-7"><MetricsLoading /></div> : null}
      {summary ? (
        <>
          <section aria-label="Resumen del período" className="mt-3 border-b border-border py-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
              <div className="min-w-0">
                <dt className="flex items-center gap-2 text-sm text-success-foreground"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-success"><ArrowDownLeft aria-hidden="true" className="size-4 text-success-foreground" /></span>Ingresos</dt>
                <dd className="mt-2 break-words font-mono text-xl font-semibold tabular-nums text-success-foreground sm:text-2xl">{formatArs(summary.cash.income)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-2 text-sm text-error"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-error/10"><ArrowUpRight aria-hidden="true" className="size-4 text-error" /></span>Egresos</dt>
                <dd className="mt-2 break-words font-mono text-xl font-semibold tabular-nums text-error sm:text-2xl">{formatArs(summary.cash.expense)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10"><Wallet aria-hidden="true" className="size-4 text-primary" /></span>Saldo neto</dt>
                <dd className="mt-2 break-words font-mono text-xl font-semibold tabular-nums sm:text-2xl">{formatArs(summary.cash.net)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-info"><Shirt aria-hidden="true" className="size-4 text-info-foreground" /></span>Prendas sueltas</dt>
                <dd className="mt-2 font-mono text-xl font-semibold tabular-nums sm:text-2xl">{summary.loose_garments.toLocaleString("es-AR")}</dd>
              </div>
            </dl>
          </section>

          {!detailEnabled ? (
            <div className="mt-5">
              <Button aria-controls="metrics-detail" aria-expanded="false" className="group" disabled={summaryLoading} onClick={() => scope && requestKey && setDetailRequest({ scope, filterKey: requestKey })} type="button" variant="outline">
                <ChartNoAxesCombined aria-hidden="true" className="transition-transform duration-150 group-hover:scale-110 group-focus-visible:scale-110 group-active:scale-95 motion-reduce:transform-none" data-icon="inline-start" />
                Ver detalle
              </Button>
            </div>
          ) : null}

          {currentDetailError ? (
            <Alert className="mt-5" role="alert" variant="destructive">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>No se pudo cargar el detalle. Intentá nuevamente.</span>
                <Button className="group" disabled={detailLoading} onClick={() => void loadDetails()} size="sm" type="button" variant="outline">
                  <RefreshCw aria-hidden="true" className="transition-transform duration-200 group-hover:rotate-180 group-focus-visible:rotate-180 group-active:scale-90 motion-reduce:transition-none" data-icon="inline-start" />
                  Reintentar detalle
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {detailEnabled && detailLoading && !metrics ? <p className="mt-5 text-sm text-muted-foreground" role="status">Cargando detalle...</p> : null}
          {detailEnabled && metrics ? (
          <div aria-label="Detalle de métricas" className="mt-7" id="metrics-detail">
          <div className="mt-7 grid min-w-0 gap-5 xl:grid-cols-2">
            <MetricsPanel description="El saldo neto de movimientos no representa la ganancia." number="01" title="Caja del período">
              <MetricsCashChart series={metrics.cash.daily_series} />
            </MetricsPanel>

            <MetricsPanel description="Prendas sueltas y conjuntos vendidos por día." number="02" title="Ventas por categoría">
              <MetricsSalesChart dailySeries={metrics.sales.daily_series} />
            </MetricsPanel>
          </div>

          <div className="mt-5 grid min-w-0 items-start gap-5 lg:grid-cols-2 xl:grid-cols-[0.8fr_1.25fr_1fr]">
            <MetricsPanel description="Comunes frente a premium" number="03" title="Conjuntos vendidos">
              <MetricsSetsChart sets={metrics.sales.sets} />
            </MetricsPanel>

            <MetricsPanel description="Ranking por unidades pagadas" number="04" title="Ranking de productos">
              <MetricsProductChart products={metrics.sales.products} />
              {metrics.sales.products.length ? (
                <details className="group mt-4 border-t border-border pt-3 [interpolate-size:allow-keywords] [&::details-content]:h-0 [&::details-content]:overflow-clip [&::details-content]:opacity-0 [&::details-content]:[transition:height_200ms_ease,opacity_200ms_ease,content-visibility_200ms_allow-discrete] [&[open]::details-content]:h-auto [&[open]::details-content]:opacity-100 motion-reduce:[&::details-content]:transition-none">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <span>{metrics.sales.products.length.toLocaleString("es-AR")} productos · Ver tabla</span>
                    <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
                  </summary>
                  <p className="my-3 text-xs leading-relaxed text-muted-foreground">Solo se incluyen productos activos del catálogo; los desactivados no están disponibles para este ranking ni como filtros.</p>
                  <div className="overflow-x-auto">
                  <Table aria-label="Ranking de productos vendidos">
                    <TableHeader>
                      <TableRow><TableHead>Producto</TableHead><TableHead className="hidden sm:table-cell">Tipo</TableHead><TableHead className="text-right">Unidades</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {metrics.sales.products.map((product) => (
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
            </MetricsPanel>

            <MetricsPanel description="Motivos de devolución registrados" number="05" title="Incidencias">
              <MetricsReasonChart reasons={metrics.incidents.reasons} />
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
                <div><dt className="text-xs text-muted-foreground">Incidencias</dt><dd className="mt-1 font-mono text-sm font-medium tabular-nums">{metrics.incidents.total.toLocaleString("es-AR")}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Devoluciones de productos</dt><dd className="mt-1 font-mono text-sm font-medium tabular-nums">{metrics.incidents.returns.toLocaleString("es-AR")}</dd></div>
              </dl>
            </MetricsPanel>
          </div>
          </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
