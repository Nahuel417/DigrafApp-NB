import { describe, expect, it } from "vitest";

import { canCreateManualOrder, canManageCatalogs, canMoveOrder, canReadOrderFinancials } from "./permissions";

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
