import { describe, expect, it } from "vitest";

import type { OrderDetailLine, OrderSelection } from "./detail-queries";
import { operationalHistoryDetails, operationalHistorySummary, orderLinesForEdit, selectionsForEdit, timelineStageName } from "./detail-format";

function historicalSelection(selectionKey: string, catalogKind: OrderSelection["catalogKind"]): OrderSelection {
  return {
    id: crypto.randomUUID(),
    selectionKey,
    catalogKind,
    garmentLayer: selectionKey === "garment_upper" ? "upper" : null,
    itemName: "Selección eliminada",
    catalogItemId: null,
  };
}

describe("order detail formatting", () => {
  it("keeps the individual layer when its catalog garment was deleted", () => {
    const result = selectionsForEdit([
      historicalSelection("garment_upper", "garment"),
      historicalSelection("neckline", "neckline"),
      historicalSelection("upper_pattern", "upper_pattern"),
      historicalSelection("fabric", "fabric"),
    ]);

    expect(result.individualLayer).toBe("upper");
    expect(result.garmentUpperId).toBe("");
    expect(result.fabricId).toBe("");
  });

  it("uses concrete operational copy for a deposit payment change", () => {
    const details = { version: 1, changes: [{ field: "deposit_paid", previous: true, next: false }] };
    expect(operationalHistorySummary(details)).toBe("Se desmarcó la seña pagada");
    expect(operationalHistoryDetails(details)).toEqual(["Se desmarcó la seña pagada"]);
  });

  it("uses a grouped summary when multiple fields change", () => {
    const details = { version: 1, changes: [{ field: "quantity" }, { field: "specifications" }] };
    expect(operationalHistorySummary(details)).toBe("Se actualizó el pedido");
    expect(operationalHistoryDetails(details)).toEqual(["Se actualizó la cantidad", "Se actualizaron las especificaciones"]);
  });

  it("prefers a stage snapshot and falls back to the current name for legacy events", () => {
    expect(timelineStageName("Diseño original", "Diseño actual")).toBe("Diseño original");
    expect(timelineStageName(null, "Diseño actual")).toBe("Diseño actual");
  });

  it("round-trips legacy options and multiple shield ids", () => {
    const shieldA = crypto.randomUUID();
    const shieldB = crypto.randomUUID();
    const line: OrderDetailLine = {
      id: crypto.randomUUID(), position: 0, lineType: "individual", productId: crypto.randomUUID(), productName: "Remera", quantity: 2, color: null,
      configurationSnapshot: { options: [], legacy_options: { fabric: { id: crypto.randomUUID(), name: "Jersey" }, extras: [{ id: crypto.randomUUID(), name: "Bolsillo" }] } },
      shieldNames: ["Escudo A", "Escudo B"], shieldProductIds: [shieldA, shieldB],
    };
    const result = orderLinesForEdit([line])[0];
    expect(result?.configuration?.legacy_options?.fabric_id).toBeTypeOf("string");
    expect(result?.configuration?.legacy_options?.extra_ids).toHaveLength(1);
    expect(result?.shield_product_ids).toEqual([shieldA, shieldB]);
  });
});
