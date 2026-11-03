// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const actionState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: () => [actionState.current, vi.fn(), false] };
});
vi.mock("@/hooks/use-mutation-toast", () => ({ useMutationToast: vi.fn() }));
vi.mock("../actions", () => ({ executeStockOperationAction: vi.fn() }));

import { useMutationToast } from "@/hooks/use-mutation-toast";

import { StockOperationForm } from "./stock-operation-form";

afterEach(() => {
  cleanup();
  actionState.current = {};
  vi.clearAllMocks();
});

describe("StockOperationForm", () => {
  it("requires a price when adding material, including with a zero opening balance", () => {
    const view = render(<StockOperationForm action="create" initialDate="2026-08-15" initialKey="create-key" />);
    const form = view.container.querySelector("form");
    if (!form) throw new Error("No se encontró el formulario de material.");

    const name = screen.getByLabelText("Nombre del material") as HTMLInputElement;
    const quantity = screen.getByLabelText("Cantidad (rollos)") as HTMLInputElement;
    const price = screen.getByLabelText("Precio por rollo (ARS)") as HTMLInputElement;
    const date = screen.getByLabelText("Fecha") as HTMLInputElement;

    expect(name.required).toBe(true);
    expect(quantity.value).toBe("0");
    expect(price.required).toBe(true);
    expect(price.name).toBe("price");
    expect(date.required).toBe(true);
    expect(date.max).toBe("2026-08-15");
    expect(new FormData(form).get("price")).toBe("");
  });

  it("uses one adaptive purchase and consumption form with a live balance effect", () => {
    const view = render(
      <StockOperationForm
        action="purchase"
        allowMovementSelection
        availableQuantity={1.5}
        initialDate="2026-08-15"
        initialKey="movement-key"
        itemId="a88facad-74c0-435c-9fe0-e9f2565c82d5"
        itemName="Lona"
      />,
    );

    const form = view.container.querySelector("form");
    if (!form) throw new Error("No se encontró el formulario de movimientos.");
    const operation = screen.getByRole("combobox", { name: "Tipo de movimiento" });
    expect(screen.getByLabelText("Precio por rollo (ARS)")).toBeTruthy();
    expect(screen.getByText(/Saldo disponible: 1,5 rollos/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Cantidad comprada (rollos)"), { target: { value: "0,5" } });
    expect(screen.getByText(/Efecto en saldo: \+0,5 rollos/)).toBeTruthy();

    fireEvent.click(operation);
    fireEvent.click(screen.getByRole("option", { name: "Consumo" }));

    expect(new FormData(form).get("action")).toBe("consumption");
    expect(screen.getByLabelText("Cantidad consumida (rollos)")).toBeTruthy();
    expect(screen.queryByLabelText("Precio por rollo (ARS)")).toBeNull();
    expect(screen.getByText(/Efecto en saldo: −0,5 rollos/)).toBeTruthy();
  });

  it("rejects letters, exponent notation and negative values while typing, pasting or dropping prices", () => {
    render(
      <StockOperationForm
        action="purchase"
        initialDate="2026-08-15"
        initialKey="purchase-key"
        itemId="a88facad-74c0-435c-9fe0-e9f2565c82d5"
        itemName="Lona"
      />,
    );
    const price = screen.getByLabelText("Precio por rollo (ARS)") as HTMLInputElement;
    price.value = "123.45";
    price.setSelectionRange(price.value.length, price.value.length);

    for (const key of ["x", "e", "-"]) expect(fireEvent.keyDown(price, { key })).toBe(false);
    for (const invalid of ["letters", "1e3", "-20"]) {
      expect(fireEvent.paste(price, { clipboardData: { getData: () => invalid } })).toBe(false);
      expect(fireEvent.drop(price, { dataTransfer: { getData: () => invalid } })).toBe(false);
    }
    expect(price.value).toBe("123.45");
  });

  it("blocks letters and non half-roll fractions while typing or pasting quantity", () => {
    render(<StockOperationForm action="create" initialDate="2026-08-15" initialKey="create-key" />);
    const quantity = screen.getByLabelText("Cantidad (rollos)") as HTMLInputElement;
    quantity.value = "1";
    quantity.setSelectionRange(quantity.value.length, quantity.value.length);

    for (const key of ["x", "e", "-"]) expect(fireEvent.keyDown(quantity, { key })).toBe(false);
    for (const invalid of ["letters", "0,25", "1e3", ",2"]) {
      expect(fireEvent.paste(quantity, { clipboardData: { getData: () => invalid } })).toBe(false);
      expect(fireEvent.drop(quantity, { dataTransfer: { getData: () => invalid } })).toBe(false);
    }
    expect(fireEvent.keyDown(quantity, { key: ",5" })).toBe(true);
    expect(quantity.value).toBe("1");
  });

  it("uses the toast as the only notification for completed actions", () => {
    actionState.current = { status: "success", message: "Material agregado.", toastId: "toast-1" };
    render(<StockOperationForm action="create" initialDate="2026-08-15" initialKey="create-key" />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("Material agregado.")).toBeNull();
    expect(vi.mocked(useMutationToast)).toHaveBeenCalledWith(expect.objectContaining({ status: "success", message: "Material agregado." }));
  });
});
