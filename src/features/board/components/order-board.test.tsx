// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { confirmOrderPaymentAction, getOrderQuickViewAction, moveOrderAction, reconcileOrderAction, reverseOrderPaymentAction } from "../actions";
import { OrderBoard } from "./order-board";

vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/hooks/use-mutation-toast", () => ({ useMutationToast: vi.fn() }));
vi.mock("./order-design-thumbnail", () => ({ OrderDesignThumbnail: () => null }));
vi.mock("./order-quick-view", async () => await vi.importActual<typeof import("./order-quick-view")>("./order-quick-view"));
vi.mock("../actions", () => ({
  confirmOrderPaymentAction: vi.fn(),
  getOrderQuickViewAction: vi.fn(),
  moveOrderAction: vi.fn(),
  reconcileOrderAction: vi.fn(),
  reverseOrderPaymentAction: vi.fn(),
}));

const receivedId = "11111111-1111-4111-8111-111111111111";
const paidId = "22222222-2222-4222-8222-222222222222";
const order = {
  id: "33333333-3333-4333-8333-333333333333",
  publicNumber: 7,
  customerName: "Equipo M11",
  teamName: "Equipo M11",
  quantity: 1,
  orderType: "individual" as const,
  promisedDeliveryDate: "2026-08-13",
  currentStageId: receivedId,
  updatedAt: "2026-08-12T19:00:00.000Z",
  hasDesignImage: false,
  imageUpdatedAt: null,
  totalAmount: 100,
  paymentConfirmedAt: null,
};

const columns = [
  { id: receivedId, code: "received", name: "Pedido recibido", position: 0, orders: [order] },
  { id: paidId, code: "paid", name: "Pagado", position: 1, orders: [] },
];

beforeEach(() => {
  vi.mocked(confirmOrderPaymentAction).mockReset();
  vi.mocked(getOrderQuickViewAction).mockReset();
  vi.mocked(moveOrderAction).mockReset();
  vi.mocked(reconcileOrderAction).mockReset();
  vi.mocked(reverseOrderPaymentAction).mockReset();
});

afterEach(() => cleanup());

function choosePaid() {
  const trigger = screen.getByRole("combobox", { name: "Mover PED-000007 a" });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("option", { name: "Pagado" }));
  fireEvent.click(screen.getByRole("button", { name: "Mover pedido" }));
}

function getColumn(name: string) {
  const column = screen.getByRole("heading", { name: new RegExp(`^${name}$`) }).closest("section");
  if (!(column instanceof HTMLElement)) throw new Error(`No se encontró la columna ${name}.`);
  return column;
}

function getOrderCard() {
  const card = screen.getByRole("button", { hidden: true, name: "Vista rápida de PED-000007" }).closest("article");
  if (!(card instanceof HTMLElement)) throw new Error("No se encontró la tarjeta del pedido.");
  return card;
}

