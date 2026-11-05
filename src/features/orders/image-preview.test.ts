import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { buildOrderDesignPreviewObjectPath, isOrderDesignStorageObjectPath } from "./image-contracts";
import { generateOrderDesignImagePreview, validateOrderDesignImageMetadata } from "./image-preview";

const orderId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";

describe("private order design previews", () => {
  it("derives only a non-client-uploadable sibling path from a validated original", () => {
    const originalPath = `orders/${orderId}/${objectId}.jpeg`;
    const previewPath = buildOrderDesignPreviewObjectPath(originalPath);

    expect(previewPath).toBe(`orders/${orderId}/${objectId}.preview.webp`);
    expect(isOrderDesignStorageObjectPath(originalPath, orderId)).toBe(true);
    expect(isOrderDesignStorageObjectPath(previewPath, orderId)).toBe(true);
    expect(isOrderDesignStorageObjectPath(previewPath.replace(orderId, objectId), orderId)).toBe(false);
    expect(() => buildOrderDesignPreviewObjectPath("../private.png")).toThrow("La ruta de imagen no es válida.");
  });

  it("creates a single orientation-correct WebP without enlarging and preserves the source bytes", async () => {
    const original = await sharp({
      create: { width: 300, height: 150, channels: 3, background: { r: 220, g: 30, b: 50 } },
    }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const originalCopy = Buffer.from(original);

    const result = await generateOrderDesignImagePreview(
      original,
      "image/jpeg",
      `orders/${orderId}/${objectId}.jpg`,
    );

    expect(result).toMatchObject({ ok: true, value: { contentType: "image/webp", width: 150, height: 300 } });
    if (!result.ok) throw new Error(result.error.message);
    expect((await sharp(result.value.bytes).metadata()).format).toBe("webp");
    expect(original).toEqual(originalCopy);
  });

  it("keeps transparency and leaves small images at their original dimensions", async () => {
    const original = await sharp({
      create: { width: 100, height: 60, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0 } },
    }).png().toBuffer();

    const result = await generateOrderDesignImagePreview(
      original,
      "image/png",
      `orders/${orderId}/${objectId}.png`,
    );

    expect(result).toMatchObject({ ok: true, value: { width: 100, height: 60 } });
    if (!result.ok) throw new Error(result.error.message);
    expect((await sharp(result.value.bytes).metadata()).hasAlpha).toBe(true);
  });

  it("preserves accepted animated WebP originals while previewing only their first frame", async () => {
    const frames = await Promise.all(["red", "blue"].map(background => sharp({
      create: { width: 8, height: 6, channels: 4, background },
    }).png().toBuffer()));
    const original = await sharp(frames, { join: { animated: true } }).webp({ loop: 0, delay: 100 }).toBuffer();
    const copy = Buffer.from(original);
    expect((await sharp(original).metadata()).pages).toBe(2);

    const result = await generateOrderDesignImagePreview(original, "image/webp", `orders/${orderId}/${objectId}.webp`);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect((await sharp(result.value.bytes).metadata()).pages ?? 1).toBe(1);
    expect(original).toEqual(copy);
  });

  it("rejects unsupported actual formats, invalid data, and images over the pixel budget", async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
    }).png().toBuffer();

    expect((await generateOrderDesignImagePreview(png, "image/jpeg", `orders/${orderId}/${objectId}.jpg`)).ok).toBe(false);
    expect((await generateOrderDesignImagePreview(Buffer.from("not an image"), "image/png", `orders/${orderId}/${objectId}.png`)).ok).toBe(false);
    expect(validateOrderDesignImageMetadata({ format: "png", width: 8000, height: 5000, pages: 1 }, "image/png").ok).toBe(true);
    expect(validateOrderDesignImageMetadata({ format: "png", width: 8000, height: 5001, pages: 1 }, "image/png")).toMatchObject({
      ok: false,
      error: { message: "La imagen supera el límite de 40 megapíxeles." },
    });
    expect(validateOrderDesignImageMetadata({ format: "webp", width: 8000, height: 5000, pages: 2 }, "image/webp")).toMatchObject({
      ok: false,
      error: { message: "La imagen supera el límite de 40 megapíxeles." },
    });
  });
});
