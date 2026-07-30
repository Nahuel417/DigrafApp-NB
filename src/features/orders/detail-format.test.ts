import { describe, expect, it } from "vitest";

import type { OrderSelection } from "./detail-queries";
import { selectionsForEdit } from "./detail-format";

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
});
