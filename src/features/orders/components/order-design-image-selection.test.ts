import { describe, expect, it } from "vitest";

import { MAX_ORDER_DESIGN_IMAGE_BYTES } from "../image-contracts";
import { validateOrderDesignFileSelection } from "./order-design-image-selection";

describe("order design image file selection", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s within the limit", (type) => {
    expect(validateOrderDesignFileSelection({ type, size: 1024 })).toEqual({ ok: true, contentType: type });
  });

  it("rejects an absent, empty, unsupported, or oversized file", () => {
    expect(validateOrderDesignFileSelection(null).ok).toBe(false);
    expect(validateOrderDesignFileSelection({ type: "image/png", size: 0 }).ok).toBe(false);
    expect(validateOrderDesignFileSelection({ type: "image/gif", size: 10 }).ok).toBe(false);
    expect(validateOrderDesignFileSelection({ type: "image/png", size: MAX_ORDER_DESIGN_IMAGE_BYTES + 1 }).ok).toBe(false);
  });
});
