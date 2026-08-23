// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { archiveDeliveredOrderAction, cancelOrderAction, purgeCancelledOrderAction, restoreOrderAction, unarchiveDeliveredOrderAction } from "../cancellation-actions";

import { ArchiveDeliveredOrderDialog, CancelOrderDialog, PurgeCancelledOrderDialog, RestoreOrderDialog, UnarchiveDeliveredOrderDialog } from "./order-lifecycle-dialogs";

vi.mock("../cancellation-actions", () => ({
  archiveDeliveredOrderAction: vi.fn(),
  cancelOrderAction: vi.fn(),
  purgeCancelledOrderAction: vi.fn(),
  restoreOrderAction: vi.fn(),
  unarchiveDeliveredOrderAction: vi.fn(),
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
    vi.mocked(archiveDeliveredOrderAction).mockResolvedValue({});
    vi.mocked(cancelOrderAction).mockResolvedValue({});
    vi.mocked(purgeCancelledOrderAction).mockResolvedValue({});
    vi.mocked(restoreOrderAction).mockResolvedValue({});
    vi.mocked(unarchiveDeliveredOrderAction).mockResolvedValue({});
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

  it("requires confirmation before archiving a delivered order", () => {
    render(<ArchiveDeliveredOrderDialog {...order} />);
    fireEvent.click(screen.getByRole("button", { name: "Archivar entregado" }));

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/se conservará indefinidamente/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(archiveDeliveredOrderAction).not.toHaveBeenCalled();
  });

  it("separates reversible unarchive from irreversible purge confirmation", () => {
    render(<>
      <UnarchiveDeliveredOrderDialog {...order} />
      <PurgeCancelledOrderDialog {...order} />
    </>);
    fireEvent.click(screen.getByRole("button", { name: "Retirar del archivo de entregados" }));
    expect(screen.getByText(/volverá al tablero/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: "Purgar pedido" }));
    expect(screen.getByText(/no se puede deshacer/i)).toBeTruthy();
    expect(screen.getByRole("alertdialog").textContent).toContain("solo se podrá ejecutar después de 30 días");
  });
});
