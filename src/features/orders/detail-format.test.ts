import { describe, expect, it } from "vitest";

import type { OrderSelection } from "./detail-queries";
import { operationalHistoryDetails, operationalHistorySummary, selectionsForEdit } from "./detail-format";

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
});
