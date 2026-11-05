import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as previewGeneration from "./image-preview";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  userFrom: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  info: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
  originalRead: vi.fn(),
  primaryPreviewRead: vi.fn(),
  previewRead: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/current-profile", () => ({ getCurrentProfile: mocks.profile }));
vi.mock("@/lib/auth/permissions", () => ({ canManageOrderDesignImages: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.userFrom, storage: { from: () => ({ download: mocks.download }) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove, info: mocks.info }) } }),
}));
vi.mock("./image-queries", () => ({
  getOrderDesignImageReadUrl: mocks.originalRead,
  getOrderDesignImagePreviewReadUrl: mocks.primaryPreviewRead,
  getOrderDesignImagesPreviewReadUrls: mocks.previewRead,
  getOrderDesignImagesReadUrls: vi.fn(),
}));

import {
  finalizeOrderDesignImageAction,
  getOrderDesignImageReadUrlAction,
  getOrderDesignImagePreviewReadUrlAction,
  getOrderDesignImagesPreviewReadUrlsAction,
  mutateOrderDesignImageAction,
} from "./image-actions";

const orderId = "11111111-1111-4111-8111-111111111111";
const imageId = "33333333-3333-4333-8333-333333333333";
const originalPath = `orders/${orderId}/22222222-2222-4222-8222-222222222222.png`;

function mutationInput(action: string, extra: Record<string, string> = {}) {
  const formData = new FormData();
  for (const [key, value] of Object.entries({
    action,
    orderId,
    idempotencyKey: "image-event-key",
    imageId: action === "delete" || action === "replace" ? imageId : "",
    objectPath: action === "add" || action === "replace" ? originalPath : "",
    contentType: action === "add" || action === "replace" ? "image/png" : "",
    byteSize: action === "add" || action === "replace" ? "1" : "",
    expectedImageUpdatedAt: action === "replace" ? "2026-11-04T12:00:00.000Z" : "",
    ...extra,
  })) formData.set(key, value);
  return formData;
}

