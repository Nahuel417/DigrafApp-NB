// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BoardOrder } from "../queries";
import { BoardBulkActions } from "./board-bulk-actions";

const orders: BoardOrder[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    publicNumber: 7,
    customerName: "Equipo M11",
    teamName: "Equipo M11",
    quantity: 1,
    label: null,
    promisedDeliveryDate: "2026-08-13",
    currentStageId: "received",
    updatedAt: "2026-08-12T19:00:00.000Z",
    primaryDesignImage: null,
    totalAmount: null,
    paymentConfirmedAt: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    publicNumber: 8,
    customerName: "Equipo M12",
    teamName: "Equipo M12",
    quantity: 2,
    label: null,
    promisedDeliveryDate: "2026-08-14",
    currentStageId: "delivered",
    updatedAt: "2026-08-12T20:00:00.000Z",
    primaryDesignImage: null,
    totalAmount: null,
    paymentConfirmedAt: null,
  },
];

afterEach(() => cleanup());

describe("board bulk actions", () => {
  it("keeps archive and cancellation separate and requires an explicit consequence confirmation", () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const view = render(<BoardBulkActions archivableOrderCount={1} isPending={false} onClearSelection={vi.fn()} onConfirm={onConfirm} results={[]} selectedOrders={orders} />);

    fireEvent.click(screen.getByRole("button", { name: "Archivar entregados (1)" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("Solo se archivarán los pedidos de la etapa Entregado");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onConfirm).not.toHaveBeenCalled();

    view.rerender(<BoardBulkActions archivableOrderCount={0} isPending={false} onClearSelection={vi.fn()} onConfirm={onConfirm} results={[]} selectedOrders={[orders[0]!]} />);
    fireEvent.click(screen.getByRole("button", { name: "Anular pedidos (1)" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("saldrán del tablero");
    fireEvent.change(screen.getByRole("textbox", { name: /Motivo de anulación/ }), { target: { value: "Cambio solicitado" } });
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar anulación" }));

    return waitFor(() => expect(onConfirm).toHaveBeenCalledWith("cancel", "Cambio solicitado"));
  });

  it("requires a valid shared reason and renders readable per-order failures", () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<BoardBulkActions
      archivableOrderCount={0}
      isPending={false}
      onClearSelection={vi.fn()}
      onConfirm={onConfirm}
      results={[{ message: "El pedido cambió en otra sesión. Actualizá el Archivo e intentá nuevamente.", orderId: orders[0]!.id, publicNumber: 7, status: "error" }]}
      selectedOrders={[orders[0]!]}
    />);

    expect(screen.getByRole("alert").textContent).toContain("PED-000007");
    expect(screen.getByRole("alert").textContent).toContain("El pedido cambió en otra sesión");
    expect(screen.getByRole("alert").className).toContain("bg-destructive/10");
    fireEvent.click(screen.getByRole("button", { name: "Anular pedidos (1)" }));
    expect(screen.getByRole("button", { name: "Confirmar anulación" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: /Motivo de anulación/ }), { target: { value: "x" } });
    expect(screen.getByRole("button", { name: "Confirmar anulación" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: /Motivo de anulación/ }), { target: { value: "ok" } });
    expect(screen.getByRole("button", { name: "Confirmar anulación" }).hasAttribute("disabled")).toBe(false);
  });

  it("rechecks a cancellation when the selection becomes blocked while its dialog is open", () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const blockedReason = "No se pueden anular pedidos pagados o entregados.";
    const props = {
      archivableOrderCount: 0,
      isPending: false,
      onClearSelection: vi.fn(),
      onConfirm,
      results: [],
    };
    const view = render(<BoardBulkActions {...props} selectedOrders={[orders[0]!]} />);

    fireEvent.click(screen.getByRole("button", { name: "Anular pedidos (1)" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Motivo de anulación/ }), { target: { value: "Motivo válido" } });
    view.rerender(<BoardBulkActions {...props} cancelBlockedReason={blockedReason} selectedOrders={[{ ...orders[0]!, currentStageId: "paid" }]} />);

    const confirmButton = screen.getByRole("button", { name: "Confirmar anulación" });
    expect(confirmButton.hasAttribute("disabled")).toBe(true);
    expect(within(screen.getByRole("alertdialog")).getByRole("alert").textContent).toContain(blockedReason);
    fireEvent.click(confirmButton);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not repeat successful per-order messages", () => {
    render(<BoardBulkActions
      archivableOrderCount={1}
      isPending={false}
      onClearSelection={vi.fn()}
      onConfirm={vi.fn()}
      results={[{ message: "Pedido anulado y enviado al Archivo.", orderId: orders[0]!.id, publicNumber: 7, status: "success" }]}
      selectedOrders={[orders[0]!]}
    />);

    expect(screen.queryByText("Pedido anulado y enviado al Archivo.")).toBeNull();
    expect(screen.queryByRole("region", { name: "Resultados de acciones masivas" })).toBeNull();
  });
});
