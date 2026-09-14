// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MutationState } from "@/lib/action-state";

import { PricingManager } from "./pricing-manager";

vi.mock("../actions", () => ({
  deletePriceProductAction: async (): Promise<MutationState> => ({}),
  importPricesAction: async (): Promise<MutationState> => ({}),
  previewPricesAction: async (): Promise<MutationState> => ({}),
  upsertPriceProductAction: async (): Promise<MutationState> => ({}),
}));

vi.mock("@/hooks/use-mutation-toast", () => ({
  useMutationToast: vi.fn(),
}));

afterEach(cleanup);

describe("PricingManager", () => {
  it("keeps bulk paste and product editing collapsed in a paginated list", () => {
    const products = Array.from({ length: 12 }, (_, index) => ({
      id: crypto.randomUUID(),
      code: `AD-${index + 1}`,
      group: "adults" as const,
      name: `Producto ${index + 1}`,
      unit: "unidad" as const,
      price: "1000.00",
      active: true,
    }));

    render(<PricingManager data={{ products }} />);

    const pasteButton = screen.getByRole("button", { name: /Pegar filas manualmente/ });
    expect(pasteButton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(pasteButton);
    expect(pasteButton.getAttribute("aria-expanded")).toBe("true");

    const editButtons = screen.getAllByRole("button", { name: /^Editar Producto/ });
    expect(editButtons).toHaveLength(10);
    expect(editButtons[0]?.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(editButtons[0]!);
    expect(editButtons[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Paginación de productos")).toBeTruthy();
  });

  it("searches every group by product name only", () => {
    render(<PricingManager data={{ products: [
      { id: crypto.randomUUID(), code: "REMERA", group: "children", name: "Pantalón", unit: "unidad", price: "900.00", active: true },
      { id: crypto.randomUUID(), code: "CAM-01", group: "adults", name: "Remera", unit: "unidad", price: "1000.00", active: true },
    ] }} />);

    expect(screen.queryByRole("button", { name: "Adultos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Niños" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar por nombre" }), { target: { value: "Remera" } });
    expect(screen.getByRole("button", { name: "Editar Remera" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar Pantalón" })).toBeNull();
  });

  it("calculates totals when the price list RPC returns a numeric price", () => {
    render(<PricingManager data={{ products: [
      { id: crypto.randomUUID(), code: null, group: "adults", name: "Remera", unit: "unidad", price: 200 as unknown as string, active: true },
    ] }} />);

    fireEvent.click(screen.getByRole("tab", { name: /Armar cotización/ }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(screen.getAllByText("$ 200.00").length).toBeGreaterThan(0);
  });

  it("clears a hidden quote selection when searching", () => {
    const first = { id: crypto.randomUUID(), code: null, group: "adults" as const, name: "Remera", unit: "unidad" as const, price: "1000.00", active: true };
    const second = { id: crypto.randomUUID(), code: null, group: "adults" as const, name: "Pantalón", unit: "unidad" as const, price: "1200.00", active: true };
    render(<PricingManager data={{ products: [first, second] }} />);

    fireEvent.click(screen.getByRole("tab", { name: /Armar cotización/ }));
    fireEvent.click(screen.getByRole("combobox", { name: "Producto" }));
    expect(screen.getByRole("option", { name: "Remera" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Pantalón" })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar producto por nombre" }), { target: { value: "Pantalón" } });

    expect(screen.getByRole("button", { hidden: true, name: "Agregar" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("option", { name: "Pantalón" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(screen.getAllByText("Pantalón")).toHaveLength(2);
  });

  it("keeps inactive products visible with an explicit status", () => {
    render(<PricingManager data={{ products: [
      { id: crypto.randomUUID(), code: null, group: "adults", name: "Producto inactivo", unit: "unidad", price: "200.00", active: false },
    ] }} />);

    expect(screen.getByText("Producto inactivo")).toBeTruthy();
    expect(screen.getByText("Inactivo")).toBeTruthy();
  });
});
