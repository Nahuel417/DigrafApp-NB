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
}));

const profileId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const baseDashboard = {
  generated_at: "2026-11-07T12:00:00.000Z",
  period: { from: "2026-11-01", to: "2026-11-07" },
  cash: { income: "12.34", expense: "3.21", net: "9.13", daily_series: [{ date: "2026-11-07", income: "12.34", expense: "3.21" }] },
  incidents: { total: 0, returns: 0, reasons: [] },
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
  mocks.getSales.mockResolvedValue({
    products: [],
    loose_garments: 0,
    sets: { common: 2, premium: 0 },
    daily_series: [{ date: "2026-11-07", loose_garments: 0, sets: { common: 2, premium: 0 } }],
  });
});

afterEach(cleanup);

describe("metrics session cache integration", () => {
  it("keeps filter disclosure local and clears only catalog filters without refetching cached periods", async () => {
    renderRoute();
    await screen.findByText("$ 12,34", { selector: "dd" });
    expect(mocks.getSummary).toHaveBeenCalledOnce();
    expect(mocks.getDashboard).not.toHaveBeenCalled();

    const toggle = screen.getByRole("button", { name: "Filtros" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(mocks.getSummary).toHaveBeenCalledOnce();
    expect(mocks.getSales).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }));
    await waitFor(() => expect(mocks.getSummary).toHaveBeenCalledTimes(2));
    const selectedFrom = screen.getByLabelText("Desde") as HTMLInputElement;
    const selectedTo = screen.getByLabelText("Hasta") as HTMLInputElement;
    expect(selectedFrom.value).toBe("2026-10-31");
    const preservedTo = selectedTo.value;

    fireEvent.click(screen.getByRole("button", { name: "Filtro conjunto" }));
    await waitFor(() => expect(mocks.getSummary).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    expect((screen.getByRole("button", { name: "Limpiar filtros" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Desde") as HTMLInputElement).value).toBe("2026-10-31");
    expect((screen.getByLabelText("Hasta") as HTMLInputElement).value).toBe(preservedTo);
    expect(mocks.getSummary).toHaveBeenCalledTimes(3);
    expect(mocks.getDashboard).not.toHaveBeenCalled();
    expect(mocks.getSales).not.toHaveBeenCalled();
  });

  it("loads summary first, then caches requested detail across filters and route remounts", async () => {
    renderRoute();
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledOnce());
    expect(await screen.findByText("$ 12,34", { selector: "dd" })).toBeTruthy();
    expect(mocks.getSummary).toHaveBeenCalledOnce();
    expect(mocks.getDashboard).not.toHaveBeenCalled();
    expect(mocks.getSales).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Filtro conjunto" }));
    await waitFor(() => expect(mocks.getSummary).toHaveBeenCalledTimes(2));
    expect(mocks.getDashboard).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Otro filtro" }));
    await waitFor(() => expect(mocks.getSummary).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole("button", { name: "Filtro conjunto" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Ver detalle" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));
    await waitFor(() => expect(mocks.getSales).toHaveBeenCalledOnce());
    const setCounts = within(await screen.findByRole("list", { name: "Conjuntos vendidos por tipo" })).getAllByRole("listitem");
    expect(setCounts[0]?.textContent?.replace(/\s/g, "")).toContain("Comunes:2");
    expect(mocks.getDashboard).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Alternar ruta" }));
    fireEvent.click(screen.getByRole("button", { name: "Alternar ruta" }));
    expect(await screen.findByText("$ 12,34", { selector: "dd" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Caja del período" })).toBeTruthy();
    expect(mocks.getDashboard).toHaveBeenCalledOnce();
    expect(mocks.getSales).toHaveBeenCalledOnce();
    expect(mocks.getSummary).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }));
    await waitFor(() => expect(mocks.getSummary).toHaveBeenCalledTimes(4));
    expect(mocks.getDashboard).toHaveBeenCalledOnce();
    expect(mocks.getSales).toHaveBeenCalledOnce();
    expect(screen.queryByRole("region", { name: "Caja del período" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));
    await waitFor(() => expect(mocks.getDashboard).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.getSales).toHaveBeenCalledTimes(2));
  });

  it("rejects a late summary response after same-user relogin and allows a fresh request", async () => {
    let resolveOld!: (value: typeof baseSummary) => void;
    let resolveNew!: (value: typeof baseSummary) => void;
    mocks.getSummary
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }))
      .mockResolvedValue(baseSummary);

    const view = renderRoute();
    await waitFor(() => expect(mocks.getSummary).toHaveBeenCalledOnce());
    await act(async () => { mocks.listener?.("SIGNED_OUT", null); });
    await act(async () => { mocks.listener?.("SIGNED_IN", session("session-two")); });
    await waitFor(() => expect(mocks.getSummary).toHaveBeenCalledTimes(2));

    resolveOld({ ...baseSummary, cash: { ...baseSummary.cash, income: "1.00", expense: "0", net: "1.00" } });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText("$ 1,00", { selector: "dd" })).toBeNull();

    resolveNew({ ...baseSummary, cash: { ...baseSummary.cash, income: "22.00", expense: "0", net: "22.00" } });
    expect((await screen.findAllByText(/22,00/)).length).toBeGreaterThan(0);

    view.unmount();
    renderRoute();
    await waitFor(() => expect(mocks.getSummary).toHaveBeenCalledTimes(3));
  });
});
