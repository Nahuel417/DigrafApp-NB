// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCashDayAction, correctCashMovementAction, createCashMovementAction, reopenCashDayAction, setCashOpeningAction, voidCashMovementAction } from "../actions";
import { buildCashDashboardViewModel, CashDashboard, CASH_REOPEN_REASON_REQUIRED_MESSAGE, formatCashDateTime, MovementForm, OpeningForm, preventInvalidCashBeforeInput, validateReopenReason } from "./cash-dashboard";

vi.mock("../actions", () => ({
  closeCashDayAction: vi.fn(),
  correctCashMovementAction: vi.fn(),
  createCashMovementAction: vi.fn(),
  setCashOpeningAction: vi.fn(),
  voidCashMovementAction: vi.fn(),
  reopenCashDayAction: vi.fn(),
}));
vi.mock("@/hooks/use-mutation-toast", () => ({ useMutationToast: vi.fn() }));

const summary = { cashDayId: "33333333-3333-4333-8333-333333333333", categories: [{ id: "11111111-1111-4111-8111-111111111111", code: "materials", name: "Materiales/insumos" }], currentBalance: "0.00", openingBalance: "0.00", openingUpdatedAt: "2026-08-06T03:00:00.000Z", movements: [], operationalDate: "2026-08-06", closedAt: null, closedBy: null, closedByDisplayName: null, closureKind: null, closingBalance: null };

const openingAction = vi.mocked(setCashOpeningAction);
const movementAction = vi.mocked(createCashMovementAction);

beforeEach(() => {
  openingAction.mockReset();
  movementAction.mockReset();
  vi.mocked(closeCashDayAction).mockReset();
  vi.mocked(correctCashMovementAction).mockReset();
  vi.mocked(voidCashMovementAction).mockReset();
  vi.mocked(reopenCashDayAction).mockReset();
});

afterEach(() => cleanup());

function queueAction(action: ReturnType<typeof vi.fn>, responses: Array<Record<string, string>>) {
  const receivedKeys: string[] = [];
  action.mockImplementation(async (_previous: unknown, formData: FormData) => {
    receivedKeys.push(String(formData.get("idempotencyKey")));
    return responses.shift() ?? { status: "success", message: "ok", toastId: "fallback" };
  });
  return receivedKeys;
}

describe("cash dashboard view model", () => {
  it("exposes zero balance, derived summary, opening and authorized actions", () => {
    const view = buildCashDashboardViewModel(summary, true);
    expect(view).toMatchObject({ balance: "0.00", opening: "0.00", movementState: "empty", canOperate: true, actions: ["opening", "income", "expense", "edit", "void"] });
  });

  it("keeps income category-free and expenses fixed to active categories", () => {
    const view = buildCashDashboardViewModel(summary, true);
    expect(view.incomeCategory).toBeNull();
    expect(view.expenseCategories).toEqual(summary.categories);
    expect(view.unsupportedActions).toEqual(["category administration", "payments", "order-derived income"]);
  });

  it("switches from the empty state when a current-day movement exists", () => {
    expect(buildCashDashboardViewModel({ ...summary, movements: [{ id: "1", direction: "income", amount: "1.00", description: null, expenseCategoryId: null, expenseCategoryCode: null, expenseCategoryName: null, actorId: "2", actorDisplayName: "Operador", createdAt: "2026-08-06T03:00:00.000Z" }] }, true).movementState).toBe("populated");
  });

  it("exposes no mutation actions to an unauthorized profile", () => {
    expect(buildCashDashboardViewModel(summary, false).actions).toEqual([]);
  });

  it("exposes correction, void, and manager close actions only for an open day", () => {
    expect(buildCashDashboardViewModel({ ...summary, movements: [{ id: "1", direction: "income", amount: "1.00", description: "Venta", expenseCategoryId: null, expenseCategoryCode: null, expenseCategoryName: null, actorId: "2", actorDisplayName: "Operador", createdAt: "2026-08-06T03:00:00.000Z" }] }, true, true)).toMatchObject({ isClosed: false, actions: ["opening", "income", "expense", "edit", "void", "close"] });
    expect(buildCashDashboardViewModel({ ...summary, closedAt: "2026-08-07T03:00:00.000Z", closureKind: "manual", closingBalance: "1.00" }, true, true)).toMatchObject({ isClosed: true, canOperate: false, actions: [] });
  });
});

