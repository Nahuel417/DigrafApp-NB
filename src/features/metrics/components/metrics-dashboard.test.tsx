// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MetricsDashboard } from "./metrics-dashboard";

const mocks = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getSummary: vi.fn(),
  getFilterOptions: vi.fn(),
  cache: { values: new Map<string, unknown>(), get: vi.fn(), peek: vi.fn() },
  salesCache: { values: new Map<string, unknown>(), get: vi.fn(), peek: vi.fn() },
  filterOptionsCache: { values: new Map<string, unknown>(), get: vi.fn(), peek: vi.fn() },
  getSales: vi.fn(),
  initializeFilters: vi.fn(),
  setFilters: vi.fn(),
  setPeriod: vi.fn(),
  hasQueried: false,
  markQueried: vi.fn(),
  ready: true,
  filters: null as null | {
    from: string;
    to: string;
    productId: string | null;
    fabricId: string | null;
    necklineId: string | null;
    upperPatternId: string | null;
    lowerPatternId: string | null;
    productType: "individual" | "set" | "premium_set" | "flag" | "bag" | "shield" | null;
  },
}));

vi.mock("../actions", () => ({ getMetricsDashboardAction: mocks.getDashboard, getMetricsFilterOptionsAction: mocks.getFilterOptions, getMetricsSalesAction: mocks.getSales, getMetricsSummaryAction: mocks.getSummary }));
vi.mock("./metrics-cache-provider", () => ({
  useMetricsCache: () => ({
    cache: mocks.cache,
    salesCache: mocks.salesCache,
    filterOptionsCache: mocks.filterOptionsCache,
    ready: mocks.ready,
    scope: "profile:session",
    hasQueried: mocks.hasQueried,
    markQueried: () => { mocks.hasQueried = true; mocks.markQueried(); },
    filters: mocks.filters,
    period: "last7",
    setFilters: mocks.setFilters,
    setPeriod: mocks.setPeriod,
    initializeFilters: mocks.initializeFilters,
  }),
}));

const metrics = {
  generated_at: "2026-11-07T12:00:00.000Z",
  period: { from: "2026-11-01", to: "2026-11-07" },
  cash: {
    income: "12.34",
    expense: "3.21",
    net: "9.13",
    daily_series: [{ date: "2026-11-07", income: "12.34", expense: "3.21" }],
  },
  incidents: {
    total: 4,
    returns: 1,
    internal: 1,
    without_return: 2,
    reasons: [
      { code: "sewing", label: "Falla de costura", internal: 1, without_return: 1, returns: 1 },
      { code: "design", label: "Diseño", internal: 0, without_return: 1, returns: 0 },
    ],
  },
  sales: {
    products: [{ id: "a0000000-0000-4000-8000-000000000001", name: "Remera", kind: "garment", garment_layer: "upper", quantity: 3 }],
    loose_garments: 3,
    sets: { common: 2, premium: 1 },
    daily_series: [{ date: "2026-11-07", loose_garments: 3, sets: { common: 2, premium: 1 } }],
  },
  filters: {
    products: [{ id: "a0000000-0000-4000-8000-000000000001", name: "Remera", kind: "garment", garment_layer: "upper" }],
    fabrics: [],
    necklines: [],
    upper_patterns: [],
    lower_patterns: [],
  },
};

const summary = {
  generated_at: "2026-11-07T12:00:00.000Z",
  period: { from: "2026-11-01", to: "2026-11-07" },
  cash: { income: "12.34", expense: "3.21", net: "9.13" },
  loose_garments: 3,
};

const filters = {
  from: "2026-11-01",
  to: "2026-11-07",
  productId: null,
  fabricId: null,
  necklineId: null,
  upperPatternId: null,
  lowerPatternId: null,
  productType: null,
};

beforeEach(() => {
  mocks.ready = true;
  mocks.hasQueried = false;
  mocks.filters = filters;
  mocks.getDashboard.mockClear();
  mocks.getSummary.mockClear();
  mocks.getFilterOptions.mockReset().mockResolvedValue(metrics.filters);
  mocks.getSales.mockClear();
  mocks.getDashboard.mockResolvedValue(metrics);
  mocks.getSummary.mockResolvedValue(summary);
  for (const cache of [mocks.cache, mocks.salesCache, mocks.filterOptionsCache]) {
    cache.values.clear();
    cache.get.mockReset().mockImplementation(async (key: string, load: () => Promise<unknown>, options?: { refresh?: boolean }) => {
      if (!options?.refresh && cache.values.has(key)) return cache.values.get(key);
      const value = await load();
      cache.values.set(key, value);
      return value;
    });
    cache.peek.mockReset().mockImplementation((key: string) => cache.values.get(key));
  }
  mocks.markQueried.mockClear();
  mocks.initializeFilters.mockClear();
  mocks.setFilters.mockClear();
  mocks.setPeriod.mockClear();
});