describe("order board payment confirmation", () => {
  it("opens the confirmation dialog without moving the card", () => {
    render(<OrderBoard canConfirmPayment canCreateOrders={false} initialColumns={columns} />);

    choosePaid();

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Confirmar cobro" })).toBeTruthy();
    expect(within(screen.getByRole("alertdialog")).getByText("Equipo M11", { exact: true })).toBeTruthy();
    expect(screen.getByText("$ 100,00")).toBeTruthy();
    expect(screen.getByText("Destino")).toBeTruthy();
    expect(screen.getAllByText("Pagado").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("board-announcement").textContent).toContain("Se abrió la confirmación de cobro");
    expect(confirmOrderPaymentAction).not.toHaveBeenCalled();
    expect(screen.getByTestId("board-announcement").textContent).toContain("PED-000007");
  });

  it("cancels without mutation and confirms through the payment action", async () => {
    vi.mocked(confirmOrderPaymentAction).mockResolvedValue({ status: "success", message: "ok", toastId: "success", paymentId: "payment-id", reconciledOrder: { ...order, currentStageId: paidId, paymentConfirmedAt: "2026-08-12T19:01:00.000Z" } });
    render(<OrderBoard canConfirmPayment canCreateOrders={false} initialColumns={columns} />);

    choosePaid();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByTestId("board-announcement").textContent).toContain("Cancelaste");

    choosePaid();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cobro" }));
    await waitFor(() => expect(confirmOrderPaymentAction).toHaveBeenCalledTimes(1));
    const formData = vi.mocked(confirmOrderPaymentAction).mock.calls[0]?.[1] as FormData;
    expect(formData.get("orderId")).toBe(order.id);
    expect(formData.get("expectedUpdatedAt")).toBe(order.updatedAt);
  });

  it("replaces the board order with the canonical paid snapshot after success", async () => {
    vi.mocked(confirmOrderPaymentAction).mockResolvedValue({
      status: "success",
      message: "PED-000007 quedó confirmado como Pagado.",
      toastId: "success",
      paymentId: "payment-id",
      reconciledOrder: { ...order, currentStageId: paidId, updatedAt: "2026-08-12T19:01:00.000Z", paymentConfirmedAt: "2026-08-12T19:01:00.000Z" },
    });
    render(<OrderBoard canConfirmPayment canCreateOrders={false} initialColumns={columns} />);

    choosePaid();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cobro" }));

    await waitFor(() => expect(confirmOrderPaymentAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(within(getColumn("Pagado")).getByRole("link", { name: /^Equipo M11$/ })).toBeTruthy());
    expect(within(getColumn("Pedido recibido")).queryByRole("link", { name: /^Equipo M11$/ })).toBeNull();
    expect(screen.getByTestId("board-announcement").textContent).toContain("quedó confirmado como Pagado");
  });

  it("replaces the board order with the canonical paid snapshot after a recoverable rejection", async () => {
    vi.mocked(confirmOrderPaymentAction).mockResolvedValue({
      status: "error",
      code: "already_paid",
      message: "El pedido ya está pagado.",
      toastId: "already-paid",
      reconciledOrder: { ...order, currentStageId: paidId, updatedAt: "2026-08-12T19:01:00.000Z", paymentConfirmedAt: "2026-08-12T19:01:00.000Z" },
    });
    render(<OrderBoard canConfirmPayment canCreateOrders={false} initialColumns={columns} />);

    choosePaid();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cobro" }));

    await waitFor(() => expect(confirmOrderPaymentAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(within(getColumn("Pagado")).getByRole("link", { name: /^Equipo M11$/ })).toBeTruthy());
    expect(within(getColumn("Pedido recibido")).queryByRole("link", { name: /^Equipo M11$/ })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("El pedido ya está pagado.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("does not offer Pagado as an Employee destination", () => {
    render(<OrderBoard canConfirmPayment={false} canCreateOrders={false} initialColumns={[{ ...columns[0], orders: [{ ...order, totalAmount: null }] }, columns[1]]} />);

    const trigger = screen.getByRole("combobox", { name: "Mover PED-000007 a" });
    fireEvent.click(trigger);

    expect(screen.queryByRole("option", { name: "Pagado" })).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(trigger);
    expect(within(getOrderCard()).getByRole("link", { hidden: true, name: /^Equipo M11$/ })).toBeTruthy();
    expect(confirmOrderPaymentAction).not.toHaveBeenCalled();
  });
});

describe("order board payment reversal", () => {
  it("requires confirmation, keeps cancellation side-effect free, and blocks duplicate submits", async () => {
    vi.mocked(getOrderQuickViewAction).mockResolvedValue({ data: { ...order, description: null, stageName: "Pagado", stageCode: "paid", expectedUpdatedAt: "2026-08-12T19:01:00.000Z", canReversePayment: true, paymentId: "44444444-4444-4444-8444-444444444444", canEditDescription: false, canEditSensitive: true, lastMovement: null, comments: [] } });
    let resolveAction!: (value: Awaited<ReturnType<typeof reverseOrderPaymentAction>>) => void;
    vi.mocked(reverseOrderPaymentAction).mockReturnValue(new Promise((resolve) => { resolveAction = resolve; }));
    render(<OrderBoard canConfirmPayment canCreateOrders={false} initialColumns={[{ ...columns[0], orders: [] }, { ...columns[1], orders: [{ ...order, currentStageId: paidId, paymentConfirmedAt: "2026-08-12T19:01:00.000Z" }] }]} />);

    fireEvent.click(screen.getByRole("button", { name: "Vista rápida de PED-000007" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Revertir pago" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Revertir pago" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(reverseOrderPaymentAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Revertir pago" }));
    const dialog = screen.getByRole("alertdialog");
    const submit = within(dialog).getByRole("button", { name: "Revertir pago" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(reverseOrderPaymentAction).toHaveBeenCalledTimes(1);
    resolveAction({ status: "success", message: "ok", toastId: "ok", paymentId: "44444444-4444-4444-8444-444444444444", reconciledOrder: { ...order, currentStageId: receivedId } });
  });
});
