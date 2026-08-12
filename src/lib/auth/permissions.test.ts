import { describe, expect, it } from "vitest";

import { canCloseCash, canCreateManualOrder, canManageCatalogs, canManageStages, canMoveOrder, canOperateCash, canReadOrderFinancials, canReopenCash } from "./permissions";

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