afterEach(cleanup);

describe("MetricsDashboard", () => {
  it("shows ranked attribute quantities and separate product type units", async () => {
    mocks.getDashboard.mockResolvedValueOnce({ ...metrics, sales: { ...metrics.sales, rankings: {
      fabric: [{ id: "fabric", name: "Jersey", quantity: 14 }],
      neckline: [{ id: "neckline", name: "Redondo", quantity: 9 }],
      upper_pattern: [], lower_pattern: [],
      product_type: [{ id: "set", name: "Conjunto común", quantity: 7 }],
    } } });
    render(<MetricsDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Consultar" }));
    const fabrics = within(await screen.findByRole("region", { name: "Telas más vendidas" }));
    expect(fabrics.getByText("Jersey")).toBeTruthy();
    expect(fabrics.getByText("14")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Cuellos más vendidos" })).getByText("Redondo")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Ventas por tipo de producto" })).getByText("7")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Moldes superiores más vendidos" })).getByText("No hay ventas con este atributo registrado.")).toBeTruthy();
  });
  it("waits for Consultar and then renders the summary and complete metrics detail", async () => {
    render(<MetricsDashboard />);
    expect(await screen.findByRole("heading", { name: "Métricas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Consultar" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Resumen del período" })).toBeNull();
    expect(mocks.getDashboard).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    expect(await screen.findByRole("region", { name: "Caja del período" })).toBeTruthy();
    const headlines = within(screen.getByRole("region", { name: "Resumen del período" }));
    expect(headlines.getByText("Ingresos", { selector: "dt" }).nextElementSibling?.textContent).toBe("$ 12,34");
    expect(headlines.getByText("Egresos", { selector: "dt" }).nextElementSibling?.textContent).toBe("$ 3,21");
    expect(headlines.getByText("Saldo neto", { selector: "dt" }).nextElementSibling?.textContent).toBe("$ 9,13");
    expect(headlines.getByText("Prendas sueltas", { selector: "dt" }).nextElementSibling?.textContent).toBe("3");
    const incidents = within(screen.getByRole("region", { name: "Incidencias" }));
    expect(await incidents.findByText("Reclamo sin devolución:")).toBeTruthy();
    const incidentReasons = within(screen.getByRole("region", { name: "Motivos de incidencias" }));
    expect(incidentReasons.getByText("Todas las incidencias", { selector: "dt" })).toBeTruthy();
    expect(incidentReasons.getByText("4", { selector: "dd" })).toBeTruthy();
    expect(await screen.findByRole("group", { name: "Ventas diarias por categoría" })).toBeTruthy();
    expect(await screen.findByRole("group", { name: "Ingresos y egresos diarios" })).toBeTruthy();
    expect(mocks.getDashboard).toHaveBeenCalledOnce();
    expect(mocks.getDashboard).toHaveBeenCalledWith({ ...mocks.filters, productId: null, fabricId: null, necklineId: null, upperPatternId: null, lowerPatternId: null, productType: null });
    expect(mocks.getSummary).not.toHaveBeenCalled();
    expect(mocks.getSales).not.toHaveBeenCalled();
  });

  it("filters incident reasons by kind and updates the selected total", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    render(<MetricsDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Consultar" }));
    const panel = within(await screen.findByRole("region", { name: "Motivos de incidencias" }));
    expect((await panel.findByRole("group", { name: "Motivos por área" })).textContent).toContain("Diseño");

    fireEvent.keyDown(panel.getByRole("combobox", { name: "Tipo de incidencia" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Internas" }));

    await waitFor(() => expect(panel.getByText("1", { selector: "dd" })).toBeTruthy());
    const legend = within(panel.getByRole("list", { name: "Tipos de incidencia en el gráfico" }));
    expect(legend.getByText("Internas")).toBeTruthy();
    expect(legend.queryByText("Devolución")).toBeNull();
    const reasonsChart = within(await panel.findByRole("group", { name: "Motivos por área" }));
    expect(reasonsChart.getByText("Falla de costura")).toBeTruthy();
    expect(reasonsChart.queryByText("Diseño")).toBeNull();
  });

  it("keeps the all-incident default and an empty reason state when there are no incidents", async () => {
    mocks.getDashboard.mockResolvedValue({
      ...metrics,
      incidents: {
        ...metrics.incidents,
        total: 0,
        returns: 0,
        internal: 0,
        without_return: 0,
        reasons: metrics.incidents.reasons.map((reason) => ({ ...reason, internal: 0, without_return: 0, returns: 0 })),
      },
    });
    render(<MetricsDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Consultar" }));

    const panel = within(await screen.findByRole("region", { name: "Motivos de incidencias" }));
    expect(panel.getByText("Todas las incidencias", { selector: "dt" })).toBeTruthy();
    expect(panel.getByRole("combobox", { name: "Tipo de incidencia" }).textContent).toContain("Todas las incidencias");
    expect(await panel.findByText("No hay motivos de incidencias en el período.")).toBeTruthy();
    expect(panel.queryByRole("group", { name: "Motivos por área" })).toBeNull();
  });

  it("loads catalog options once when filters open and keeps fields accessible", async () => {
    render(<MetricsDashboard />);
    const toggle = await screen.findByRole("button", { name: "Filtros" });
    const catalogPanel = document.getElementById("metrics-catalog-filters");
    expect(catalogPanel?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(toggle);
    expect((await screen.findByRole("combobox", { name: "Producto o prenda" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("combobox", { name: "Tipo de producto" })).toBeTruthy();
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.getFilterOptions).toHaveBeenCalledOnce());
    expect(mocks.getDashboard).not.toHaveBeenCalled();
    expect(mocks.getSales).not.toHaveBeenCalled();
  });

  it("clears every catalog filter while preserving the selected date range", async () => {
    const activeFilters = {
      ...filters,
      from: "2026-10-29",
      to: "2026-11-05",
      productId: "a0000000-0000-4000-8000-000000000001",
      fabricId: "22222222-2222-4222-8222-222222222222",
      necklineId: "33333333-3333-4333-8333-333333333333",
      upperPatternId: "44444444-4444-4444-8444-444444444444",
      lowerPatternId: "55555555-5555-4555-8555-555555555555",
      productType: "set" as const,
    };
    mocks.filters = activeFilters;
    render(<MetricsDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Limpiar filtros" }));
    const updateFilters = mocks.setFilters.mock.calls.at(-1)?.[0];
    expect(typeof updateFilters).toBe("function");
    if (typeof updateFilters !== "function") throw new Error("Expected a catalog filter update.");
    expect(updateFilters(activeFilters)).toEqual({ ...activeFilters, productId: null, fabricId: null, necklineId: null, upperPatternId: null, lowerPatternId: null, productType: null });
    expect(mocks.setPeriod).not.toHaveBeenCalled();
  });

  it("shows a recoverable error and retries a failed first consultation", async () => {
    mocks.getDashboard.mockRejectedValueOnce(new Error("Request failed"));
    render(<MetricsDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Consultar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("No se pudieron cargar todos los datos de métricas.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("region", { name: "Caja del período" })).toBeTruthy();
    expect(mocks.getDashboard).toHaveBeenCalledTimes(2);
  });

  it("keeps period-wide data visible when a filtered sales request fails", async () => {
    mocks.filters = { ...filters, productId: "a0000000-0000-4000-8000-000000000001" };
    mocks.getSales.mockRejectedValue(new Error("Request failed"));
    render(<MetricsDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Consultar" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("$ 12,34", { selector: "dd" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Caja del período" }).getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("region", { name: "Ventas por categoría" }).getAttribute("aria-busy")).toBe("true");
    expect(mocks.getSales).toHaveBeenCalledOnce();
    expect(mocks.getSales).toHaveBeenCalledWith(mocks.filters);
  });

  it("keeps empty product and zero-set states after the first consultation", async () => {
    mocks.getDashboard.mockResolvedValueOnce({
      ...metrics,
      sales: { products: [], loose_garments: 0, sets: { common: 0, premium: 0 }, daily_series: [{ date: "2026-11-07", loose_garments: 0, sets: { common: 0, premium: 0 } }] },
    });
    render(<MetricsDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Consultar" }));
    expect(await screen.findByText("No hay productos para los filtros elegidos.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Unidades vendidas por producto" })).toBeNull();
    expect(screen.getByText("No hay conjuntos vendidos en el período.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Proporción de conjuntos vendidos" })).toBeNull();
  });

  it("forces the cached range to refresh when Actualizar is clicked", async () => {
    render(<MetricsDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Consultar" }));
    await screen.findByRole("region", { name: "Caja del período" });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => expect(mocks.getDashboard).toHaveBeenCalledTimes(2));
    expect(mocks.cache.get.mock.calls.at(-1)?.[2]).toEqual({ refresh: true });
  });
});
