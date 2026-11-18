// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { MetricsCacheProvider, useMetricsCache } from "./metrics-cache-provider";
import { MetricsDashboard } from "./metrics-dashboard";

const mocks = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getSales: vi.fn(),
  getSummary: vi.fn(),
  getFilterOptions: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  listener: null as null | ((event: string, session: unknown) => void),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({ auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange } }),
}));
vi.mock("../actions", () => ({
  getMetricsDashboardAction: mocks.getDashboard,
  getMetricsSalesAction: mocks.getSales,
  getMetricsSummaryAction: mocks.getSummary,
  getMetricsFilterOptionsAction: mocks.getFilterOptions,
}));

const profileId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const baseDashboard = {
  generated_at: "2026-11-07T12:00:00.000Z",
  period: { from: "2026-11-01", to: "2026-11-07" },
  cash: { income: "12.34", expense: "3.21", net: "9.13", daily_series: [{ date: "2026-11-07", income: "12.34", expense: "3.21" }] },
  incidents: { total: 2, returns: 1, internal: 0, without_return: 1, reasons: [{ code: "sewing", label: "Falla de costura", internal: 0, without_return: 1, returns: 1 }] },
  sales: {
    products: [{ id: productId, name: "Remera", kind: "garment", garment_layer: "upper", quantity: 3 }],
    loose_garments: 3,
    sets: { common: 0, premium: 0 },
    daily_series: [{ date: "2026-11-07", loose_garments: 3, sets: { common: 0, premium: 0 } }],
  },
  filters: {
    products: [{ id: productId, name: "Remera", kind: "garment", garment_layer: "upper" }],
    fabrics: [], necklines: [], upper_patterns: [], lower_patterns: [],
  },
};
const baseSummary = {
  generated_at: baseDashboard.generated_at,
  period: baseDashboard.period,
  cash: { income: baseDashboard.cash.income, expense: baseDashboard.cash.expense, net: baseDashboard.cash.net },
  loose_garments: baseDashboard.sales.loose_garments,
};

function session(sessionId: string) {
  return {
    access_token: `header.${btoa(JSON.stringify({ session_id: sessionId }))}.signature`,
    user: { id: profileId },
  };
}

function RouteHarness() {
  const { setFilters } = useMetricsCache();
  const [mounted, setMounted] = useState(true);

  return (
    <>
      <button onClick={() => setFilters((current) => current && { ...current, productType: "set" })} type="button">Filtro conjunto</button>
      <button onClick={() => setFilters((current) => current && { ...current, productType: "flag" })} type="button">Otro filtro</button>
      <button onClick={() => setFilters((current) => current && { ...current, productId })} type="button">Filtro producto</button>
      <button onClick={() => setFilters((current) => current && { ...current, from: "2026-10-31" })} type="button">Cambiar fecha</button>
      <button onClick={() => setMounted((current) => !current)} type="button">Alternar ruta</button>
      {mounted ? <MetricsDashboard /> : null}
    </>
  );
}

