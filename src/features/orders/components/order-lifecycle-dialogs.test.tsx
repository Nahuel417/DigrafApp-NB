// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cancelOrderAction, restoreOrderAction } from "../cancellation-actions";

import { CancelOrderDialog, RestoreOrderDialog } from "./order-lifecycle-dialogs";

vi.mock("../cancellation-actions", () => ({
  cancelOrderAction: vi.fn(),
  restoreOrderAction: vi.fn(),
}));
vi.mock("@/hooks/use-mutation-toast", () => ({ useMutationToast: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const order = {
  orderId: "11111111-1111-4111-8111-111111111111",
  publicNumber: 12,
  customerName: "Equipo Norte",
  expectedUpdatedAt: "2026-08-14T12:00:00.000Z",
};

describe("order lifecycle dialogs", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cancelOrderAction).mockResolvedValue({});
    vi.mocked(restoreOrderAction).mockResolvedValue({});
  });

  it("requires explicit cancellation confirmation and a visible reason field", () => {
    render(<CancelOrderDialog {...order} />);
    fireEvent.click(screen.getByRole("button", { name: "Anular pedido" }));

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Anular PED-000012" })).toBeTruthy();
    expect(screen.getByLabelText("Motivo de anulación")).toBeTruthy();
    expect(screen.getByText(/quedará fuera del tablero y se conservará en el Archivo/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(cancelOrderAction).not.toHaveBeenCalled();
  });

  it("submits cancellation once with the reason and reports the pending label", async () => {
    render(<CancelOrderDialog {...order} />);
    fireEvent.click(screen.getByRole("button", { name: "Anular pedido" }));
    fireEvent.change(screen.getByLabelText("Motivo de anulación"), { target: { value: "Cliente pidió pausa" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar anulación" }));

    await waitFor(() => expect(cancelOrderAction).toHaveBeenCalledTimes(1));
    const formData = vi.mocked(cancelOrderAction).mock.calls[0]?.[1] as FormData;
    expect(formData.get("orderId")).toBe(order.orderId);
    expect(formData.get("reason")).toBe("Cliente pidió pausa");
  });

  it("confirms restoration separately and keeps the cancellation reason out of the form", () => {
    render(<RestoreOrderDialog {...order} />);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar pedido" }));

    expect(screen.getByRole("heading", { name: "Restaurar PED-000012" })).toBeTruthy();
    expect(screen.getByText(/volverá al tablero en su etapa operativa anterior/)).toBeTruthy();
    expect(screen.queryByLabelText("Motivo de anulación")).toBeNull();
  });
});