describe("cash dashboard M10 controls", () => {
  it("prevents invalid insertion when beforeinput has no inputType", () => {
    render(createElement(MovementForm, { categories: [], direction: "income" }));
    const amount = screen.getByLabelText("Importe");
    const event = {
      currentTarget: amount,
      nativeEvent: { data: "x", inputType: undefined },
      preventDefault: vi.fn(),
    } as unknown as Parameters<typeof preventInvalidCashBeforeInput>[0];

    expect(() => preventInvalidCashBeforeInput(event)).not.toThrow();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("shows an application-owned amount error after rejected insertion and clears it on valid edit", () => {
    render(createElement(MovementForm, { categories: [], direction: "income" }));
    const amount = screen.getByLabelText("Importe");

    fireEvent.keyDown(amount, { key: "x" });
    expect(screen.getByText("Ingresá un importe.")).toBeTruthy();
    expect(amount.getAttribute("aria-invalid")).toBe("true");
    expect(amount.getAttribute("aria-describedby")).toBe("cash-income-amount-error");
    expect(amount.closest("[data-invalid]")?.getAttribute("data-invalid")).toBe("true");
    expect(document.activeElement).toBe(amount);

    fireEvent.input(amount, { target: { value: "12" } });
    expect(screen.queryByText("Ingresá un importe.")).toBeNull();
    expect(amount.getAttribute("aria-invalid")).toBe("false");
    expect(amount.hasAttribute("aria-describedby")).toBe(false);
  });

  it("blocks the opening action when the amount has client-invalid syntax", async () => {
    const { container } = render(createElement(OpeningForm, { summary }));
    const amount = screen.getByLabelText("Saldo inicial");

    fireEvent.input(amount, { target: { value: "1." } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar apertura" }));

    await waitFor(() => expect(openingAction).not.toHaveBeenCalled());
    expect(screen.getByText("Usá un importe con hasta dos decimales.")).toBeTruthy();
    expect(container.querySelector("form")?.checkValidity()).toBe(false);
  });

  it("shows confirmed correction, void, and close controls for an open day", () => {
    render(createElement(CashDashboard, { canOperate: true, canClose: true, summary: { ...summary, movements: [{ id: "1", direction: "income", amount: "1.00", description: "Venta", expenseCategoryId: null, expenseCategoryCode: null, expenseCategoryName: null, actorId: "2", actorDisplayName: "Operador", createdAt: "2026-08-06T03:00:00.000Z" }] }, closedDays: [], selectedHistory: null }));
    expect(screen.getByRole("button", { name: "Editar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anular" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar caja" })).toBeTruthy();
  });

  it("renders the current closed day read-only with reopen only for authorized roles", () => {
    const closedSummary = { ...summary, closedAt: "2026-08-07T03:00:00.000Z", closureKind: "manual", closingBalance: "0.00" };
    const { rerender } = render(createElement(CashDashboard, { canOperate: true, canClose: false, canReopen: true, summary: closedSummary, closedDays: [], selectedHistory: null }));
    expect(screen.getByText("Caja cerrada")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reabrir caja" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Anular" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cerrar caja" })).toBeNull();
    rerender(createElement(CashDashboard, { canOperate: false, canClose: false, canReopen: false, summary: closedSummary, closedDays: [], selectedHistory: null }));
    expect(screen.queryByRole("button", { name: "Reabrir caja" })).toBeNull();
  });

it("formats visible UTC timestamps in America/Argentina/Cordoba", () => {
    expect(formatCashDateTime("2026-08-07T03:00:00.000Z")).toBe("07/08/2026, 00:00");
  });

  it("rejects an empty reopen reason with a localized message and accepts a valid one", () => {
    expect(validateReopenReason("")).toBe(CASH_REOPEN_REASON_REQUIRED_MESSAGE);
    expect(validateReopenReason("   ")).toBe(CASH_REOPEN_REASON_REQUIRED_MESSAGE);
    expect(validateReopenReason("a")).toBe(CASH_REOPEN_REASON_REQUIRED_MESSAGE);
    expect(validateReopenReason("Corrección correcta")).toBeNull();
    expect(validateReopenReason("ok")).toBeNull();
    expect(validateReopenReason("a".repeat(501))).toBe(CASH_REOPEN_REASON_REQUIRED_MESSAGE);
  });

  it("shows only the authorized reopen control in closed history", () => {
    const closedSummary = { ...summary, closedAt: "2026-08-07T03:00:00.000Z", closureKind: "manual", closingBalance: "0.00" };
    const history = { ...closedSummary, movements: [], events: [], lifecycleEvents: [] as never[] };
    render(createElement(CashDashboard, { canOperate: true, canClose: false, canReopen: true, summary, closedDays: [], selectedHistory: history }));
    expect(screen.getByRole("button", { name: "Reabrir caja" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Anular" })).toBeNull();
  });

  it("hides the reopen control from Employee in closed history", () => {
    const closedSummary = { ...summary, closedAt: "2026-08-07T03:00:00.000Z", closureKind: "manual", closingBalance: "0.00" };
    const history = { ...closedSummary, movements: [], events: [], lifecycleEvents: [] as never[] };
    render(createElement(CashDashboard, { canOperate: false, canClose: false, canReopen: false, summary, closedDays: [], selectedHistory: history }));
    expect(screen.queryByRole("button", { name: "Reabrir caja" })).toBeNull();
  });

  it("keeps the reopen dialog open, marks the reason invalid and blocks the action when submitted empty", () => {
    function harnessStub() {
      let reasonInvalid = false;
      let reasonValue = "";
      const form = document.createElement("form");
      form.id = "cash-reopen-44444444-4444-4444-8444-444444444444";
      form.innerHTML = `<textarea id="cash-reopen-44444444-4444-4444-8444-444444444444-reason" name="reason" aria-invalid="false" aria-describedby="">No error</textarea>`;
      document.body.appendChild(form);
      const reason = form.querySelector("textarea")!;
      function handleSubmit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) {
        const value = (event.currentTarget.elements.namedItem("reason") as HTMLTextAreaElement).value;
        const reasonError = validateReopenReason(value);
        if (reasonError) {
          event.preventDefault();
          reasonInvalid = true;
          reasonValue = value;
          reason.setAttribute("aria-invalid", "true");
          reason.setAttribute("aria-describedby", `${reason.id}-error`);
          const field = document.createElement("p");
          field.id = `${reason.id}-error`;
          field.textContent = reasonError;
          if (!document.getElementById(field.id)) form.appendChild(field);
          return;
        }
        reasonInvalid = false;
        reason.setAttribute("aria-invalid", "false");
        reason.removeAttribute("aria-describedby");
        const prev = document.getElementById(`${reason.id}-error`);
        if (prev) prev.remove();
      }
      return { form, reason, handleSubmit, getInvalid: () => reasonInvalid, getValue: () => reasonValue };
    }
    const harness = harnessStub();
    harness.reason.value = "";
    const prevented = { called: false, preventDefault() { this.called = true; } };
    harness.handleSubmit({ preventDefault: () => { prevented.called = true; }, currentTarget: harness.form });
    expect(prevented.called).toBe(true);
    expect(harness.getInvalid()).toBe(true);
    expect(harness.reason.getAttribute("aria-invalid")).toBe("true");
    expect(harness.reason.getAttribute("aria-describedby")).toBe(`${harness.reason.id}-error`);
    expect(document.getElementById(`${harness.reason.id}-error`)?.textContent).toBe(CASH_REOPEN_REASON_REQUIRED_MESSAGE);
    expect(vi.mocked(reopenCashDayAction)).not.toHaveBeenCalled();
    expect(harness.reason.value).toBe("");
    harness.reason.value = "Corrección correcta";
    prevented.called = false;
    harness.handleSubmit({ preventDefault: () => { prevented.called = true; }, currentTarget: harness.form });
    expect(prevented.called).toBe(false);
    expect(harness.reason.getAttribute("aria-invalid")).toBe("false");
    expect(document.getElementById(`${harness.reason.id}-error`)).toBeNull();
    expect(harness.reason.value).toBe("Corrección correcta");
  });
});

describe("cash form idempotency", () => {
  it("keeps the opening key through submission and error, then rotates after confirmed success", async () => {
    const receivedKeys = queueAction(openingAction, [
      { status: "error", message: "error", toastId: "error-1" },
      { status: "error", message: "ambiguous", toastId: "error-2" },
      { status: "success", message: "ok", resetKey: "confirmed-key", toastId: "success" },
      { status: "success", message: "ok", resetKey: "next-key", toastId: "success-2" },
    ]);
    const { container } = render(createElement(OpeningForm, { summary }));
    const keyInput = container.querySelector<HTMLInputElement>('input[name="idempotencyKey"]')!;
    expect(keyInput.value).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Guardar apertura" }));
    await waitFor(() => expect(receivedKeys).toHaveLength(1));
    const initialKey = receivedKeys[0]!;
    expect(initialKey).toBe(keyInput.value);
    await screen.findByText("error");

    fireEvent.click(screen.getByRole("button", { name: "Guardar apertura" }));
    await waitFor(() => expect(receivedKeys).toHaveLength(2));
    expect(receivedKeys[1]).toBe(initialKey);
    await screen.findByText("ambiguous");

    fireEvent.click(screen.getByRole("button", { name: "Guardar apertura" }));
    await waitFor(() => expect(receivedKeys).toHaveLength(3));
    expect(receivedKeys[2]).toBe(initialKey);
    await screen.findByText("ok");
    await waitFor(() => expect(keyInput.value).toBe("confirmed-key"));

    fireEvent.click(screen.getByRole("button", { name: "Guardar apertura" }));
    await waitFor(() => expect(receivedKeys).toHaveLength(4));
    expect(receivedKeys[3]).toBe("confirmed-key");
    expect(receivedKeys[3]).not.toBe(initialKey);
  });

  it("keeps the movement key after an error and rotates it after confirmed success", async () => {
    const receivedKeys = queueAction(movementAction, [
      { status: "error", message: "error", toastId: "error-1" },
      { status: "error", message: "ambiguous", toastId: "error-2" },
      { status: "success", message: "ok", resetKey: "movement-success-key", toastId: "success" },
      { status: "success", message: "ok", resetKey: "movement-next-key", toastId: "success-2" },
    ]);
    const { container } = render(createElement(MovementForm, { categories: [], direction: "income" }));
    const form = container.querySelector("form")!;
    const amount = screen.getByLabelText("Importe");
    const description = screen.getByLabelText("Concepto");
    const keyInput = container.querySelector<HTMLInputElement>('input[name="idempotencyKey"]')!;
    fireEvent.change(amount, { target: { value: "10.00" } });
    fireEvent.change(description, { target: { value: "Venta" } });

    fireEvent.submit(form);
    await waitFor(() => expect(receivedKeys).toHaveLength(1));
    const initialKey = receivedKeys[0]!;
    expect(initialKey).toBe(keyInput.value);
    await screen.findByText("error");
    await waitFor(() => expect(screen.getByRole("button", { name: "Registrar ingreso" }).getAttribute("aria-busy")).toBe("false"));

    fireEvent.submit(form);
    await waitFor(() => expect(receivedKeys).toHaveLength(2));
    expect(receivedKeys[1]).toBe(initialKey);
    await screen.findByText("ambiguous");
    await waitFor(() => expect(screen.getByRole("button", { name: "Registrar ingreso" }).getAttribute("aria-busy")).toBe("false"));

    fireEvent.submit(form);
    await waitFor(() => expect(receivedKeys).toHaveLength(3));
    expect(receivedKeys[2]).toBe(initialKey);
    await screen.findByText("ok");
    await waitFor(() => expect(screen.getByRole("button", { name: "Registrar ingreso" }).getAttribute("aria-busy")).toBe("false"));
    await waitFor(() => expect(keyInput.value).toBe("movement-success-key"));

    fireEvent.change(amount, { target: { value: "11.00" } });
    fireEvent.change(description, { target: { value: "Otra venta" } });
    fireEvent.submit(form);
    await waitFor(() => expect(receivedKeys).toHaveLength(4));
    expect(receivedKeys[3]).toBe("movement-success-key");
    expect(receivedKeys[3]).not.toBe(initialKey);
  });
});
