import { describe, expect, it } from "vitest";

import { canManageFabricStock, canOperateStock, canViewStockHistory } from "./permissions";

describe("stock permissions", () => {
  it("lets employees create, purchase and consume only", () => {
    expect(canOperateStock("employee", "create")).toBe(true);
    expect(canOperateStock("employee", "purchase")).toBe(true);
    expect(canOperateStock("employee", "consumption")).toBe(true);
    expect(canOperateStock("employee", "cancel")).toBe(false);
    expect(canOperateStock("employee", "rename")).toBe(false);
    expect(canOperateStock("employee", "activate")).toBe(false);
  });

  it("keeps full stock management for managers", () => {
    for (const role of ["super_admin", "admin"] as const) {
      expect(canManageFabricStock(role)).toBe(true);
      for (const action of ["create", "purchase", "consumption", "cancel", "rename", "activate"] as const) {
        expect(canOperateStock(role, action)).toBe(true);
      }
    }
  });

  it("does not grant stock operations to attention", () => {
    expect(canManageFabricStock("attention")).toBe(false);
    for (const action of ["create", "purchase", "consumption", "cancel", "rename", "activate"] as const) {
      expect(canOperateStock("attention", action)).toBe(false);
    }
  });

  it("allows history only for managers and attention", () => {
    expect(canViewStockHistory("super_admin")).toBe(true);
    expect(canViewStockHistory("admin")).toBe(true);
    expect(canViewStockHistory("attention")).toBe(true);
    expect(canViewStockHistory("employee")).toBe(false);
  });
});