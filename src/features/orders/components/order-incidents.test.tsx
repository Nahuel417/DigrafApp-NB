// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../incident-actions", () => ({ saveOrderIncidentAction: vi.fn() }));
vi.mock("@/hooks/use-mutation-toast", () => ({ useMutationToast: vi.fn() }));

import { OrderIncidents } from "./order-incidents";
import { saveOrderIncidentAction } from "../incident-actions";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
const props = { orderId: "22222222-2222-4222-8222-222222222222", role: "employee" as const, readOnly: false, incidents: [], error: null };
describe("order incident section", () => {
  it("offers employees internal creation only with multiple reasons and no detector or notes", () => {
    render(<OrderIncidents {...props} />);
    fireEvent.click(screen.getByText("Registrar incidencia"));
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByLabelText("Falla de costura"));
    fireEvent.click(screen.getByLabelText("Diseño"));
    expect(screen.getAllByRole("checkbox").filter((input) => input.getAttribute("data-state") === "checked")).toHaveLength(2);
  });
  it("shows history without detector identities, correction for managers, and no mutations for frozen orders", () => {
    const incidents = [{ id: "test", kind: "internal", reasons: ["sewing"], version: 2, created_at: "2026-10-17T12:00:00Z", order_incident_events: [
      { version: 1, kind: "complaint_with_return", reasons: ["design"], occurred_at: "2026-10-17T12:00:00Z" },
      { version: 2, kind: "internal", reasons: ["sewing"], occurred_at: "2026-10-17T13:00:00Z" },
    ] }];
    const { rerender } = render(<OrderIncidents {...props} incidents={incidents} role="admin" />);
    const correction = screen.getByText("Corregir incidencia", { selector: "summary" });
    fireEvent.click(correction);
    expect(within(correction.parentElement!).getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(screen.getByText("Historial de correcciones"));
    expect(within(screen.getByRole("list", { name: "Historial de correcciones" })).getByText(/Reclamo con devolución/)).toBeTruthy();
    rerender(<OrderIncidents {...props} incidents={incidents} readOnly role="admin" />);
    expect(screen.queryByText("Corregir incidencia", { selector: "summary" })).toBeNull();
    expect(screen.queryByText("Registrar incidencia")).toBeNull();
  });
  it("distinguishes load errors from an empty history", () => {
    render(<OrderIncidents {...props} error="No se pudieron cargar las incidencias." />);
    expect(screen.getByRole("alert").textContent).toContain("No se pudieron cargar");
    expect(screen.queryByText("Sin incidencias registradas")).toBeNull();
  });
  it("shows the real count and lets presentation controls close without clearing selections", () => {
    render(<OrderIncidents {...props} />);
    expect(screen.getByRole("heading", { name: "Incidencias" })).toBeTruthy();
    expect(screen.getByText("00")).toBeTruthy();
    const trigger = screen.getByText("Registrar incidencia");
    const disclosure = trigger.closest("details")!;
    fireEvent.click(trigger);
    fireEvent.click(screen.getByLabelText("Diseño"));
    expect(screen.getByText("1 motivo seleccionado")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar formulario de incidencia" }));
    expect(disclosure.open).toBe(false);
    fireEvent.click(trigger);
    expect(screen.getByRole("checkbox", { name: "Diseño" }).getAttribute("data-state")).toBe("checked");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(disclosure.open).toBe(false);
  });
  it("requires confirmation and preserves selected reasons and request identity after a recoverable error", async () => {
    vi.mocked(saveOrderIncidentAction).mockResolvedValue({ status: "error", message: "Intente nuevamente.", toastId: "test-error" });
    render(<OrderIncidents {...props} />);
    fireEvent.click(screen.getByText("Registrar incidencia"));
    fireEvent.click(screen.getByLabelText("Falla de costura"));
    fireEvent.click(screen.getByText("Guardar incidencia"));
    expect(saveOrderIncidentAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Confirmar"));
    await waitFor(() => expect(saveOrderIncidentAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("Intente nuevamente.")).toBeTruthy());
    const first = vi.mocked(saveOrderIncidentAction).mock.calls[0]![1];
    expect(first.getAll("reasons")).toEqual(["sewing"]);
    expect(screen.getByRole("checkbox", { name: "Falla de costura" }).getAttribute("data-state")).toBe("checked");
    fireEvent.click(screen.getByText("Guardar incidencia"));
    fireEvent.click(screen.getByText("Confirmar"));
    await waitFor(() => expect(saveOrderIncidentAction).toHaveBeenCalledTimes(2));
    const retry = vi.mocked(saveOrderIncidentAction).mock.calls[1]![1];
    expect(retry.get("requestId")).toBe(first.get("requestId"));
    expect(retry.get("incidentId")).toBe(first.get("incidentId"));
  });
});