function eventQuery() {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("order design image preview creation", () => {
  let uploadedPng: Buffer;
  afterEach(() => vi.restoreAllMocks());

  beforeEach(async () => {
    vi.clearAllMocks();
    uploadedPng = await sharp({
      create: { width: 8, height: 6, channels: 4, background: { r: 30, g: 80, b: 150, alpha: 1 } },
    }).png().toBuffer();
    mocks.profile.mockResolvedValue({ id: "actor-id", role: "admin", isActive: true, mustChangePassword: false });
    const query = eventQuery();
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.userFrom.mockReturnValue(query);
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(uploadedPng)], { type: "image/png" }), error: null });
    mocks.upload.mockResolvedValue({ data: { path: "preview" }, error: null });
    mocks.info.mockResolvedValue({ data: null, error: { statusCode: "404", message: "Object not found" } });
    mocks.remove.mockResolvedValue({ data: [], error: null });
    mocks.rpc.mockResolvedValue({
      data: [{
        action: "add",
        byte_size: uploadedPng.length,
        content_type: "image/png",
        event_id: "event-id",
        image_id: imageId,
        is_primary: true,
        object_path: originalPath,
        order_id: orderId,
        previous_object_path: null,
        updated_at: "2026-11-04T12:00:00.000Z",
      }],
      error: null,
    });
    mocks.originalRead.mockResolvedValue({ id: imageId, signedUrl: "https://signed.example/original.jpg" });
    mocks.primaryPreviewRead.mockResolvedValue({ id: imageId, signedUrl: "https://signed.example/preview.webp", isPreview: true });
    mocks.previewRead.mockResolvedValue([{ id: imageId, signedUrl: "https://signed.example/preview.webp", isPreview: true }]);
  });

  it("generates and privately uploads one precomputed preview before committing an add", async () => {
    const result = await mutateOrderDesignImageAction({}, mutationInput("add", { byteSize: String(uploadedPng.length) }));

    expect(result.status).toBe("success");
    expect(mocks.download).toHaveBeenCalledWith(originalPath);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledWith(
      `${originalPath.slice(0, -4)}.preview.webp`,
      expect.any(Buffer),
      { contentType: "image/webp", cacheControl: "0", upsert: false },
    );
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.revalidate).toHaveBeenCalledWith(`/orders/${orderId}`);
  });

  it("rejects malformed image bytes before storage variants or database metadata are written", async () => {
    const bytes = Buffer.from("not an image");
    const before = Buffer.from(bytes);
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(bytes)], { type: "image/png" }), error: null });

    const result = await mutateOrderDesignImageAction({}, mutationInput("add", { byteSize: String(bytes.length) }));

    expect(result.status).toBe("error");
    expect(result.message).toBe("El contenido no es una imagen JPEG, PNG o WebP válida.");
    expect(bytes).toEqual(before);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not commit image metadata when the private preview upload fails", async () => {
    mocks.upload.mockRejectedValue(new Error("storage unavailable"));

    const result = await mutateOrderDesignImageAction({}, mutationInput("add", { byteSize: String(uploadedPng.length) }));

    expect(result.status).toBe("error");
    expect(result.message).toBe("No se pudo guardar la vista previa de la imagen.");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not regenerate a persisted preview when replaying a successful idempotent mutation", async () => {
    const query = eventQuery();
    query.maybeSingle.mockResolvedValue({ data: { id: "event-id" }, error: null });
    mocks.userFrom.mockReturnValue(query);

    const result = await mutateOrderDesignImageAction({}, mutationInput("add", { byteSize: String(uploadedPng.length) }));

    expect(result.status).toBe("success");
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("reuses the generated variant when its metadata commit is retried", async () => {
    const generate = vi.spyOn(previewGeneration, "generateOrderDesignImagePreview");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Temporary failure" } });
    mocks.info.mockResolvedValueOnce({ data: null, error: { statusCode: "404", message: "Object not found" } })
      .mockResolvedValueOnce({ data: { size: 100, contentType: "image/webp" }, error: null });
    const input = mutationInput("add", { byteSize: String(uploadedPng.length) });

    expect((await mutateOrderDesignImageAction({}, input)).status).toBe("error");
    expect((await mutateOrderDesignImageAction({}, input)).status).toBe("success");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it("cleans the previous preview after replacement and deletion, but leaves failed commits for reconciliation", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        action: "replace", byte_size: uploadedPng.length, content_type: "image/png", event_id: "event-id", image_id: imageId,
        is_primary: true, object_path: originalPath, order_id: orderId,
        previous_object_path: `orders/${orderId}/44444444-4444-4444-8444-444444444444.jpg`, updated_at: "2026-11-04T12:00:00.000Z",
      }],
      error: null,
    });

    await mutateOrderDesignImageAction({}, mutationInput("replace", { byteSize: String(uploadedPng.length) }));
    expect(mocks.remove).toHaveBeenCalledWith([`orders/${orderId}/44444444-4444-4444-8444-444444444444.preview.webp`]);

    mocks.remove.mockClear();
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        action: "delete", byte_size: null, content_type: null, event_id: "delete-event", image_id: imageId,
        is_primary: null, object_path: null, order_id: orderId,
        previous_object_path: originalPath, updated_at: "2026-11-04T12:00:00.000Z",
      }],
      error: null,
    });
    await mutateOrderDesignImageAction({}, mutationInput("delete"));
    expect(mocks.remove).toHaveBeenCalledWith([`${originalPath.slice(0, -4)}.preview.webp`]);

    mocks.remove.mockClear();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "El pedido cambió en otra sesión." } });
    await mutateOrderDesignImageAction({}, mutationInput("add", { byteSize: String(uploadedPng.length) }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("does not regenerate previews on a finalized upload retry", async () => {
    const query = eventQuery();
    query.maybeSingle.mockResolvedValue({
      data: {
        id: "event-id", order_id: orderId, object_path: originalPath,
        previous_object_path: null, image_updated_at: "2026-11-04T12:00:00.000Z",
      },
      error: null,
    });
    mocks.userFrom.mockReturnValue(query);
    mocks.rpc.mockResolvedValue({
      data: [{ event_id: "event-id", image_updated_at: "2026-11-04T12:00:00.000Z", object_path: originalPath, order_id: orderId, previous_object_path: null }],
      error: null,
    });
    const formData = new FormData();
    for (const [key, value] of Object.entries({
      orderId, objectPath: originalPath, contentType: "image/png", byteSize: String(uploadedPng.length),
      expectedImageUpdatedAt: "", idempotencyKey: "image-event-key",
    })) formData.set(key, value);

    const result = await finalizeOrderDesignImageAction({}, formData);

    expect(result.status).toBe("success");
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("generates the finalization preview only before its first metadata commit", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        event_id: "event-id", image_updated_at: "2026-11-04T12:00:00.000Z", object_path: originalPath,
        order_id: orderId, previous_object_path: null,
      }],
      error: null,
    });
    const formData = new FormData();
    for (const [key, value] of Object.entries({
      orderId, objectPath: originalPath, contentType: "image/png", byteSize: String(uploadedPng.length),
      expectedImageUpdatedAt: "", idempotencyKey: "first-finalization",
    })) formData.set(key, value);

    const result = await finalizeOrderDesignImageAction({}, formData);

    expect(result.status).toBe("success");
    expect(mocks.download).toHaveBeenCalledWith(originalPath);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("finalize_order_design_image", expect.objectContaining({
      p_object_path: originalPath,
      p_idempotency_key: "first-finalization",
    }));
  });

  it("preserves deliberate original reads and exposes separate primary and gallery preview actions", async () => {
    const formData = new FormData();
    formData.set("orderId", orderId);

    const original = await getOrderDesignImageReadUrlAction({}, formData);
    const preview = await getOrderDesignImagePreviewReadUrlAction({}, formData);
    const previews = await getOrderDesignImagesPreviewReadUrlsAction({}, formData);

    expect(original.status).toBe("success");
    expect(original.image?.signedUrl).toBe("https://signed.example/original.jpg");
    expect(mocks.originalRead).toHaveBeenCalledWith(orderId);
    expect(preview.status).toBe("success");
    expect(preview.image).toMatchObject({ isPreview: true, signedUrl: "https://signed.example/preview.webp" });
    expect(mocks.primaryPreviewRead).toHaveBeenCalledWith(orderId);
    expect(previews.status).toBe("success");
    expect(previews.images?.[0]?.signedUrl).toBe("https://signed.example/preview.webp");
    expect(mocks.previewRead).toHaveBeenCalledWith(orderId);
  });
});
