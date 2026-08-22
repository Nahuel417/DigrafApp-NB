// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { OrderDetailCatalogs, OrderDetailLine } from "../detail-queries";
import { OrderSpecifications } from "./order-specifications";

const productId = "11111111-1111-4111-8111-111111111111";
const optionId = "22222222-2222-4222-8222-222222222222";
const valueId = "33333333-3333-4333-8333-333333333333";
const necklineId = "44444444-4444-4444-8444-444444444444";
const fabricId = "55555555-5555-4555-8555-555555555555";
const extraId = "66666666-6666-4666-8666-666666666666";

const catalogs: OrderDetailCatalogs = {
  bags: [],
  extras: [{ id: extraId, name: "Bolsillo" }],
  fabrics: [{ id: fabricId, name: "Jersey" }],
  flags: [],
  garments: [{
    garmentLayer: "upper",
    id: productId,
    kind: "garment",
    name: "Remera deportiva",
    options: [{ id: optionId, name: "Talle", selectionMode: "single", values: [{ id: valueId, value: "Rojo" }] }],
  }],
  lowerPatterns: [],
  necklines: [{ id: necklineId, name: "Redondo" }],
  shields: [],
  upperPatterns: [],
};

function line(configurationSnapshot: Record<string, unknown>): OrderDetailLine {
  return {
    color: "Azul",
    configurationSnapshot,
    id: crypto.randomUUID(),
    lineType: "individual",
    position: 0,
    productId,
    productName: "Remera deportiva",
    quantity: 4,
    shieldNames: [],
    shieldProductIds: [],
  };
}

describe("OrderSpecifications", () => {
  it("renders new product options with catalog names instead of JSON", () => {
    render(<OrderSpecifications catalogs={catalogs} line={line({ options: [{ option_id: optionId, values: [{ value_id: valueId }] }] })} />);

    expect(screen.getAllByText("Producto").length).toBeGreaterThan(0);
    expect(screen.getByText("Remera deportiva")).toBeTruthy();
    expect(screen.getByText("Talle")).toBeTruthy();
    expect(screen.getByText("Rojo")).toBeTruthy();
    expect(screen.queryByText(/option_id/)).toBeNull();
  });

  it("renders nested legacy options from current catalog names and snapshots", () => {
    render(<OrderSpecifications catalogs={catalogs} line={line({ configuration: { legacy_options: { extras: [{ id: extraId, name: "Bolsillo" }], fabric: { id: fabricId }, neckline_id: necklineId } } })} />);

    expect(screen.getByText("Cuello")).toBeTruthy();
    expect(screen.getByText("Redondo")).toBeTruthy();
    expect(screen.getByText("Tela")).toBeTruthy();
    expect(screen.getByText("Jersey")).toBeTruthy();
    expect(screen.getByText("Bolsillo")).toBeTruthy();
  });

  it("hides unknown configuration values without changing the rest of the specification view", () => {
    render(<OrderSpecifications catalogs={{ ...catalogs, garments: [] }} line={line({ new_mode: { enabled: true, reference: "config-v2" } })} />);

    expect(screen.getAllByText("Producto").length).toBeGreaterThan(0);
    expect(screen.queryByText("Otros datos configurados")).toBeNull();
    expect(screen.queryByText("config-v2")).toBeNull();
    expect(screen.queryByText(/\[object Object\]/)).toBeNull();
  });

  it("does not expose internal identifiers when a catalog label is unavailable", () => {
    render(<OrderSpecifications catalogs={{ ...catalogs, fabrics: [], garments: [], necklines: [] }} line={line({ configuration: { legacy_options: { fabric: { id: fabricId }, neckline_id: necklineId } } })} />);

    expect(screen.queryByText(fabricId)).toBeNull();
    expect(screen.queryByText(necklineId)).toBeNull();
    expect(screen.queryByText(/ID técnico/)).toBeNull();
  });
});
