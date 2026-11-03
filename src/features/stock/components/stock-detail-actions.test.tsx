// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const actionState = vi.hoisted(() => ({ current: {} as Record<string, unknown>, pending: false }));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: () => [actionState.current, vi.fn(), actionState.pending] };
});
vi.mock("@/hooks/use-mutation-toast", () => ({ useMutationToast: vi.fn() }));
vi.mock("../actions", () => ({ executeStockOperationAction: vi.fn() }));

import { StockDetailActions } from "./stock-detail-actions";

const props = {
  initialDate: "2026-08-15",
  initialKeys: {
    activate: "activate-key",
    consumption: "consumption-key",
    purchase: "purchase-key",
    rename: "rename-key",
  },
  isActive: true,
  itemId: "a88facad-74c0-435c-9fe0-e9f2565c82d5",
  itemName: "Lona",
};

afterEach(() => {
  cleanup();
  actionState.current = {};
  actionState.pending = false;
  vi.clearAllMocks();
});

function toolbar() {
  return within(screen.getByRole("group", { name: "Acciones de tela" }));
}

describe("StockDetailActions", () => {
  it("opens one operation at a time, closes the active operation, and preserves its action identity", () => {
    const view = render(<StockDetailActions {...props} />);
    const actions = toolbar();
    const purchase = actions.getByRole("radio", { name: "Compra" });
    const consumption = actions.getByRole("radio", { name: "Salida" });
    expect(purchase.querySelector("svg")?.classList.contains("text-success-foreground")).toBe(true);
    expect(consumption.querySelector("svg")?.classList.contains("text-destructive")).toBe(true);
    expect(purchase.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByLabelText("Cantidad comprada (rollos)")).toBeNull();

    fireEvent.click(purchase);
    expect(purchase.getAttribute("aria-checked")).toBe("true");
    const purchaseQuantity = screen.getByLabelText("Cantidad comprada (rollos)") as HTMLInputElement;
    const purchaseForm = purchaseQuantity.closest("form");
    if (!purchaseForm) throw new Error("No se encontró el formulario de compra.");
    expect(new FormData(purchaseForm).get("action")).toBe("purchase");
    expect(new FormData(purchaseForm).get("itemId")).toBe(props.itemId);
    expect(new FormData(purchaseForm).get("idempotencyKey")).toBe("purchase-key");
    expect((screen.getByLabelText("Fecha de compra") as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText("Precio por rollo (ARS)") as HTMLInputElement).required).toBe(true);

    fireEvent.change(purchaseQuantity, { target: { value: "0.5" } });
    fireEvent.click(purchase);
    expect(screen.queryByLabelText("Cantidad comprada (rollos)")).toBeNull();
    expect(purchase.getAttribute("aria-checked")).toBe("false");
    expect(document.activeElement).toBe(purchase);
    fireEvent.click(purchase);
    expect((screen.getByLabelText("Cantidad comprada (rollos)") as HTMLInputElement).value).toBe("");
    fireEvent.click(purchase);

    fireEvent.click(consumption);
    expect(consumption.getAttribute("aria-checked")).toBe("true");
    expect(purchase.getAttribute("aria-checked")).toBe("false");
    const consumptionQuantity = screen.getByLabelText("Cantidad consumida (rollos)");
    const consumptionForm = consumptionQuantity.closest("form");
    if (!consumptionForm) throw new Error("No se encontró el formulario de salida.");
    expect(new FormData(consumptionForm).get("action")).toBe("consumption");
    expect(new FormData(consumptionForm).get("itemId")).toBe(props.itemId);
    expect(new FormData(consumptionForm).get("idempotencyKey")).toBe("consumption-key");
    expect(screen.queryByLabelText("Precio por rollo (ARS)")).toBeNull();

    fireEvent.click(actions.getByRole("button", { name: "Renombrar" }));
    expect(view.container.querySelectorAll("form")).toHaveLength(1);
    const name = screen.getByLabelText("Nombre del material") as HTMLInputElement;
    expect(name.defaultValue).toBe("Lona");
    expect(new FormData(name.closest("form") as HTMLFormElement).get("action")).toBe("rename");
  });

  it("closes after success and reuses the returned idempotency key when reopened", async () => {
    const view = render(<StockDetailActions {...props} />);
    const actions = toolbar();
    fireEvent.click(actions.getByRole("radio", { name: "Compra" }));

    actionState.current = { status: "success", resetKey: "purchase-key-next" };
    view.rerender(<StockDetailActions {...props} />);

    await waitFor(() => expect(screen.queryByLabelText("Cantidad comprada (rollos)")).toBeNull());
    actionState.current = {};
    fireEvent.click(actions.getByRole("radio", { name: "Compra" }));
    const form = screen.getByLabelText("Cantidad comprada (rollos)").closest("form");
    if (!form) throw new Error("No se encontró el formulario de compra reabierto.");
    expect(new FormData(form).get("idempotencyKey")).toBe("purchase-key-next");
  });

  it("keeps the selected operation mounted while its action is pending", () => {
    const view = render(<StockDetailActions {...props} />);
    const actions = toolbar();
    const purchase = actions.getByRole("radio", { name: "Compra" });
    fireEvent.click(purchase);

    actionState.pending = true;
    view.rerender(<StockDetailActions {...props} />);

    const consumption = actions.getByRole("radio", { name: "Salida" });
    expect((consumption as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(consumption);
    expect(purchase.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByLabelText("Cantidad comprada (rollos)")).toBeTruthy();
    expect(screen.queryByLabelText("Cantidad consumida (rollos)")).toBeNull();
  });

  it("marks the deactivate action with the destructive color", () => {
    const view = render(<StockDetailActions {...props} />);
    const deactivate = toolbar().getByRole("button", { name: "Desactivar" });
    expect(deactivate.classList.contains("text-destructive")).toBe(true);

    view.rerender(<StockDetailActions {...props} isActive={false} />);
    expect(toolbar().getByRole("button", { name: "Reactivar" }).classList.contains("text-destructive")).toBe(false);
    expect(toolbar().getByRole("button", { name: "Reactivar" }).classList.contains("text-success-foreground")).toBe(true);
  });
});
