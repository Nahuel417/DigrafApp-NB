// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { getOrderDesignImagePreviewReadUrlAction } from "@/features/orders/image-actions";

import { OrderDesignPreviewProvider, useOrderDesignPreview } from "./order-design-preview-provider";

vi.mock("@/features/orders/image-actions", () => ({ getOrderDesignImagePreviewReadUrlAction: vi.fn() }));
afterEach(cleanup);

function PreviewConsumer() {
  const read = useOrderDesignPreview();
  const [url, setUrl] = useState("");
  return <><button onClick={async () => { const result = await read("order-id", "revision-1"); setUrl(result.image?.signedUrl ?? ""); }}>Load preview</button><output>{url}</output></>;
}

it("discards both cached URLs and rendered state when the authenticated scope changes", async () => {
  vi.mocked(getOrderDesignImagePreviewReadUrlAction).mockResolvedValue({
    status: "success",
    image: {
      id: "image-id", orderId: "order-id", objectPath: "orders/order-id/image.jpg",
      contentType: "image/jpeg", byteSize: 1, uploadedBy: "actor-id", isPrimary: true, isPreview: true,
      createdAt: "2026-11-04T12:00:00Z", updatedAt: "2026-11-04T12:00:00Z",
      signedUrl: "https://signed.example/private.webp", expiresAt: new Date(Date.now() + 300000).toISOString(),
    },
  });
  const { rerender } = render(<OrderDesignPreviewProvider sessionKey="first-user:attention"><PreviewConsumer /></OrderDesignPreviewProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Load preview" }));
  await waitFor(() => expect(screen.getByText("https://signed.example/private.webp")).toBeTruthy());
  rerender(<OrderDesignPreviewProvider sessionKey="second-user:employee"><PreviewConsumer /></OrderDesignPreviewProvider>);
  expect(screen.queryByText("https://signed.example/private.webp")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load preview" }));
  await waitFor(() => expect(getOrderDesignImagePreviewReadUrlAction).toHaveBeenCalledTimes(2));
});
