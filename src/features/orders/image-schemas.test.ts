import { describe, expect, it } from "vitest";

import { buildOrderDesignObjectPath } from "./image-contracts";
import { finalizeOrderDesignImageSchema, orderDesignImageMutationSchema, orderDesignImageUploadIntentSchema } from "./image-schemas";

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

  it("requires explicit mutation intents for add, replace, delete, and primary selection", () => {
    const common = { orderId, idempotencyKey: "image-mutation-key" };
    expect(orderDesignImageMutationSchema.safeParse({
      ...common,
      action: "add",
      contentType: "image/png",
      byteSize: 1024,
      objectPath: buildOrderDesignObjectPath(orderId, "image/png", "22222222-2222-4222-8222-222222222222"),
    }).success).toBe(true);
    expect(orderDesignImageMutationSchema.safeParse({
      ...common,
      action: "replace",
      imageId: "22222222-2222-4222-8222-222222222222",
      contentType: "image/webp",
      byteSize: 2048,
      objectPath: buildOrderDesignObjectPath(orderId, "image/webp", "33333333-3333-4333-8333-333333333333"),
      expectedImageUpdatedAt: "2026-08-18T12:00:00.000Z",
    }).success).toBe(true);
    expect(orderDesignImageMutationSchema.safeParse({ ...common, action: "delete", imageId: "22222222-2222-4222-8222-222222222222" }).success).toBe(true);
    expect(orderDesignImageMutationSchema.safeParse({ ...common, action: "set_primary", imageId: "22222222-2222-4222-8222-222222222222" }).success).toBe(true);
    expect(orderDesignImageMutationSchema.safeParse({ ...common, action: "clear_primary" }).success).toBe(true);
  });

  it("rejects implicit or structurally invalid image mutations", () => {
    const path = buildOrderDesignObjectPath(orderId, "image/png", "22222222-2222-4222-8222-222222222222");
    expect(orderDesignImageMutationSchema.safeParse({ orderId, idempotencyKey: "image-mutation-key", objectPath: path, contentType: "image/png", byteSize: 1024 }).success).toBe(false);
    expect(orderDesignImageMutationSchema.safeParse({ orderId, action: "delete", idempotencyKey: "image-mutation-key", imageId: "22222222-2222-4222-8222-222222222222", objectPath: path }).success).toBe(false);
    expect(orderDesignImageMutationSchema.safeParse({ orderId, action: "set_primary", idempotencyKey: "image-mutation-key" }).success).toBe(false);
  });
});
