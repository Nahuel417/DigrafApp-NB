// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCashMovementAction, setCashOpeningAction } from "../actions";
import { buildCashDashboardViewModel, idempotencyKeyAfterResult, MovementForm, OpeningForm, resetMovementFormAfterResult } from "./cash-dashboard";

vi.mock("../actions", () => ({
  createCashMovementAction: vi.fn(),
  setCashOpeningAction: vi.fn(),
}));
vi.mock("@/hooks/use-mutation-toast", () => ({ useMutationToast: vi.fn() }));

const summary = { cashDayId: "33333333-3333-4333-8333-333333333333", categories: [{ id: "11111111-1111-4111-8111-111111111111", code: "materials", name: "Materiales/insumos" }], currentBalance: "0.00", openingBalance: "0.00", openingUpdatedAt: "2026-08-06T03:00:00.000Z", movements: [], operationalDate: "2026-08-06" };

const openingAction = vi.mocked(setCashOpeningAction);
const movementAction = vi.mocked(createCashMovementAction);

beforeEach(() => {
  openingAction.mockReset();
  movementAction.mockReset();
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
    expect(view).toMatchObject({ balance: "0.00", opening: "0.00", movementState: "empty", canOperate: true, actions: ["opening", "income", "expense"] });
  });

  it("keeps income category-free and expenses fixed to active categories", () => {
    const view = buildCashDashboardViewModel(summary, true);
    expect(view.incomeCategory).toBeNull();
    expect(view.expenseCategories).toEqual(summary.categories);
    expect(view.unsupportedActions).toEqual(["history", "category administration", "edit", "void", "close", "payments", "order-derived income"]);
  });

  it("switches from the empty state when a current-day movement exists", () => {
    expect(buildCashDashboardViewModel({ ...summary, movements: [{ id: "1", direction: "income", amount: "1.00", description: null, expenseCategoryId: null, expenseCategoryCode: null, expenseCategoryName: null, actorId: "2", createdAt: "2026-08-06T03:00:00.000Z" }] }, true).movementState).toBe("populated");
  });

  it("exposes no mutation actions to an unauthorized profile", () => {
    expect(buildCashDashboardViewModel(summary, false).actions).toEqual([]);
  });
});

describe("cash form result handling", () => {
  it("preserves the opening key after a failed or ambiguous attempt", () => {
    expect(idempotencyKeyAfterResult("retry-key", "error", "new-key")).toBe("retry-key");
  });

  it("adopts the confirmed opening key only after success", () => {
    expect(idempotencyKeyAfterResult("completed-key", "success", "new-key")).toBe("new-key");
  });

  it("preserves movement values and key after errors", () => {
    const form = { reset: vi.fn() };
    resetMovementFormAfterResult(form, "error");
    expect(form.reset).not.toHaveBeenCalled();
    expect(idempotencyKeyAfterResult("retry-key", "error", "new-key")).toBe("retry-key");
  });

  it("clears movement values and rotates the key after confirmed success", () => {
    const form = { reset: vi.fn() };
    resetMovementFormAfterResult(form, "success");
    expect(form.reset).toHaveBeenCalledOnce();
    expect(idempotencyKeyAfterResult("completed-key", "success", "new-key")).toBe("new-key");
  });

  it("does not rotate the opening key when no server reset key is provided", () => {
    expect(idempotencyKeyAfterResult("retry-key", "success", "")).toBe("retry-key");
  });

  it("only rotates the opening key after a confirmed success with a server-provided key", () => {
    const afterError = idempotencyKeyAfterResult("retry-key", "error", "new-key");
    const afterNoKey = idempotencyKeyAfterResult("retry-key", "success", "");
    const afterSuccess = idempotencyKeyAfterResult("retry-key", "success", "new-key");
    expect(afterError).toBe("retry-key");
    expect(afterNoKey).toBe("retry-key");
    expect(afterSuccess).toBe("new-key");
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
    const form = container.querySelector("form")!;
    const keyInput = container.querySelector<HTMLInputElement>('input[name="idempotencyKey"]')!;
    expect(keyInput.value).toBeTruthy();

    fireEvent.submit(form);
    await waitFor(() => expect(receivedKeys).toHaveLength(1));
    const initialKey = receivedKeys[0]!;
    expect(initialKey).toBe(keyInput.value);
    await screen.findByText("error");

    fireEvent.submit(form);
    await waitFor(() => expect(receivedKeys).toHaveLength(2));
    expect(receivedKeys[1]).toBe(initialKey);
    await screen.findByText("ambiguous");

    fireEvent.submit(form);
    await waitFor(() => expect(receivedKeys).toHaveLength(3));
    expect(receivedKeys[2]).toBe(initialKey);
    await screen.findByText("ok");
    await waitFor(() => expect(keyInput.value).toBe("confirmed-key"));

    fireEvent.submit(form);
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

    fireEvent.submit(form);
    await waitFor(() => expect(receivedKeys).toHaveLength(2));
    expect(receivedKeys[1]).toBe(initialKey);
    await screen.findByText("ambiguous");

    fireEvent.submit(form);
    await waitFor(() => expect(receivedKeys).toHaveLength(3));
    expect(receivedKeys[2]).toBe(initialKey);
    await screen.findByText("ok");
    await waitFor(() => expect(keyInput.value).toBe("movement-success-key"));

    fireEvent.change(amount, { target: { value: "11.00" } });
    fireEvent.change(description, { target: { value: "Otra venta" } });
    fireEvent.submit(form);
    await waitFor(() => expect(receivedKeys).toHaveLength(4));
    expect(receivedKeys[3]).toBe("movement-success-key");
    expect(receivedKeys[3]).not.toBe(initialKey);
  });
});
