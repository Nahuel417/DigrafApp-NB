import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockImplementation(async () => ({ data: mocks.rows, error: null }));
  return {
    query,
    rows: [] as Record<string, unknown>[],
    profile: vi.fn(),
    sign: vi.fn(),
  };
});

vi.mock("@/lib/auth/current-profile", () => ({ getCurrentProfile: mocks.profile }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => mocks.query, storage: { from: () => ({ createSignedUrl: mocks.sign }) } }),
}));

import {
  getOrderDesignImageOriginalReadUrl,
  getOrderDesignImageReadUrl,
  getOrderDesignImagesPreviewReadUrls,
} from "./image-queries";

const orderId = "11111111-1111-4111-8111-111111111111";
const imageId = "22222222-2222-4222-8222-222222222222";
const originalPath = `orders/${orderId}/33333333-3333-4333-8333-333333333333.png`;
const imageRow = {
  id: imageId,
  order_id: orderId,
  object_path: originalPath,
  content_type: "image/png",
  byte_size: 40,
  uploaded_by: "actor-id",
  created_at: "2026-11-04T12:00:00.000Z",
  updated_at: "2026-11-04T12:00:00.000Z",
  is_primary: true,
};

describe("private order design image URLs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [imageRow];
    mocks.profile.mockResolvedValue({ isActive: true, mustChangePassword: false, role: "admin" });
    mocks.sign.mockImplementation(async (path: string, expiresIn: number) => ({
      data: { signedUrl: `https://signed.example/${path}` }, error: null,
    }));
  });

  it("signs the precomputed WebP sibling for previews with the existing private URL lifetime", async () => {
    const images = await getOrderDesignImagesPreviewReadUrls(orderId);

    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      isPreview: true,
      signedUrl: `https://signed.example/orders/${orderId}/33333333-3333-4333-8333-333333333333.preview.webp`,
    });
    expect(mocks.sign).toHaveBeenCalledWith(
      `orders/${orderId}/33333333-3333-4333-8333-333333333333.preview.webp`,
      300,
    );
  });

  it("falls back to the original only when a legacy preview object is missing", async () => {
    mocks.sign.mockImplementation(async (path: string) => path.endsWith(".preview.webp")
      ? { data: null, error: { message: "Object not found" } }
      : { data: { signedUrl: `https://signed.example/${path}` }, error: null });

    const [image] = await getOrderDesignImagesPreviewReadUrls(orderId);

    expect(image).toMatchObject({ isPreview: false, signedUrl: `https://signed.example/${originalPath}` });
    expect(mocks.sign).toHaveBeenCalledTimes(2);
  });

  it("retains the deliberate original URL helpers instead of relabeling a preview", async () => {
    mocks.sign.mockImplementation(async (path: string) => ({
      data: { signedUrl: `https://signed.example/${path}` }, error: null,
    }));

    const primary = await getOrderDesignImageReadUrl(orderId);
    const selected = await getOrderDesignImageOriginalReadUrl(orderId, imageId);

    expect(primary?.signedUrl).toBe(`https://signed.example/${originalPath}`);
    expect(selected?.signedUrl).toBe(`https://signed.example/${originalPath}`);
    expect(mocks.sign).toHaveBeenNthCalledWith(1, originalPath, 300);
    expect(mocks.sign).toHaveBeenNthCalledWith(2, originalPath, 300);
  });

  it("does not fall back to originals when preview signing fails for another reason", async () => {
    mocks.sign.mockResolvedValue({ data: null, error: { message: "Storage unavailable" } });

    await expect(getOrderDesignImagesPreviewReadUrls(orderId)).rejects.toThrow("No se pudo generar el acceso temporal a la imagen.");
    expect(mocks.sign).toHaveBeenCalledOnce();
  });

  it("rejects an invalid original image identifier before signing storage URLs", async () => {
    await expect(getOrderDesignImageOriginalReadUrl(orderId, "not-a-uuid")).resolves.toBeNull();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("keeps missing, inactive, and password-pending profiles from receiving signed previews", async () => {
    for (const profile of [null, { isActive: false, mustChangePassword: false }, { isActive: true, mustChangePassword: true }]) {
      mocks.profile.mockResolvedValue(profile);
      await expect(getOrderDesignImagesPreviewReadUrls(orderId)).resolves.toEqual([]);
    }
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
