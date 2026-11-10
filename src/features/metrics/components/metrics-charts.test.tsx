// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MetricsCashChart, MetricsCharts, MetricsReasonChart } from "./metrics-charts";

const dailySales = [
  { date: "2026-11-06", loose_garments: 3, sets: { common: 0, premium: 0 } },
  { date: "2026-11-07", loose_garments: 0, sets: { common: 2, premium: 1 } },
];

const cashSeries = [
  { date: "2026-11-06", income: "1200.50", expense: "0.00" },
  { date: "2026-11-07", income: "0.00", expense: "300.25" },
];

const reasons = [{ code: "sewing", label: "Falla de costura", count: 2 }];

afterEach(cleanup);

describe("MetricsCharts", () => {
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
