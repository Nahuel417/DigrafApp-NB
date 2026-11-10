// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MetricsDashboard } from "./metrics-dashboard";

const mocks = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getSummary: vi.fn(),
  cache: { get: vi.fn((_key: string, load: () => Promise<unknown>, _options?: { refresh?: boolean }) => load()), peek: vi.fn(() => undefined) },
  salesCache: { get: vi.fn((_key: string, load: () => Promise<unknown>, _options?: { refresh?: boolean }) => load()), peek: vi.fn(() => undefined) },
  summaryCache: { get: vi.fn((_key: string, load: () => Promise<unknown>, _options?: { refresh?: boolean }) => load()), peek: vi.fn(() => undefined) },
  getSales: vi.fn(),
  initializeFilters: vi.fn(),
  setFilters: vi.fn(),
  setPeriod: vi.fn(),
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

vi.mock("../actions", () => ({ getMetricsDashboardAction: mocks.getDashboard, getMetricsSalesAction: mocks.getSales, getMetricsSummaryAction: mocks.getSummary }));
vi.mock("./metrics-cache-provider", () => ({
  useMetricsCache: () => ({
    cache: mocks.cache,
    salesCache: mocks.salesCache,
    summaryCache: mocks.summaryCache,
    ready: mocks.ready,
    scope: "profile:session",
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
    total: 2,
    returns: 1,
    reasons: [{ code: "sewing", label: "Falla de costura", count: 1 }],
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
  mocks.filters = filters;
  mocks.getDashboard.mockClear();
  mocks.getSummary.mockClear();
  mocks.getSales.mockClear();
  mocks.getDashboard.mockResolvedValue(metrics);
  mocks.getSummary.mockResolvedValue(summary);
  mocks.cache.get.mockClear();
  mocks.salesCache.get.mockClear();
  mocks.summaryCache.get.mockClear();
  mocks.summaryCache.peek.mockReturnValue(undefined);
  mocks.cache.peek.mockReturnValue(undefined);
  mocks.salesCache.peek.mockReturnValue(undefined);
  mocks.initializeFilters.mockClear();
  mocks.setFilters.mockClear();
  mocks.setPeriod.mockClear();
});

afterEach(cleanup);

describe("MetricsDashboard", () => {
  it("loads only the summary first and fetches detail only after the user requests it", async () => {
    render(<MetricsDashboard />);

    expect(await screen.findByRole("heading", { name: "Métricas" })).toBeTruthy();
    expect(await screen.findByText("$ 12,34", { selector: "dd" })).toBeTruthy();
    const headlines = within(screen.getByRole("region", { name: "Resumen del período" }));
    expect(headlines.getByText("Ingresos", { selector: "dt" }).nextElementSibling?.textContent).toBe("$ 12,34");
    expect(headlines.getByText("Egresos", { selector: "dt" }).nextElementSibling?.textContent).toBe("$ 3,21");
    expect(headlines.getByText("Saldo neto", { selector: "dt" }).nextElementSibling?.textContent).toBe("$ 9,13");
    expect(headlines.getByText("Prendas sueltas", { selector: "dt" }).nextElementSibling?.textContent).toBe("3");
    expect(headlines.getByText("Ingresos", { selector: "dt" }).className).toContain("text-success-foreground");
    expect(headlines.getByText("Ingresos", { selector: "dt" }).nextElementSibling?.className).toContain("text-success-foreground");
    expect(headlines.getByText("Egresos", { selector: "dt" }).className).toContain("text-error");
    expect(headlines.getByText("Egresos", { selector: "dt" }).nextElementSibling?.className).toContain("text-error");
    expect(headlines.queryByText("Conjuntos comunes", { selector: "dt" })).toBeNull();
    expect(headlines.queryByText("Conjuntos premium", { selector: "dt" })).toBeNull();
    expect(headlines.queryByText("Incidencias", { selector: "dt" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Caja del período" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Ranking de productos" })).toBeNull();
    expect(screen.queryByText(/Los datos históricos pueden estar incompletos/)).toBeNull();
    expect(screen.getByRole("button", { name: "Ver detalle" })).toBeTruthy();
    expect(mocks.getSummary).toHaveBeenCalledOnce();
    expect(mocks.getSummary).toHaveBeenCalledWith(mocks.filters);
    expect(mocks.getDashboard).not.toHaveBeenCalled();
    expect(mocks.getSales).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    expect(await screen.findByText("Consultá el detalle para filtrar por catálogo.")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Producto o prenda" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("combobox", { name: "Tipo de producto" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));

    fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));
    expect(await screen.findByRole("region", { name: "Caja del período" })).toBeTruthy();
    const setCounts = within(await screen.findByRole("list", { name: "Conjuntos vendidos por tipo" })).getAllByRole("listitem");
    expect(setCounts[0]?.textContent?.replace(/\s/g, "")).toContain("Comunes:2");
    expect(setCounts[1]?.textContent?.replace(/\s/g, "")).toContain("Premium:1");
    expect(screen.getByText("Incidencias", { selector: "dt" }).nextElementSibling?.textContent).toBe("2");
    expect(screen.getByText("Devoluciones de productos", { selector: "dt" }).nextElementSibling?.textContent).toBe("1");
    const productChart = screen.getByRole("group", { name: "Unidades vendidas por producto" });
    expect(within(productChart).getByText("Remera")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Ventas diarias por categoría" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Ingresos y egresos diarios" })).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Incidencias por motivo" })).getByText("Falla de costura")).toBeTruthy();
    expect(screen.getByText(/Solo se incluyen productos activos/)).toBeTruthy();
    expect(mocks.getDashboard).toHaveBeenCalledTimes(1);
    expect(mocks.getDashboard).toHaveBeenCalledWith({ ...mocks.filters, productId: null, fabricId: null, necklineId: null, upperPatternId: null, lowerPatternId: null, productType: null });

    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(mocks.getDashboard).toHaveBeenCalledTimes(2));
    expect(mocks.getSummary).toHaveBeenCalledTimes(2);
    expect(mocks.cache.get.mock.calls.at(-1)?.[2]).toEqual({ refresh: true });
    expect(mocks.summaryCache.get.mock.calls.at(-1)?.[2]).toEqual({ refresh: true });
  });

  it("toggles catalog filters without loading data and keeps closed fields out of the accessibility tree", async () => {
    render(<MetricsDashboard />);
    await screen.findByRole("heading", { name: "Métricas" });

    const toggle = screen.getByRole("button", { name: "Filtros" });
    const catalogPanel = document.getElementById("metrics-catalog-filters");
    const productFilter = screen.getByLabelText("Producto o prenda");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(catalogPanel?.getAttribute("aria-hidden")).toBe("true");
    expect(catalogPanel?.hasAttribute("inert")).toBe(true);
    expect(productFilter.closest("#metrics-catalog-filters")).toBe(catalogPanel);
    const clearButton = screen.getByRole("button", { name: "Limpiar filtros" });
    expect((clearButton as HTMLButtonElement).disabled).toBe(true);
    expect(clearButton.getAttribute("title")).toBe("Limpiar filtros");
    const dashboardCalls = mocks.getDashboard.mock.calls.length;
    const summaryCalls = mocks.getSummary.mock.calls.length;
    const salesCalls = mocks.getSales.mock.calls.length;

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Producto o prenda")).toBeTruthy();
    for (const label of ["Tela", "Cuello", "Molde superior", "Molde inferior", "Tipo de producto"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(catalogPanel?.getAttribute("aria-hidden")).toBe("false");
    expect(catalogPanel?.hasAttribute("inert")).toBe(false);
    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(catalogPanel?.getAttribute("aria-hidden")).toBe("true");
    expect(catalogPanel?.hasAttribute("inert")).toBe(true);
    expect(mocks.getDashboard).toHaveBeenCalledTimes(dashboardCalls);
    expect(mocks.getSummary).toHaveBeenCalledTimes(summaryCalls);
    expect(mocks.getSales).toHaveBeenCalledTimes(salesCalls);
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
    mocks.getSales.mockResolvedValue(metrics.sales);
    render(<MetricsDashboard />);
    await screen.findByRole("heading", { name: "Métricas" });

    const clearButton = screen.getByRole("button", { name: "Limpiar filtros" });
    expect((clearButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(clearButton);

    const updateFilters = mocks.setFilters.mock.calls.at(-1)?.[0];
    expect(typeof updateFilters).toBe("function");
    if (typeof updateFilters !== "function") throw new Error("Expected a catalog filter update.");
    expect(updateFilters(activeFilters)).toEqual({
      ...activeFilters,
      productId: null,
      fabricId: null,
      necklineId: null,
      upperPatternId: null,
      lowerPatternId: null,
      productType: null,
    });
    expect(mocks.setPeriod).not.toHaveBeenCalled();
  });

  it("shows a recoverable error when loading metrics fails", async () => {
    mocks.getSummary.mockRejectedValueOnce(new Error("No se pudieron cargar las métricas. Intentá nuevamente."));

    render(<MetricsDashboard />);

    expect((await screen.findByRole("alert")).textContent).toContain("No se pudieron cargar las métricas. Intentá nuevamente.");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });

  it("keeps the valid summary visible when deferred detail fails", async () => {
    mocks.getDashboard.mockRejectedValueOnce(new Error("No se pudieron cargar las métricas. Intentá nuevamente."));

    render(<MetricsDashboard />);
    expect(await screen.findByText("$ 12,34", { selector: "dd" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("$ 12,34", { selector: "dd" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar detalle" })).toBeTruthy();
  });

  it("refreshes a summary without requesting detail unless detail was requested", async () => {
    render(<MetricsDashboard />);
    await screen.findByText("$ 12,34", { selector: "dd" });

    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => expect(mocks.getSummary).toHaveBeenCalledTimes(2));
    expect(mocks.getDashboard).not.toHaveBeenCalled();
    expect(mocks.getSales).not.toHaveBeenCalled();
  });

  it("keeps the empty product state and avoids drawing a zero-total set donut", async () => {
    mocks.getDashboard.mockResolvedValueOnce({
      ...metrics,
      sales: { products: [], loose_garments: 0, sets: { common: 0, premium: 0 }, daily_series: [{ date: "2026-11-07", loose_garments: 0, sets: { common: 0, premium: 0 } }] },
    });
    mocks.getDashboard.mockClear();

    render(<MetricsDashboard />);

    await screen.findByText("$ 12,34", { selector: "dd" });
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));
    expect(await screen.findByText("No hay productos para los filtros elegidos.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Unidades vendidas por producto" })).toBeNull();
    expect(screen.getByText("No hay conjuntos vendidos en el período.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Proporción de conjuntos vendidos" })).toBeNull();
    expect(mocks.getDashboard).toHaveBeenCalledTimes(1);
  });

  it("does not show a previous session result while new filters are loading", async () => {
    let resolveNext!: (value: typeof summary) => void;
    const view = render(<MetricsDashboard />);
    expect(await screen.findByText("$ 12,34", { selector: "dd" })).toBeTruthy();

    mocks.getSummary.mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
    mocks.filters = { ...filters, from: "2026-10-31" };
    view.rerender(<MetricsDashboard />);

    expect(screen.queryByText("$ 12,34", { selector: "dd" })).toBeNull();
    resolveNext({ ...summary, period: { from: "2026-10-31", to: summary.period.to } });
    await waitFor(() => expect(screen.getByText("$ 12,34", { selector: "dd" })).toBeTruthy());
  });
});
