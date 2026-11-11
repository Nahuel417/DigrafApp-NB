// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MetricsCashChart, MetricsCharts, MetricsProductChart, MetricsReasonChart, MetricsSalesChart } from "./metrics-charts";

const dailySales = [
  { date: "2026-11-06", loose_garments: 3, sets: { common: 0, premium: 0 } },
  { date: "2026-11-07", loose_garments: 0, sets: { common: 2, premium: 1 } },
];

const cashSeries = [
  { date: "2026-11-06", income: "1200.50", expense: "0.00" },
  { date: "2026-11-07", income: "0.00", expense: "300.25" },
];

const reasons = [{ code: "sewing", label: "Falla de costura", count: 2 }];

const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
afterEach(() => {
  cleanup();
  if (originalScrollIntoView) Object.defineProperty(Element.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

describe("MetricsCharts", () => {
  it("charts only recorded return reasons without removing zero-count text alternatives", () => {
    render(<MetricsReasonChart reasons={[
      { code: "sewing", label: "Falla de costura", count: 0 },
      { code: "quality", label: "Problema en calidad", count: 1 },
    ]} />);
    const chart = within(screen.getByRole("group", { name: "Motivos de devolución" }));
    expect(chart.getByText("Problema en calidad")).toBeTruthy();
    expect(chart.queryByText("Falla de costura")).toBeNull();
    expect(within(screen.getByRole("list", { name: "Incidencias por motivo" })).getByText("Falla de costura")).toBeTruthy();
  });
  it("keeps month boundaries unambiguous and category totals separate", () => {
    render(<MetricsSalesChart dailySeries={[
      { date: "2026-10-31", loose_garments: 4, sets: { common: 2, premium: 0 } },
      { date: "2026-11-01", loose_garments: 5, sets: { common: 1, premium: 2 } },
    ]} />);
    const chart = within(screen.getByRole("group", { name: "Ventas diarias por categoría" }));
    expect(chart.getByText("31/10")).toBeTruthy();
    expect(chart.getByText("01/11")).toBeTruthy();
    for (const [label, total] of [["Prendas sueltas", "9"], ["Conjuntos comunes", "3"], ["Conjuntos premium", "2"]] as const) {
      expect(screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent).toBe(total);
    }
  });
  it("limits the ranking to six products and includes zero sales when selecting least sold", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    const products = Array.from({ length: 9 }, (_, index) => ({
      id: String(index), name: `Producto ${index}`, kind: "garment" as const,
      garment_layer: "upper" as const, quantity: index,
    }));
    render(<MetricsProductChart products={products} />);
    const ranking = screen.getByRole("table", { name: "Productos del ranking" });
    expect(within(ranking).getAllByRole("row")).toHaveLength(7);
    expect(within(ranking).getAllByRole("row")[1]?.textContent).toContain("Producto 8");
    expect(within(ranking).queryByText("Producto 0")).toBeNull();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Orden del ranking" }), { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "Menos vendidos" }), { key: "Enter" });
    await waitFor(() => expect(within(ranking).getAllByRole("row")[1]?.textContent).toContain("Producto 0"));
    expect(within(ranking).getAllByRole("row")[1]?.textContent).toContain("0");
    expect(within(ranking).getAllByRole("row")).toHaveLength(7);
    expect(products.map((product) => product.quantity)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it("uses distinct charts for daily sales, cash, set mix, product ranking, and return reasons with text alternatives", () => {
    render(
      <>
        <MetricsCashChart series={cashSeries} />
        <MetricsReasonChart reasons={reasons} />
        <MetricsCharts
          dailySeries={dailySales}
          products={[{ id: "a0000000-0000-4000-8000-000000000001", name: "Remera", kind: "garment", garment_layer: "upper", quantity: 3 }]}
          sets={{ common: 2, premium: 1 }}
        />
      </>,
    );

    expect(screen.getByRole("group", { name: "Ventas diarias por categoría" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Ingresos y egresos diarios" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Proporción de conjuntos vendidos" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Motivos de devolución" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Unidades vendidas por producto" })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Ingresos y egresos diarios" })).getByText("06")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Ventas diarias por categoría" })).queryByText("06/11")).toBeNull();

    const salesTable = within(screen.getByRole("table", { name: "Detalle diario de ventas" }));
    expect(salesTable.getByText("Prendas sueltas")).toBeTruthy();
    expect(salesTable.getByText("Conjuntos comunes")).toBeTruthy();
    expect(salesTable.getByText("Conjuntos premium")).toBeTruthy();
    expect(salesTable.getByText("2026-11-06")).toBeTruthy();

    const cashTable = within(screen.getByRole("table", { name: "Detalle diario de ingresos y egresos" }));
    expect(cashTable.getByText("$ 1.200,50")).toBeTruthy();
    expect(cashTable.getByText("$ 300,25")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Incidencias por motivo" })).getByText("Falla de costura")).toBeTruthy();
  });

  it("shows a true empty state instead of drawing a zero-total set donut", () => {
    render(
      <MetricsCharts dailySeries={[]} products={[]} sets={{ common: 0, premium: 0 }} />,
    );

    expect(screen.getByText("No hay conjuntos vendidos en el período.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Proporción de conjuntos vendidos" })).toBeNull();
  });

  it("replaces zero-only ranking and reason axes with honest empty states", () => {
    render(
      <>
        <MetricsReasonChart reasons={[{ ...reasons[0]!, count: 0 }]} />
        <MetricsCharts
          dailySeries={[]}
          products={[{ id: "a0000000-0000-4000-8000-000000000001", name: "Remera", kind: "garment", garment_layer: "upper", quantity: 0 }]}
          sets={{ common: 0, premium: 0 }}
        />
      </>,
    );

    expect(screen.getByText("No hay unidades vendidas para estos productos en el período.")).toBeTruthy();
    expect(screen.getByText("No hay motivos de devolución en el período.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Unidades vendidas por producto" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Motivos de devolución" })).toBeNull();
    expect(within(screen.getByRole("list", { name: "Incidencias por motivo" })).getByText("0")).toBeTruthy();
  });
});
