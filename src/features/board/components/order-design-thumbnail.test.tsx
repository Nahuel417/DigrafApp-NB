// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  getOrderDesignImagePreviewReadUrlAction,
  getOrderDesignImageReadUrlAction,
} from "@/features/orders/image-actions";

import { OrderDesignThumbnail } from "./order-design-thumbnail";

vi.mock("@/features/orders/image-actions", () => ({
  getOrderDesignImagePreviewReadUrlAction: vi.fn(),
  getOrderDesignImageReadUrlAction: vi.fn(),
}));

describe("order design thumbnail", () => {
  it("renders an accessible placeholder without requesting a non-primary image", () => {
    render(<OrderDesignThumbnail alt="Diseño del pedido" imageUpdatedAt={null} orderId="order-id" />);

    expect(screen.getByRole("img", { name: "No hay diseño principal" })).toBeTruthy();
    expect(getOrderDesignImagePreviewReadUrlAction).not.toHaveBeenCalled();
    expect(getOrderDesignImageReadUrlAction).not.toHaveBeenCalled();
  });

  it("loads and retries the selected primary preview while preserving its signed URL callback", async () => {
    vi.mocked(getOrderDesignImagePreviewReadUrlAction).mockResolvedValue({
      image: {
        byteSize: 1,
        contentType: "image/png",
        createdAt: "2026-08-18T09:00:00.000Z",
        expiresAt: "2026-08-18T10:05:00.000Z",
        id: "image-id",
        isPrimary: true,
        objectPath: "orders/order-id/image-id.png",
        orderId: "order-id",
        signedUrl: "https://signed.example/image.png",
        updatedAt: "2026-08-18T10:00:00.000Z",
        uploadedBy: "actor-id",
        isPreview: true,
      },
      message: "Vista previa renovada.",
      status: "success",
      toastId: "toast-id",
    });
    const onUrlReady = vi.fn();

    render(<OrderDesignThumbnail alt="Diseño del pedido" imageUpdatedAt="2026-08-18T10:00:00.000Z" onUrlReady={onUrlReady} orderId="order-id" />);

    await waitFor(() => expect(screen.getByRole("img", { name: "Diseño del pedido" })).toBeTruthy());
    const image = screen.getByRole("img", { name: "Diseño del pedido" });
    expect(image.getAttribute("src")).toBe("https://signed.example/image.png");
    expect(onUrlReady).toHaveBeenCalledWith("https://signed.example/image.png", "image-id");
    expect(getOrderDesignImagePreviewReadUrlAction).toHaveBeenCalledTimes(1);
    expect(getOrderDesignImageReadUrlAction).not.toHaveBeenCalled();

    image.dispatchEvent(new Event("error"));
    await waitFor(() => expect(getOrderDesignImagePreviewReadUrlAction).toHaveBeenCalledTimes(2));
  });
});
