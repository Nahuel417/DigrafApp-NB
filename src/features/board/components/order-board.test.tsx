// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { confirmOrderPaymentAction, getOrderQuickViewAction, moveOrderAction, reconcileOrderAction, reconcileOrderLabelAction, reverseOrderPaymentAction, setOrderLabelAction } from "../actions";
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
  reconcileOrderLabelAction: vi.fn(),
  reverseOrderPaymentAction: vi.fn(),
  setOrderLabelAction: vi.fn(),
}));
const receivedId = "11111111-1111-4111-8111-111111111111";
const paidId = "22222222-2222-4222-8222-222222222222";
const deliveredId = "55555555-5555-4555-8555-555555555555";
const order = {
  id: "33333333-3333-4333-8333-333333333333",
  publicNumber: 7,
  customerName: "Equipo M11",
  teamName: "Equipo M11",
  quantity: 1,
  orderType: "individual" as const,
  label: null,
  productName: "SUP1",
  promisedDeliveryDate: "2026-08-13",
  currentStageId: receivedId,
  updatedAt: "2026-08-12T19:00:00.000Z",
  primaryDesignImage: null,
  totalAmount: 100,
  paymentConfirmedAt: null,
};

const columns = [
  { id: receivedId, code: "received", name: "Pedido recibido", position: 0, orders: [order] },
  { id: paidId, code: "paid", name: "Pagado", position: 1, orders: [] },
  { id: deliveredId, code: "delivered", name: "Entregado", position: 2, orders: [] },
];

beforeEach(() => {
  vi.mocked(confirmOrderPaymentAction).mockReset();
  vi.mocked(getOrderQuickViewAction).mockReset();
  vi.mocked(moveOrderAction).mockReset();
  vi.mocked(reconcileOrderAction).mockReset();
  vi.mocked(reconcileOrderLabelAction).mockReset();
  vi.mocked(reverseOrderPaymentAction).mockReset();
  vi.mocked(setOrderLabelAction).mockReset();
});

afterEach(() => cleanup());

function choosePaid() {
  fireEvent.click(within(getOrderCard()).getByText("Mostrar movimiento"));
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
  it("selects one stage and supports arrow-key navigation", () => {
    render(<OrderBoard canConfirmPayment canCreateOrders={false} initialColumns={columns} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(columns.length);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("mobile-stage-panel-received").classList.contains("block")).toBe(true);
    expect(screen.getByTestId("mobile-stage-panel-paid").classList.contains("hidden")).toBe(true);

    fireEvent.click(tabs[1]);
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("mobile-stage-panel-received").classList.contains("hidden")).toBe(true);
    expect(screen.getByTestId("mobile-stage-panel-paid").classList.contains("block")).toBe(true);

    fireEvent.keyDown(tabs[1], { key: "ArrowRight" });
    expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[2]);
  });

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
    render(<OrderBoard canConfirmPayment={false} canDeliverPaidOrders={false} canCreateOrders={false} initialColumns={[{ ...columns[0], orders: [{ ...order, totalAmount: null }] }, columns[1], columns[2]]} />);

    fireEvent.click(within(getOrderCard()).getByText("Mostrar movimiento"));
    const trigger = screen.getByRole("combobox", { name: "Mover PED-000007 a" });
    fireEvent.click(trigger);

    expect(screen.queryByRole("option", { name: "Pagado" })).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(trigger);
    expect(within(getOrderCard()).getByRole("link", { hidden: true, name: /^Equipo M11$/ })).toBeTruthy();
    expect(confirmOrderPaymentAction).not.toHaveBeenCalled();
  });

  it("offers only Entregado for an authorized paid order", () => {
    const paidOrder = { ...order, currentStageId: paidId, paymentConfirmedAt: "2026-08-12T19:01:00.000Z" };
    render(<OrderBoard canConfirmPayment canDeliverPaidOrders canCreateOrders={false} initialColumns={[{ ...columns[0], orders: [] }, { ...columns[1], orders: [paidOrder] }, columns[2]]} />);

    fireEvent.click(within(getOrderCard()).getByText("Mostrar movimiento"));
    fireEvent.click(screen.getByRole("combobox", { name: "Mover PED-000007 a" }));

    expect(screen.getByRole("option", { name: "Entregado" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Pedido recibido" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Pagado" })).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("does not offer or execute paid to Entregado for Employee", () => {
    const paidOrder = { ...order, currentStageId: paidId, paymentConfirmedAt: "2026-08-12T19:01:00.000Z" };
    render(<OrderBoard canConfirmPayment={false} canDeliverPaidOrders={false} canCreateOrders={false} initialColumns={[{ ...columns[0], orders: [] }, { ...columns[1], orders: [paidOrder] }, columns[2]]} />);

    expect(screen.queryByRole("combobox", { name: "Mover PED-000007 a" })).toBeNull();
    expect(screen.getByLabelText("No se puede arrastrar PED-000007").hasAttribute("disabled")).toBe(true);
    expect(moveOrderAction).not.toHaveBeenCalled();
  });

});

