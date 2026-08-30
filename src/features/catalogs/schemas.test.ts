import { describe, expect, it } from "vitest";

import { catalogItemSchema } from "./schemas";

describe("catalog item schema", () => {
  it("requires a layer only for garments", () => {
    expect(catalogItemSchema.safeParse({ kind: "garment", garmentLayer: "", name: "Remera" }).success).toBe(false);
    expect(catalogItemSchema.safeParse({ kind: "garment", garmentLayer: "upper", name: "Remera" }).success).toBe(true);
    expect(catalogItemSchema.safeParse({ kind: "fabric", garmentLayer: "upper", name: "Algodón" }).success).toBe(false);
  });

  it("normalizes the name through validation without accepting empty values", () => {
    const result = catalogItemSchema.safeParse({ kind: "fabric", garmentLayer: "", name: "  Algodón  " });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Algodón");
  });
});
