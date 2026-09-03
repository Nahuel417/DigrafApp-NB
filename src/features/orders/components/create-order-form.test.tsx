// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const actionState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: () => [actionState.current, vi.fn()] };
});

vi.mock("@/hooks/use-mutation-toast", () => ({ useMutationToast: vi.fn() }));
vi.mock("../actions", () => ({ createOrderAction: vi.fn() }));

import type { OrderFormCatalogs } from "../queries";
import { CreateOrderForm } from "./create-order-form";

const catalogs: OrderFormCatalogs = {
  garments: [{ id: "garment", kind: "garment", garmentLayer: "upper", name: "Remera", options: [] }],
  flags: [],
  bags: [],
  shields: [],
  necklines: [],
  upperPatterns: [],
  lowerPatterns: [],
  fabrics: [],
  extras: [],
};

describe("CreateOrderForm", () => {
  afterEach(() => {
    cleanup();
    actionState.current = {};
  });

  it("preserves the draft after a failed creation and clears only the edited field error", () => {
    const view = render(<CreateOrderForm catalogs={catalogs} initialOrderDate="2026-08-31" />);
    const client = screen.getByLabelText("Cliente");
    const team = screen.getByLabelText("Equipo");
    const phone = screen.getByLabelText("Teléfono");
    const promisedDelivery = screen.getByLabelText("Fecha prometida de entrega");
    const description = screen.getByLabelText(/Detalles adicionales/);
    const total = screen.getByLabelText("Total del pedido");
    const deposit = screen.getByLabelText("Monto de seña");
    const quantity = screen.getByLabelText("Cantidad");
    const color = document.querySelector('input[id^="line-color-"]');
    if (!color) throw new Error("No se encontró el campo Color.");

    fireEvent.change(client, { target: { value: "Cliente escrito" } });
    fireEvent.change(team, { target: { value: "Equipo escrito" } });
    fireEvent.change(phone, { target: { value: "3515550199" } });
    fireEvent.change(promisedDelivery, { target: { value: "2026-09-02" } });
    fireEvent.change(description, { target: { value: "Detalles escritos" } });
    fireEvent.change(total, { target: { value: "20000" } });
    fireEvent.change(deposit, { target: { value: "5000" } });
    fireEvent.change(quantity, { target: { value: "4" } });
    fireEvent.change(color, { target: { value: "verde" } });
    const depositPaid = view.container.querySelector('input[name="depositPaid"]');
    if (!depositPaid) throw new Error("No se encontró el campo Seña abonada.");
    fireEvent.click(depositPaid);

    actionState.current = {
      status: "error",
      toastId: "creation-error",
      message: "Revisá los datos del pedido.",
      fieldErrors: {
        clientName: ["El cliente es obligatorio."],
        teamName: ["El equipo es obligatorio."],
        lines: ["Seleccioná un producto."],
      },
    };
    view.rerender(<CreateOrderForm catalogs={catalogs} initialOrderDate="2026-08-31" />);

    expect(client).toHaveProperty("value", "Cliente escrito");
    expect(team).toHaveProperty("value", "Equipo escrito");
    expect(phone).toHaveProperty("value", "3515550199");
    expect(promisedDelivery).toHaveProperty("value", "2026-09-02");
    expect(description).toHaveProperty("value", "Detalles escritos");
    expect(total).toHaveProperty("value", "20000");
    expect(deposit).toHaveProperty("value", "5000");
    expect(quantity).toHaveProperty("value", "4");
    expect(color).toHaveProperty("value", "verde");
    expect(depositPaid).toHaveProperty("checked", true);
    const form = view.container.querySelector("form");
    if (!form) throw new Error("No se encontró el formulario de pedido.");
    const submitted = new FormData(form);
    expect(submitted.get("clientName")).toBe("Cliente escrito");
    expect(submitted.get("promisedDeliveryDate")).toBe("2026-09-02");
    expect(JSON.parse(String(submitted.get("lines")))[0]).toMatchObject({ quantity: 4, color: "verde" });
    expect(screen.getByText("El cliente es obligatorio.")).toBeTruthy();
    expect(screen.getByText("El equipo es obligatorio.")).toBeTruthy();
    expect(screen.getByText("Seleccioná un producto.")).toBeTruthy();
    expect(client.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(client, { target: { value: "Cliente corregido" } });

    expect(client).toHaveProperty("value", "Cliente corregido");
    expect(screen.queryByText("El cliente es obligatorio.")).toBeNull();
    expect(screen.getByText("El equipo es obligatorio.")).toBeTruthy();
    expect(client.getAttribute("aria-invalid")).toBe("false");

    fireEvent.change(quantity, { target: { value: "5" } });
    expect(screen.queryByText("Seleccioná un producto.")).toBeNull();

    actionState.current = {
      status: "error",
      toastId: "creation-error-2",
      message: "Revisá los datos del pedido.",
      fieldErrors: { clientName: ["El cliente no es válido."] },
    };
    view.rerender(<CreateOrderForm catalogs={catalogs} initialOrderDate="2026-08-31" />);

    expect(screen.getByText("El cliente no es válido.")).toBeTruthy();

    view.unmount();
    render(<CreateOrderForm catalogs={catalogs} initialOrderDate="2026-08-31" />);

    expect(screen.getByLabelText("Cliente")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Total del pedido")).toHaveProperty("value", "");
    expect(document.querySelector('input[name="depositPaid"]')).toHaveProperty("checked", false);
  });
});
