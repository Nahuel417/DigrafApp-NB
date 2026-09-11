import { describe, expect, it } from "vitest";

import { parsePriceText } from "./importer";

describe("price import contract", () => {
  it("normalizes the canonical tabular text contract", () => {
    const result = parsePriceText("Código\tGrupo\tNombre\tUnidad\tPrecio\tActivo\n A-01 \t Adultos \t Remera \t unidad \t 1.250,50 \t sí");
    expect(result).toEqual([{ code: "A-01", group: "adults", name: "Remera", unit: "unidad", price: "1250.50", active: true }]);
  });

  it("rejects duplicate codes and invalid rows", () => {
    expect(() => parsePriceText("codigo\tgrupo\tnombre\tunidad\tprecio\nA\tadults\tUno\tunidad\t1\nA\tadults\tDos\tunidad\t2")).toThrow(/duplicado/i);
    expect(() => parsePriceText("nombre\tgrupo\nUno\tadults")).toThrow(/unidad.*vacía/i);
  });

  it("accepts a missing code column and blank codes", () => {
    expect(parsePriceText("grupo\tnombre\tunidad\tprecio\nadults\tRemera\tunidad\t1250")).toEqual([
      { code: null, group: "adults", name: "Remera", unit: "unidad", price: "1250.00" },
    ]);
    expect(parsePriceText("codigo\tgrupo\tnombre\tunidad\tprecio\n\tadults\tShort\tunidad\t900")).toEqual([
      { code: null, group: "adults", name: "Short", unit: "unidad", price: "900.00" },
    ]);
  });

  it("accepts Argentine currency and thousands formatting", () => {
    expect(parsePriceText("grupo|nombre|unidad|precio\nadults|Camiseta sola|unidad|$14.000")).toEqual([
      { code: null, group: "adults", name: "Camiseta sola", unit: "unidad", price: "14000.00" },
    ]);
  });

  it("infers the default column order without headers", () => {
    expect(parsePriceText("Camiseta sola | Adultos | Unidad | $14.000")).toEqual([
      { code: null, group: "adults", name: "Camiseta sola", unit: "unidad", price: "14000.00" },
    ]);
  });

  it("accepts common product terms in headerless rows", () => {
    expect(parsePriceText([
      "Camiseta sola | Adultos | Unidad | $14.000",
      "Camiseta y short | Niños | Conjunto | $20.000",
      "Escudo TPU | Todas las edades | Unidad | $2.500",
      "Bandera desde 1 × 1,50 m | Todas las edades | Metro lineal | $15.000",
      "Conjunto de invierno de microfibra elastizada | Adultos | Conjunto | $45.000",
    ].join("\n"))).toEqual([
      { code: null, group: "adults", name: "Camiseta sola", unit: "unidad", price: "14000.00" },
      { code: null, group: "children", name: "Camiseta y short", unit: "unidad", price: "20000.00" },
      { code: null, group: "additions", name: "Escudo TPU", unit: "unidad", price: "2500.00" },
      { code: null, group: "flags", name: "Bandera desde 1 × 1,50 m", unit: "metro_lineal", price: "15000.00" },
      { code: null, group: "adults", name: "Conjunto de invierno de microfibra elastizada", unit: "unidad", price: "45000.00" },
    ]);
  });

  it("explains invalid row fields", () => {
    expect(() => parsePriceText("Remera | Adultos | Superficie | $10.000")).toThrow("Fila 1: la unidad \"Superficie\" no es válida. Usá Unidad o Metro lineal.");
  });
});
