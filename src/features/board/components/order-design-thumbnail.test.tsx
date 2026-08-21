// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getOrderDesignImageReadUrlAction } from "@/features/orders/image-actions";

import { OrderDesignThumbnail } from "./order-design-thumbnail";

vi.mock("@/features/orders/image-actions", () => ({
  getOrderDesignImageReadUrlAction: vi.fn(),
}));

describe("order design thumbnail", () => {
  it("renders an accessible placeholder without requesting a non-primary image", () => {
    render(<OrderDesignThumbnail alt="Diseño del pedido" imageUpdatedAt={null} orderId="order-id" />);

    expect(screen.getByRole("img", { name: "No hay diseño principal" })).toBeTruthy();
    expect(getOrderDesignImageReadUrlAction).not.toHaveBeenCalled();
  });

  it("loads only the selected primary image when its projection exists", async () => {
    vi.mocked(getOrderDesignImageReadUrlAction).mockResolvedValue({
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
      },
      message: "Acceso temporal renovado.",
      status: "success",
      toastId: "toast-id",
    });

    render(<OrderDesignThumbnail alt="Diseño del pedido" imageUpdatedAt="2026-08-18T10:00:00.000Z" orderId="order-id" />);

    await waitFor(() => expect(screen.getByRole("img", { name: "Diseño del pedido" })).toBeTruthy());
    expect(getOrderDesignImageReadUrlAction).toHaveBeenCalledTimes(1);
  });
});
