// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MetricsCashChart, MetricsCharts, MetricsIncidentChart, MetricsProductChart, MetricsReasonChart, MetricsSalesChart } from "./metrics-charts";

const dailySales = [
  { date: "2026-11-06", loose_garments: 3, sets: { common: 0, premium: 0 } },
  { date: "2026-11-07", loose_garments: 0, sets: { common: 2, premium: 1 } },
];

const cashSeries = [
  { date: "2026-11-06", income: "1200.50", expense: "0.00" },
  { date: "2026-11-07", income: "0.00", expense: "300.25" },
];

const reasonKinds = ["internal", "without_return", "returns"] as Array<"internal" | "without_return" | "returns">;
const reasons = [{ code: "sewing", label: "Falla de costura", internal: 1, without_return: 0, returns: 1 }];

const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
afterEach(() => {
  cleanup();
  if (originalScrollIntoView) Object.defineProperty(Element.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

describe("MetricsCharts", () => {
  it("stacks only recorded reasons and keeps the visible breakdown as text", () => {
    render(<MetricsReasonChart kinds={reasonKinds} reasons={[
      { code: "sewing", label: "Falla de costura", internal: 0, without_return: 0, returns: 0 },
      { code: "quality", label: "Problema en calidad", internal: 1, without_return: 0, returns: 1 },
    ]} />);
    const chartElement = screen.getByRole("group", { name: "Motivos por área" });
    const chart = within(chartElement);
    expect(chart.getByText("Problema en calidad")).toBeTruthy();
    expect(chart.queryByText("Falla de costura")).toBeNull();
    const segmentWidths = [...chartElement.querySelectorAll(".recharts-rectangle")]
      .filter((bar) => bar.getAttribute("fill")?.startsWith("var(--color-"))
      .map((bar) => Number(bar.getAttribute("width")));
    expect(segmentWidths).toHaveLength(2);
    expect(segmentWidths.every((width) => width > 0)).toBe(true);
    expect(chart.getByText("2")).toBeTruthy();
    const totalLabel = chartElement.querySelector<SVGTextElement>(".recharts-label");
    const firstSegment = chartElement.querySelector<SVGRectElement>('.recharts-rectangle[fill="var(--color-internal)"]');
    expect(totalLabel).toBeTruthy();
    expect(firstSegment).toBeTruthy();
    const labelY = Number(totalLabel!.getAttribute("y"));
    const segmentCenterY = Number(firstSegment!.getAttribute("y")) + Number(firstSegment!.getAttribute("height")) / 2;
    expect(Math.abs(labelY - segmentCenterY)).toBeLessThanOrEqual(6);
    const alternative = within(screen.getByRole("list", { name: "Incidencias por motivo" }));
    expect(alternative.getByText(/Problema en calidad/)).toBeTruthy();
    expect(alternative.queryByText(/Falla de costura/)).toBeNull();
  });

  it("aligns the total with its bar when the final stacked kind is zero", () => {
    render(<MetricsReasonChart kinds={reasonKinds} reasons={[
      { code: "design", label: "Diseño", internal: 1, without_return: 0, returns: 0 },
    ]} />);
    const chart = screen.getByRole("group", { name: "Motivos por área" });
    const totalLabel = chart.querySelector<SVGTextElement>(".recharts-label");
    const bar = chart.querySelector<SVGRectElement>('.recharts-rectangle[fill="var(--color-internal)"]');

    expect(within(chart).getByText("1")).toBeTruthy();
    expect(totalLabel).toBeTruthy();
    expect(bar).toBeTruthy();
    const labelY = Number(totalLabel!.getAttribute("y"));
    const barCenterY = Number(bar!.getAttribute("y")) + Number(bar!.getAttribute("height")) / 2;
    expect(Math.abs(labelY - barCenterY)).toBeLessThanOrEqual(6);
  });

  it("shows the per-kind breakdown when hovering a reason", async () => {
    render(<MetricsReasonChart kinds={reasonKinds} reasons={[
      { code: "sewing", label: "Falla de costura", internal: 1, without_return: 1, returns: 1 },
    ]} />);
    const chart = screen.getByRole("group", { name: "Motivos por área" });

    const surface = await waitFor(() => {
      const element = chart.querySelector<HTMLElement>(".recharts-surface");
      expect(element).toBeTruthy();
      return element!;
    });
    surface.focus();
    fireEvent.keyDown(surface, { key: "ArrowRight" });

    const tooltip = await screen.findByRole("status");
    expect(tooltip.textContent).toContain("Falla de costura");
    expect(tooltip.textContent).toContain("Internas");
    expect(tooltip.textContent).toContain("Reclamo sin devolución");
    expect(tooltip.textContent).toContain("Devolución");
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
        <MetricsReasonChart kinds={reasonKinds} reasons={reasons} />
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
    expect(screen.getByRole("group", { name: "Motivos por área" })).toBeTruthy();
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
    expect(within(screen.getByRole("list", { name: "Incidencias por motivo" })).getByText(/Falla de costura/)).toBeTruthy();
  });

  it("shows a true empty state instead of drawing a zero-total set donut", () => {
    render(
      <MetricsCharts dailySeries={[]} products={[]} sets={{ common: 0, premium: 0 }} />,
    );

    expect(screen.getByText("No hay conjuntos vendidos en el período.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Proporción de conjuntos vendidos" })).toBeNull();
  });

  it("explains incident totals with a three-kind composition and text alternative", () => {
    render(<MetricsIncidentChart internal={2} returns={1} total={4} withoutReturn={1} />);

    const chart = within(screen.getByRole("group", { name: "Composición de incidencias" }));
    expect(chart.getByText("2")).toBeTruthy();
    expect(chart.getAllByText("1")).toHaveLength(2);
    const rows = within(screen.getByRole("list", { name: "Incidencias por tipo" })).getAllByRole("listitem")
      .map((item) => item.textContent?.replace(/\s/g, ""));
    expect(rows).toContain("Internas:2(50%)");
    expect(rows).toContain("Reclamosindevolución:1(25%)");
    expect(rows).toContain("Devolución:1(25%)");
  });

  it("includes the incident type, count, and percentage in the slice tooltip", async () => {
    render(<MetricsIncidentChart internal={2} returns={1} total={4} withoutReturn={1} />);
    const chart = screen.getByRole("group", { name: "Composición de incidencias" });

    await waitFor(() => expect(chart.querySelectorAll(".recharts-sector")).toHaveLength(3));
    fireEvent.mouseEnter(chart.querySelectorAll(".recharts-sector")[0]!);

    const tooltip = await screen.findByRole("status");
    expect(tooltip.textContent).toContain("Incidencia interna");
    expect(tooltip.textContent).toContain("2");
    expect(tooltip.textContent).toContain("50%");
  });

  it("shows an incident empty state instead of a zero-total donut", () => {
    render(<MetricsIncidentChart internal={0} returns={0} total={0} withoutReturn={0} />);

    expect(screen.getByText("No hay incidencias en el período.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Composición de incidencias" })).toBeNull();
  });

  it("replaces zero-only ranking and reason axes with honest empty states", () => {
    render(
      <>
        <MetricsReasonChart kinds={reasonKinds} reasons={[{ ...reasons[0]!, internal: 0, without_return: 0, returns: 0 }]} />
        <MetricsCharts
          dailySeries={[]}
          products={[{ id: "a0000000-0000-4000-8000-000000000001", name: "Remera", kind: "garment", garment_layer: "upper", quantity: 0 }]}
          sets={{ common: 0, premium: 0 }}
        />
      </>,
    );

    expect(screen.getByText("No hay unidades vendidas para estos productos en el período.")).toBeTruthy();
    expect(screen.getByText("No hay motivos de incidencias en el período.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Unidades vendidas por producto" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Motivos por área" })).toBeNull();
    expect(screen.getByRole("list", { name: "Incidencias por motivo" }).children).toHaveLength(0);
  });
});
