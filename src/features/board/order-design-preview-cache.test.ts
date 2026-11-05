import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GetOrderDesignImagePreviewReadUrlActionState } from "@/features/orders/image-actions";

import { createOrderDesignPreviewCache } from "./order-design-preview-cache";

const image = {
  id: "image-id", orderId: "order-id", objectPath: "orders/order-id/image.jpg",
  contentType: "image/jpeg" as const, byteSize: 413032, uploadedBy: "actor-id",
  createdAt: "2026-11-04T12:00:00.000Z", updatedAt: "2026-11-04T12:00:00.000Z",
  signedUrl: "https://signed.example/preview.webp", expiresAt: "2026-11-04T12:05:00.000Z", isPrimary: true, isPreview: true,
};
const success: GetOrderDesignImagePreviewReadUrlActionState = { status: "success", image };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-04T12:00:00.000Z")); });
afterEach(() => vi.useRealTimers());

describe("board-local private preview URL reuse", () => {
  it("reuses a valid result without extending its expiry", async () => {
    const load = vi.fn().mockResolvedValue(success);
    const read = createOrderDesignPreviewCache(load);
    expect(await read("order-id", "revision-1")).toBe(success);
    await vi.advanceTimersByTimeAsync(60000);
    expect(await read("order-id", "revision-1")).toBe(success);
    expect(load).toHaveBeenCalledTimes(1);
    expect(image.expiresAt).toBe("2026-11-04T12:05:00.000Z");
  });

  it("deduplicates simultaneous reads from a card and quick view", async () => {
    let finish: (result: GetOrderDesignImagePreviewReadUrlActionState) => void = () => {};
    const load = vi.fn(() => new Promise<GetOrderDesignImagePreviewReadUrlActionState>(resolve => { finish = resolve; }));
    const read = createOrderDesignPreviewCache(load);
    const first = read("order-id", "revision-1");
    const second = read("order-id", "revision-1");
    expect(load).toHaveBeenCalledTimes(1);
    finish(success);
    expect(await first).toBe(success);
    expect(await second).toBe(success);
  });

  it("loads again after expiry or an image revision change", async () => {
    const load = vi.fn().mockResolvedValue(success);
    const read = createOrderDesignPreviewCache(load);
    await read("order-id", "revision-1");
    await read("order-id", "revision-2");
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(300000);
    await read("order-id", "revision-2");
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not retain rejected or failed reads", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ status: "error" }).mockResolvedValue(success);
    const read = createOrderDesignPreviewCache(load);
    await expect(read("order-id", "revision-1")).rejects.toThrow("network");
    expect(await read("order-id", "revision-1")).toEqual({ status: "error" });
    expect(await read("order-id", "revision-1")).toBe(success);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("keeps independent authenticated scopes isolated", async () => {
    const load = vi.fn().mockResolvedValue(success);
    const firstScope = createOrderDesignPreviewCache(load);
    const secondScope = createOrderDesignPreviewCache(load);
    await firstScope("order-id", "revision-1");
    await secondScope("order-id", "revision-1");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not let an older pending read replace a forced error recovery", async () => {
    let finish: (result: GetOrderDesignImagePreviewReadUrlActionState) => void = () => {};
    const recovered = { ...success, image: { ...image, signedUrl: "https://signed.example/recovered.webp" } };
    const load = vi.fn().mockImplementationOnce(() => new Promise<GetOrderDesignImagePreviewReadUrlActionState>(resolve => { finish = resolve; }))
      .mockResolvedValue(recovered);
    const read = createOrderDesignPreviewCache(load);
    const stale = read("order-id", "revision-1");
    expect(await read("order-id", "revision-1", true)).toBe(recovered);
    finish(success);
    await stale;
    expect(await read("order-id", "revision-1")).toBe(recovered);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