function renderRoute() {
  return render(<MetricsCacheProvider profileId={profileId}><RouteHarness /></MetricsCacheProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listener = null;
  mocks.getSession.mockResolvedValue({ data: { session: session("session-one") } });
  mocks.onAuthStateChange.mockImplementation((listener: (event: string, session: unknown) => void) => {
    mocks.listener = listener;
    listener("INITIAL_SESSION", session("session-one"));
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  mocks.getDashboard.mockResolvedValue(baseDashboard);
  mocks.getSummary.mockResolvedValue(baseSummary);
  mocks.getFilterOptions.mockResolvedValue(baseDashboard.filters);
  mocks.getSales.mockResolvedValue({
    products: [],
    loose_garments: 0,
    sets: { common: 2, premium: 0 },
    daily_series: [{ date: "2026-11-07", loose_garments: 0, sets: { common: 2, premium: 0 } }],
  });
});

afterEach(cleanup);

describe("metrics session cache integration", () => {
  it("loads catalog options on demand and waits for Consultar before querying metrics", async () => {
    renderRoute();
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledOnce());
    expect(mocks.getSummary).not.toHaveBeenCalled();
    expect(mocks.getDashboard).not.toHaveBeenCalled();
    expect(mocks.getSales).not.toHaveBeenCalled();

    const toggle = screen.getByRole("button", { name: "Filtros" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(await screen.findByRole("combobox", { name: "Producto o prenda" })).toBeTruthy();
    expect(mocks.getFilterOptions).toHaveBeenCalledOnce();
    expect((screen.getByRole("combobox", { name: "Producto o prenda" }) as HTMLButtonElement).disabled).toBe(false);

    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    fireEvent.click(screen.getByRole("combobox", { name: "Producto o prenda" }));
    fireEvent.click(await screen.findByRole("option", { name: "Remera" }));
    expect(screen.getByRole("combobox", { name: "Producto o prenda" }).textContent).toContain("Remera");
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    expect(mocks.getFilterOptions).toHaveBeenCalledOnce();
    expect(mocks.getDashboard).not.toHaveBeenCalled();
    expect(mocks.getSales).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    await screen.findByRole("region", { name: "Caja del período" });
    expect(mocks.getDashboard).toHaveBeenCalledOnce();
    expect(mocks.getSales).toHaveBeenCalledOnce();
    expect(mocks.getSummary).not.toHaveBeenCalled();
    expect(mocks.getFilterOptions).toHaveBeenCalledOnce();
  });

  it("automatically filters sales while reusing period-wide cash and incident data", async () => {
    renderRoute();
    fireEvent.click(await screen.findByRole("button", { name: "Consultar" }));
    await screen.findByRole("region", { name: "Caja del período" });
    expect(screen.getByText("$ 12,34", { selector: "dd" })).toBeTruthy();
    expect(screen.getAllByText(/Total del período · no afectado por filtros de catálogo/).length).toBeGreaterThan(0);

    mocks.getSales.mockResolvedValueOnce({
      products: [], loose_garments: 7, sets: { common: 2, premium: 0 },
      daily_series: [{ date: "2026-11-07", loose_garments: 7, sets: { common: 2, premium: 0 } }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Filtro conjunto" }));
    await waitFor(() => expect(mocks.getSales).toHaveBeenCalledOnce());
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Resumen del período" })).getByText("7", { selector: "dd" })).toBeTruthy());
    expect(screen.getByText("$ 12,34", { selector: "dd" })).toBeTruthy();
    const incidents = screen.getByRole("region", { name: "Incidencias" });
    expect(within(incidents).getByText("Total del período · no afectado por filtros de catálogo", { exact: false })).toBeTruthy();
    expect(within(incidents).getByText("2", { selector: "dd" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Motivos de incidencias" })).getByText("2", { selector: "dd" })).toBeTruthy();
    expect(mocks.getDashboard).toHaveBeenCalledOnce();
    expect(mocks.getSummary).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Alternar ruta" }));
    fireEvent.click(screen.getByRole("button", { name: "Alternar ruta" }));
    expect(await screen.findByText("$ 12,34", { selector: "dd" })).toBeTruthy();
    expect(mocks.getDashboard).toHaveBeenCalledOnce();
    expect(mocks.getSales).toHaveBeenCalledOnce();
  });

  it("groups rapid filter changes and reuses results when returning to a cached combination", async () => {
    renderRoute();
    fireEvent.click(await screen.findByRole("button", { name: "Consultar" }));
    await screen.findByRole("region", { name: "Caja del período" });

    mocks.getSales
      .mockResolvedValueOnce({ ...baseDashboard.sales, loose_garments: 5 })
      .mockResolvedValueOnce({ ...baseDashboard.sales, loose_garments: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Filtro conjunto" }));
    fireEvent.click(screen.getByRole("button", { name: "Otro filtro" }));
    await waitFor(() => expect(mocks.getSales).toHaveBeenCalledOnce());
    expect(mocks.getSales.mock.calls[0]?.[0].productType).toBe("flag");
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Resumen del período" })).getByText("5", { selector: "dd" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Filtro conjunto" }));
    await waitFor(() => expect(mocks.getSales).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Resumen del período" })).getByText("3", { selector: "dd" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Otro filtro" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Ventas por categoría" })).toBeTruthy());
    expect(within(screen.getByRole("region", { name: "Resumen del período" })).getByText("5", { selector: "dd" })).toBeTruthy();
    expect(mocks.getSales).toHaveBeenCalledTimes(2);
    expect(mocks.getDashboard).toHaveBeenCalledOnce();
  });

  it("forces fresh period and filtered sales requests when Actualizar is pressed", async () => {
    renderRoute();
    fireEvent.click(await screen.findByRole("button", { name: "Consultar" }));
    await screen.findByRole("region", { name: "Caja del período" });
    fireEvent.click(screen.getByRole("button", { name: "Filtro conjunto" }));
    await waitFor(() => expect(mocks.getSales).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => expect(mocks.getDashboard).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.getSales).toHaveBeenCalledTimes(2));
  });

  it("does not let an older filtered response replace the latest selection", async () => {
    let resolveSet!: (value: typeof baseDashboard.sales) => void;
    let resolveFlag!: (value: typeof baseDashboard.sales) => void;
    mocks.getSales
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSet = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFlag = resolve; }));

    renderRoute();
    fireEvent.click(await screen.findByRole("button", { name: "Consultar" }));
    await screen.findByRole("region", { name: "Caja del período" });
    fireEvent.click(screen.getByRole("button", { name: "Filtro conjunto" }));
    await waitFor(() => expect(mocks.getSales).toHaveBeenCalledOnce(), { timeout: 1000 });
    expect(screen.getByRole("region", { name: "Ventas por categoría" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("region", { name: "Caja del período" }).getAttribute("aria-busy")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Otro filtro" }));
    await waitFor(() => expect(mocks.getSales).toHaveBeenCalledTimes(2), { timeout: 1000 });

    await act(async () => { resolveFlag({ ...baseDashboard.sales, loose_garments: 9 }); });
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Resumen del período" })).getByText("9", { selector: "dd" })).toBeTruthy());
    await act(async () => { resolveSet({ ...baseDashboard.sales, loose_garments: 1 }); });
    expect(within(screen.getByRole("region", { name: "Resumen del período" })).getByText("9", { selector: "dd" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Resumen del período" })).queryByText("1", { selector: "dd" })).toBeNull();
  });

  it("rejects a late metrics response after same-user relogin and requires a new consultation", async () => {
    let resolveOld!: (value: typeof baseDashboard) => void;
    let resolveNew!: (value: typeof baseDashboard) => void;
    mocks.getDashboard
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }))
      .mockResolvedValue(baseDashboard);

    const view = renderRoute();
    fireEvent.click(await screen.findByRole("button", { name: "Filtros" }));
    await waitFor(() => expect(mocks.getFilterOptions).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(await screen.findByRole("button", { name: "Consultar" }));
    await waitFor(() => expect(mocks.getDashboard).toHaveBeenCalledOnce());
    await act(async () => { mocks.listener?.("SIGNED_OUT", null); });
    await act(async () => { mocks.listener?.("SIGNED_IN", session("session-two")); });
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    await waitFor(() => expect(mocks.getFilterOptions).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("button", { name: "Consultar" }));
    await waitFor(() => expect(mocks.getDashboard).toHaveBeenCalledTimes(2));

    resolveOld({ ...baseDashboard, cash: { ...baseDashboard.cash, income: "1.00", expense: "0", net: "1.00" } });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText("$ 1,00", { selector: "dd" })).toBeNull();

    resolveNew({ ...baseDashboard, cash: { ...baseDashboard.cash, income: "22.00", expense: "0", net: "22.00" } });
    expect((await screen.findAllByText(/22,00/)).length).toBeGreaterThan(0);

    view.unmount();
    renderRoute();
    await screen.findByRole("button", { name: "Consultar" });
    expect(mocks.getDashboard).toHaveBeenCalledTimes(2);
  });
});
