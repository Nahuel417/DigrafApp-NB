import { describe, expect, it } from "vitest";

import { verifyOrderDesignImageBytes } from "./image-validation";

const path = "orders/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png";

function pngBytes() {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  return bytes;
}

describe("order design image content validation", () => {
  it("accepts a PNG from its signature and exact byte size", () => {
    const bytes = pngBytes();
    expect(verifyOrderDesignImageBytes(bytes, "image/png", bytes.length, path)).toEqual({
      ok: true,
      value: { contentType: "image/png", byteSize: 24 },
    });
  });

  it("rejects bytes that only claim to be an allowed MIME type", () => {
    const bytes = new Uint8Array(24);
    expect(verifyOrderDesignImageBytes(bytes, "image/png", bytes.length, path).ok).toBe(false);
  });

  it("rejects a valid signature when it does not match the declared type or extension", () => {
    const bytes = pngBytes();
    expect(verifyOrderDesignImageBytes(bytes, "image/webp", bytes.length, path).ok).toBe(false);
    expect(verifyOrderDesignImageBytes(bytes, "image/png", bytes.length, path.replace(".png", ".webp")).ok).toBe(false);
  });

  it("rejects a size mismatch before metadata finalization", () => {
    const bytes = pngBytes();
    expect(verifyOrderDesignImageBytes(bytes, "image/png", bytes.length + 1, path).ok).toBe(false);
  });
});
