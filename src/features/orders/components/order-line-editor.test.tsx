// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrderLineEditor } from "./order-line-editor";

const catalogs = {
  garments: [
    { id: "11111111-1111-4111-8111-111111111111", kind: "garment" as const, garmentLayer: "upper" as const, name: "Remera", options: [] },
    { id: "11111111-1111-4111-8111-111111111112", kind: "garment" as const, garmentLayer: "lower" as const, name: "Short", options: [] },
  ],
  flags: [{ id: "22222222-2222-4222-8222-222222222222", kind: "flag" as const, garmentLayer: null, name: "Bandera", options: [] }],
  bags: [],
  shields: [
    { id: "33333333-3333-4333-8333-333333333333", kind: "shield" as const, garmentLayer: null, name: "Escudo A", options: [] },
    { id: "33333333-3333-4333-8333-333333333334", kind: "shield" as const, garmentLayer: null, name: "Escudo B", options: [] },
  ],
  necklines: [], upperPatterns: [], lowerPatterns: [], fabrics: [], extras: [],
};

describe("OrderLineEditor", () => {
  it("serializes multiple lines and allows reordering without drag and drop", () => {
    const { container } = render(<OrderLineEditor catalogs={catalogs} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar renglón" }));
    const quantities = screen.getAllByLabelText("Cantidad");
    fireEvent.change(quantities[1]!, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Subir renglón 2" }));
    const payload = JSON.parse(container.querySelector('input[name="lines"]')?.getAttribute("value") ?? "[]") as Array<{ quantity: number; position: number }>;
    expect(payload).toHaveLength(2);
    expect(payload[0]?.quantity).toBe(3);
    expect(payload.map((line) => line.position)).toEqual([0, 1]);
  });

  it("serializes multiple shields on one line", () => {
    const { container } = render(<OrderLineEditor catalogs={catalogs} />);
    const shields = container.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(shields[0]!);
    fireEvent.click(shields[1]!);
    const payload = JSON.parse(container.querySelector('input[name="lines"]')?.getAttribute("value") ?? "[]") as Array<{ shield_product_ids?: string[] }>;
    expect(payload[0]?.shield_product_ids).toEqual(["33333333-3333-4333-8333-333333333333", "33333333-3333-4333-8333-333333333334"]);
  });
});
