// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const stock = vi.hoisted(() => ({ quantity: 0 }));

vi.mock("@/lib/auth/guards", () => ({ requireActiveProfile: async () => ({ role: "employee" }) }));
vi.mock("@/features/stock/permissions", () => ({ canManageFabricStock: () => false }));
vi.mock("@/features/stock/components/stock-detail-actions", () => ({ StockDetailActions: () => null }));
vi.mock("@/features/stock/components/stock-operation-form", () => ({ StockOperationForm: () => null }));
vi.mock("@/features/stock/schemas", () => ({ currentStockDate: () => "2026-11-03" }));
vi.mock("@/features/stock/queries", () => ({
  listStockItems: async () => [{ id: "fabric", name: "Lona", quantity: stock.quantity, is_active: true }],
  getStockHistory: async () => ({ movements: [] }),
  formatStockQuantity: (quantity: number) => String(quantity),
  formatStockDate: vi.fn(),
  formatStockDateTime: vi.fn(),
}));

import StockPage from "./page";

afterEach(cleanup);

it.each([0, 1, 0.5, 1.5, 2])("colors the current stock consistently in list and detail for %s rolls", async (quantity) => {
  stock.quantity = quantity;
  render(await StockPage({ searchParams: Promise.resolve({ item: "fabric" }) }));
  const color = quantity === 0 || quantity === 1 ? "text-destructive" : "text-success-foreground";
  const material = screen.getByRole("link", { name: /Lona/ });
  expect(within(material).getByText(String(quantity)).closest(`.${color}`)).not.toBeNull();
  const detail = screen.getByRole("region", { name: "Lona" });
  expect(within(detail).getByText(String(quantity)).closest(`.${color}`)).not.toBeNull();
});