describe("order board payment reversal", () => {
  it("requires confirmation, keeps cancellation side-effect free, and blocks duplicate submits", async () => {
    vi.mocked(getOrderQuickViewAction).mockResolvedValue({ data: { ...order, description: null, stageName: "Pagado", stageCode: "paid", expectedUpdatedAt: "2026-08-12T19:01:00.000Z", canReversePayment: true, paymentId: "44444444-4444-4444-8444-444444444444", canEditDescription: false, canEditSensitive: true, lastMovement: null, comments: [
      { actor: "Último actor", body: "Comentario actual", occurredAt: "2026-08-12T19:01:00.000Z", id: "comment-1" },
      { actor: "Actor anterior", body: "Comentario anterior", occurredAt: "2026-08-11T19:01:00.000Z", id: "comment-2" },
    ] } });
    let resolveAction!: (value: Awaited<ReturnType<typeof reverseOrderPaymentAction>>) => void;
    vi.mocked(reverseOrderPaymentAction).mockReturnValue(new Promise((resolve) => { resolveAction = resolve; }));
    render(<OrderBoard canConfirmPayment canCreateOrders={false} initialColumns={[{ ...columns[0], orders: [] }, { ...columns[1], orders: [{ ...order, currentStageId: paidId, paymentConfirmedAt: "2026-08-12T19:01:00.000Z" }] }]} />);

    const quickViewTrigger = screen.getByRole("button", { name: "Vista rápida de PED-000007" });
    fireEvent.click(quickViewTrigger);
    await waitFor(() => expect(screen.getByRole("button", { name: "Revertir pago" })).toBeTruthy());
    const quickView = screen.getByRole("dialog", { name: "Vista rápida de PED-000007" });
    expect(quickView).toBeTruthy();
    expect(within(quickView).getByRole("heading", { name: "Equipo M11" }).tagName).toBe("H2");
    expect(within(quickView).getByText("SUP1")).toBeTruthy();
    expect(within(quickView).getByText("Último actor")).toBeTruthy();
    expect(within(quickView).getByText("Comentario actual")).toBeTruthy();
    expect(within(quickView).queryByText("Comentario anterior")).toBeNull();
    expect(within(quickView).getByRole("heading", { name: "Último comentario" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar vista rápida" }));
    await waitFor(() => expect(document.activeElement).toBe(quickViewTrigger));
    expect(screen.queryByRole("dialog", { name: "Vista rápida de PED-000007" })).toBeNull();

    fireEvent.click(quickViewTrigger);
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

describe("delivered order archive", () => {
  it("does not offer archiving from the board", () => {
    const deliveredOrder = { ...order, id: "66666666-6666-4666-8666-666666666666", customerName: "Entregado M16", currentStageId: deliveredId };
    const deliveredColumns = [
      { ...columns[0], orders: [] },
      columns[1],
      { id: deliveredId, code: "delivered", name: "Entregado", position: 2, orders: [deliveredOrder] },
    ];
    render(<OrderBoard canConfirmPayment={false} canCreateOrders={false} initialColumns={deliveredColumns} />);

    expect(screen.queryByRole("button", { name: "Archivar entregado" })).toBeNull();
    expect(within(getColumn("Entregado")).getByRole("link", { name: "Entregado M16" })).toBeTruthy();
  });
});

describe("order labels", () => {
  it("shows the quick view selector and persists an assigned label without a success notification", async () => {
    vi.mocked(getOrderQuickViewAction).mockResolvedValue({ data: { ...order, description: null, stageName: "Pedido recibido", stageCode: "received", expectedUpdatedAt: order.updatedAt, canReversePayment: false, paymentId: null, canEditDescription: false, canEditSensitive: false, lastMovement: null, comments: [] } });
    vi.mocked(setOrderLabelAction).mockResolvedValue({
      status: "success",
      message: "La etiqueta del pedido fue actualizada.",
      toastId: "label-success",
      updatedOrder: { label: "urgent", updatedAt: "2026-08-12T19:01:00.000Z" },
    });
    render(<OrderBoard canConfirmPayment={false} canCreateOrders={false} initialColumns={columns} />);

    fireEvent.click(screen.getByRole("button", { name: "Vista rápida de PED-000007" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Etiqueta de PED-000007" })).toBeTruthy());
    expect(within(getOrderCard()).queryByRole("combobox", { name: "Etiqueta de PED-000007" })).toBeNull();
    fireEvent.click(screen.getByRole("combobox", { name: "Etiqueta de PED-000007" }));
    const quickView = screen.getByRole("dialog", { name: "Vista rápida de PED-000007" });
    expect(within(quickView).getByRole("option", { name: "Urgente" })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "Urgente" }));

    await waitFor(() => expect(setOrderLabelAction).toHaveBeenCalledTimes(1));
    expect((vi.mocked(setOrderLabelAction).mock.calls[0]?.[1] as FormData).get("label")).toBe("urgent");
    expect((vi.mocked(setOrderLabelAction).mock.calls[0]?.[1] as FormData).get("idempotencyKey")).toBeNull();
    await waitFor(() => expect(screen.getByLabelText("Etiqueta Urgente")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("filters the board by label without putting an assignment control on the card", () => {
    const urgentOrder = { ...order, id: "77777777-7777-4777-8777-777777777777", publicNumber: 8, customerName: "Urgente", label: "urgent" as const };
    render(<OrderBoard canConfirmPayment={false} canCreateOrders={false} initialColumns={[{ ...columns[0], orders: [order, urgentOrder] }, columns[1], columns[2]]} />);

    fireEvent.click(screen.getByText("Etiqueta", { exact: true }));
    fireEvent.click(screen.getByRole("combobox", { name: "Filtrar pedidos por etiqueta" }));
    fireEvent.click(screen.getByRole("option", { name: "Urgente" }));

    expect(screen.getByTestId("board-count").textContent).toContain("1 pedido en seguimiento");
    expect(screen.getByRole("link", { name: "Urgente" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Equipo M11" })).toBeNull();
    const urgentCard = screen.getByRole("button", { name: "Vista rápida de PED-000008" }).closest("article");
    expect(urgentCard).toBeInstanceOf(HTMLElement);
    expect(within(urgentCard as HTMLElement).queryByRole("combobox", { name: "Etiqueta de PED-000008" })).toBeNull();
  });

  it("filters the board by an inclusive delivery date range", () => {
    const laterOrder = { ...order, id: "88888888-8888-4888-8888-888888888888", publicNumber: 9, customerName: "Fecha posterior", promisedDeliveryDate: "2026-08-20" };
    render(<OrderBoard canConfirmPayment={false} canCreateOrders={false} initialColumns={[{ ...columns[0], orders: [order, laterOrder] }, columns[1], columns[2]]} />);

    fireEvent.click(screen.getByText("Entrega", { exact: true }));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-08-14" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-08-20" } });

    expect(screen.getByTestId("board-count").textContent).toContain("1 pedido en seguimiento");
    expect(screen.getByRole("link", { name: "Fecha posterior" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Equipo M11" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(screen.getByTestId("board-count").textContent).toContain("2 pedidos en seguimiento");
  });
});
