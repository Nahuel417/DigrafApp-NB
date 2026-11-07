import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ original: vi.fn() }));
vi.mock("@/features/orders/image-queries", () => ({ getOrderDesignImageOriginalReadUrl: mocks.original }));

import { GET } from "./route";

const params = Promise.resolve({
  orderId: "11111111-1111-4111-8111-111111111111",
  imageId: "22222222-2222-4222-8222-222222222222",
});

describe("original order-design route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects only to the authorized signed original without caching", async () => {
    mocks.original.mockResolvedValue({ signedUrl: "https://private.example/original.jpg" });

    const response = await GET(new Request("https://app.example/orders"), { params });

    expect(mocks.original).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://private.example/original.jpg");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("does not reveal missing or unauthorized images", async () => {
    mocks.original.mockResolvedValue(null);

    const response = await GET(new Request("https://app.example/orders"), { params });

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });
});
