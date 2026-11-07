// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OrderQuickView as OrderQuickViewData } from "../actions";
import type { BoardOrder } from "../queries";

vi.mock("../actions", () => ({ reverseOrderPaymentAction: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props} data-prefetch={String(prefetch)} />,
}));
vi.mock("./order-design-thumbnail", () => ({
  OrderDesignThumbnail: ({ onActivate, onUrlReady }: {
    onActivate?: (trigger: HTMLButtonElement) => void;
    onUrlReady?: (url: string, imageId: string) => void;
  }) => (
    <button
      aria-label="Abrir diseño de Cliente"
      onClick={(event) => {
        onUrlReady?.("https://signed.example/preview.webp", "22222222-2222-4222-8222-222222222222");
        onActivate?.(event.currentTarget);
      }}
      type="button"
    >
      Preview
    </button>
  ),
}));

import { OrderQuickView } from "./order-quick-view";
afterEach(cleanup);

const orderId = "11111111-1111-4111-8111-111111111111";
const imageId = "22222222-2222-4222-8222-222222222222";

const data: OrderQuickViewData & Pick<BoardOrder, "label" | "primaryDesignImage" | "productName"> = {
  id: orderId,
  publicNumber: 1,
  customerName: "Cliente",
  teamName: "Equipo",
  quantity: 1,
  orderType: "individual",
  promisedDeliveryDate: "2026-11-05",
  description: null,
  stageName: "En producción",
  stageCode: "production",
  expectedUpdatedAt: "2026-11-04T12:00:00.000Z",
  canReversePayment: false,
  paymentId: null,
  canEditDescription: false,
  canEditSensitive: false,
  lastMovement: null,
  comments: [],
  label: null,
  primaryDesignImage: { updatedAt: "2026-11-04T12:00:00.000Z" },
  productName: "Remera",
};

describe("order quick-view design expansion", () => {
  it("does not prefetch private detail or edit data before an intentional visit", () => {
    render(<OrderQuickView data={{ ...data, canEditDescription: true }} isLabelPending={false} onClose={vi.fn()} onLabelChange={vi.fn()} onReconciled={vi.fn()} stageNames={{}} />);

    expect(screen.getByRole("link", { name: "Ver detalle" }).getAttribute("data-prefetch")).toBe("false");
    expect(screen.getByRole("link", { name: "Editar pedido" }).getAttribute("data-prefetch")).toBe("false");
  });

  it("loads the original only after the preview is explicitly expanded", async () => {
    render(
      <OrderQuickView
        data={data}
        isLabelPending={false}
        onClose={vi.fn()}
        onLabelChange={vi.fn()}
        onReconciled={vi.fn()}
        stageNames={{}}
      />,
    );

    expect(screen.queryByRole("img", { name: "Diseño ampliado de Cliente" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Abrir diseño de Cliente" }));

    const expandedImage = await waitFor(() => screen.getByRole("img", { name: "Diseño ampliado de Cliente" }));
    expect(expandedImage.getAttribute("src")).toBe(`/orders/${orderId}/designs/${imageId}/original`);
    expect(expandedImage.getAttribute("src")).not.toBe("https://signed.example/preview.webp");
  });
});
