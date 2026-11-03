// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: () => [state.current, vi.fn()] };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/hooks/use-mutation-toast", () => ({ useMutationToast: vi.fn() }));
vi.mock("../detail-actions", () => ({ updateOrderAction: vi.fn() }));
vi.mock("./order-line-editor", () => ({ OrderLineEditor: () => null }));

import { OrderEditForm } from "./order-edit-form";

const order = {
  id: "order-id",
  publicNumber: 7,
  updatedAt: "2026-08-12T19:00:00.000Z",
  orderDate: "2026-08-10",
  promisedDeliveryDate: "2026-08-20",
  lines: [],
} as never;

afterEach(() => {
  cleanup();
  state.current = {};
  vi.clearAllMocks();
});

describe("OrderEditForm", () => {
  it("keeps the promised-date field contract, error and shared calendar", () => {
    state.current = { fieldErrors: { promisedDeliveryDate: ["La fecha prometida no es válida."] } };
    render(<OrderEditForm action={vi.fn() as never} catalogs={{} as never} financials={null} order={order} />);

    const input = screen.getByLabelText("Fecha prometida de entrega") as HTMLInputElement;
    expect(input.id).toBe("edit-promised-date");
    expect(input.name).toBe("promisedDeliveryDate");
    expect(input.type).toBe("date");
    expect(input.required).toBe(true);
    expect(input.value).toBe("2026-08-20");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("La fecha prometida no es válida.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario para Fecha prometida de entrega" }));
    expect(screen.getByRole("dialog", { name: "Calendario para Fecha prometida de entrega" })).toBeTruthy();
  });
});
