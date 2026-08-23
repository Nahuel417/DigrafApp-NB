import { describe, expect, it } from "vitest";

import { canCloseCash, canConfirmPayment, canCreateManualOrder, canManageCatalogs, canManageOrderLifecycle, canManageStages, canMoveOrder, canOperateCash, canReadOrderFinancials, canReopenCash, canReversePayment } from "./permissions";
import { canArchiveDeliveredOrder, canEditOrderSensitive, canManageOrderDesignImages, canPurgeCancelledOrder } from "./permissions";

describe("M3 permissions", () => {
  it("allows Attention to create manual orders without catalog administration", () => {
    expect(canCreateManualOrder("attention")).toBe(true);
    expect(canManageCatalogs("attention")).toBe(false);
    expect(canReadOrderFinancials("attention")).toBe(true);
  });

  it("does not grant Employee new M3 capabilities", () => {
    expect(canCreateManualOrder("employee")).toBe(false);
    expect(canManageCatalogs("employee")).toBe(false);
    expect(canReadOrderFinancials("employee")).toBe(false);
  });

  it("allows every active operational role to request a non-financial movement", () => {
    for (const role of ["super_admin", "admin", "attention", "employee"] as const) {
      expect(canMoveOrder(role)).toBe(true);
    }
  });
});

describe("stage permissions", () => {
  it("allows only Super admin and Admin", () => {
    expect(canManageStages("super_admin")).toBe(true);
    expect(canManageStages("admin")).toBe(true);
    expect(canManageStages("attention")).toBe(false);
    expect(canManageStages("employee")).toBe(false);
  });
});

describe("cash permissions", () => {
  const profile = { id: "profile-id", displayName: "Operador", isActive: true, mustChangePassword: false };

  it.each([
    ["super_admin", true],
    ["admin", true],
    ["attention", true],
    ["employee", false],
  ] as const)("evaluates the %s role", (role, expected) => {
    expect(canOperateCash({ ...profile, role })).toBe(expected);
  });

  it("rejects inactive profiles and pending password changes", () => {
    expect(canOperateCash({ ...profile, role: "attention", isActive: false })).toBe(false);
    expect(canOperateCash({ ...profile, role: "attention", mustChangePassword: true })).toBe(false);
  });

  it("allows only managers to close cash", () => {
    expect(canCloseCash("super_admin")).toBe(true);
    expect(canCloseCash("admin")).toBe(true);
    expect(canCloseCash("attention")).toBe(false);
    expect(canCloseCash("employee")).toBe(false);
  });

  it("allows active cash roles to reopen but not Employee", () => {
    expect(canReopenCash("super_admin")).toBe(true);
    expect(canReopenCash("admin")).toBe(true);
    expect(canReopenCash("attention")).toBe(true);
    expect(canReopenCash("employee")).toBe(false);
  });
});

describe("payment permissions", () => {
  it("allows only financial operational roles to confirm payment", () => {
    expect(canConfirmPayment("super_admin")).toBe(true);
    expect(canConfirmPayment("admin")).toBe(true);
    expect(canConfirmPayment("attention")).toBe(true);
    expect(canConfirmPayment("employee")).toBe(false);
  });

  it("allows only managers to reverse payment", () => {
    expect(canReversePayment("super_admin")).toBe(true);
    expect(canReversePayment("admin")).toBe(true);
    expect(canReversePayment("attention")).toBe(true);
    expect(canReversePayment("employee")).toBe(false);
  });
});

describe("PR2 approved order authority", () => {
  it("grants Attention approved order and image management without unrelated administration", () => {
    expect(canEditOrderSensitive("attention")).toBe(true);
    expect(canManageOrderDesignImages("attention")).toBe(true);
    expect(canManageCatalogs("attention")).toBe(false);
    expect(canManageStages("attention")).toBe(false);
    expect(canManageOrderDesignImages("employee")).toBe(false);
    expect(canEditOrderSensitive("employee")).toBe(false);
  });
});

describe("order lifecycle permissions", () => {
  it("limits cancellation, archive, and restoration to managers", () => {
    expect(canManageOrderLifecycle("super_admin")).toBe(true);
    expect(canManageOrderLifecycle("admin")).toBe(true);
    expect(canManageOrderLifecycle("attention")).toBe(false);
    expect(canManageOrderLifecycle("employee")).toBe(false);
  });

  it("separates delivered archive and cancelled purge authority", () => {
    expect(canArchiveDeliveredOrder("super_admin")).toBe(true);
    expect(canArchiveDeliveredOrder("admin")).toBe(true);
    expect(canArchiveDeliveredOrder("attention")).toBe(false);
    expect(canArchiveDeliveredOrder("employee")).toBe(false);
    expect(canPurgeCancelledOrder("super_admin")).toBe(true);
    expect(canPurgeCancelledOrder("admin")).toBe(false);
  });
});
