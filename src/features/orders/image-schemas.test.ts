import { describe, expect, it } from "vitest";

import { buildOrderDesignObjectPath } from "./image-contracts";
import { finalizeOrderDesignImageSchema, orderDesignImageUploadIntentSchema } from "./image-schemas";

const orderId = "11111111-1111-4111-8111-111111111111";

describe("order design image schemas", () => {
  it("accepts a first-upload intent with the supported limits", () => {
    const result = orderDesignImageUploadIntentSchema.safeParse({
      orderId,
      contentType: "image/webp",
      byteSize: "1024",
      expectedImageUpdatedAt: "",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expectedImageUpdatedAt).toBeNull();
  });

  it("rejects unsupported types and oversized files", () => {
    expect(orderDesignImageUploadIntentSchema.safeParse({ orderId, contentType: "image/gif", byteSize: 10, expectedImageUpdatedAt: null }).success).toBe(false);
    expect(orderDesignImageUploadIntentSchema.safeParse({ orderId, contentType: "image/png", byteSize: 10 * 1024 * 1024 + 1, expectedImageUpdatedAt: null }).success).toBe(false);
  });

  it("requires the finalization path to belong to the order", () => {
    const validPath = buildOrderDesignObjectPath(orderId, "image/png", "22222222-2222-4222-8222-222222222222");
    const valid = finalizeOrderDesignImageSchema.safeParse({
      orderId,
      objectPath: validPath,
      contentType: "image/png",
      byteSize: 1024,
      expectedImageUpdatedAt: null,
      idempotencyKey: "image-key",
    });
    const invalid = finalizeOrderDesignImageSchema.safeParse({
      ...valid.data,
      objectPath: validPath.replace(orderId, "33333333-3333-4333-8333-333333333333"),
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});
