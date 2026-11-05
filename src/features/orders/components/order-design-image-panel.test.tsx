// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOrderDesignImagesPreviewReadUrlsAction } from "@/features/orders/image-actions";

import { OrderDesignImagePanel } from "./order-design-image-panel";

vi.mock("@/features/orders/image-actions", () => ({
  getOrderDesignImagesPreviewReadUrlsAction: vi.fn(),
  mutateOrderDesignImageAction: vi.fn(),
  startOrderDesignImageUploadAction: vi.fn(),
}));
vi.mock("@/lib/supabase/browser", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const orderId = "22222222-2222-4222-8222-222222222222";
const image = {
  id: "image-id",
  orderId,
  objectPath: `orders/${orderId}/image.jpg`,
  contentType: "image/jpeg" as const,
  byteSize: 413032,
  uploadedBy: "actor-id",
  createdAt: "2026-11-04T12:00:00.000Z",
  updatedAt: "2026-11-04T12:00:00.000Z",
  expiresAt: "2026-11-04T12:05:00.000Z",
  signedUrl: "https://signed.example/preview.webp",
  isPrimary: true,
  isPreview: false,
};
const renewedImage = {
  ...image,
  expiresAt: "2026-11-04T13:05:00.000Z",
  signedUrl: "https://signed.example/renewed-preview.webp",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T12:00:00.000Z"));
  vi.clearAllMocks();
  vi.mocked(getOrderDesignImagesPreviewReadUrlsAction).mockResolvedValue({
    status: "success",
    images: [renewedImage],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderPanel() {
  render(<OrderDesignImagePanel canManage={false} initialImages={[image]} orderId={orderId} />);
}

describe("order design preview renewal", () => {
  it("keeps the existing image URL without requests while idle past expiry", async () => {
    renderPanel();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });

    expect(getOrderDesignImagesPreviewReadUrlsAction).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Diseño vigente del pedido" }).getAttribute("src")).toBe(image.signedUrl);
  });

  it("still renews on explicit request after the initial URL expires", async () => {
    renderPanel();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      fireEvent.click(screen.getByRole("button", { name: "Renovar vista" }));
    });

    expect(getOrderDesignImagesPreviewReadUrlsAction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getOrderDesignImagesPreviewReadUrlsAction).mock.calls[0]![1].get("orderId")).toBe(orderId);
    expect(screen.getByRole("img", { name: "Diseño vigente del pedido" }).getAttribute("src")).toBe(renewedImage.signedUrl);
  });

  it("still renews when an image fails to load", async () => {
    renderPanel();

    await act(async () => {
      fireEvent.error(screen.getByRole("img", { name: "Diseño vigente del pedido" }));
    });

    expect(getOrderDesignImagesPreviewReadUrlsAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("img", { name: "Diseño vigente del pedido" }).getAttribute("src")).toBe(renewedImage.signedUrl);
  });

  it("preserves the image and reports a rejected renewal", async () => {
    vi.mocked(getOrderDesignImagesPreviewReadUrlsAction).mockResolvedValue({
      status: "error",
      message: "No tenés permiso para ver este pedido.",
    });
    renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Renovar vista" }));
    });

    expect(getOrderDesignImagesPreviewReadUrlsAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain("No tenés permiso para ver este pedido.");
    expect(screen.getByRole("img", { name: "Diseño vigente del pedido" }).getAttribute("src")).toBe(image.signedUrl);
  });

  it("opens the validated original route explicitly instead of treating the thumbnail as full size", () => {
    renderPanel();

    const link = screen.getByRole("link", { name: "Ver original" });
    expect(link.getAttribute("href")).toBe(`/orders/${orderId}/designs/${image.id}/original`);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("img", { name: "Diseño vigente del pedido" }).getAttribute("src")).toBe(image.signedUrl);
  });
});
