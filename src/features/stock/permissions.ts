import type { CurrentProfile } from "@/lib/auth/current-profile";

import type { StockOperation } from "./schemas";

type StockAction = StockOperation["action"];

export function canManageFabricStock(role: CurrentProfile["role"]) {
  return role === "super_admin" || role === "admin";
}

export function canOperateStock(role: CurrentProfile["role"], action: StockAction) {
  if (canManageFabricStock(role)) return true;
  return role === "employee"
    && (action === "create" || action === "purchase" || action === "consumption");
}

export function canViewStockHistory(role: CurrentProfile["role"]) {
  return role === "super_admin" || role === "admin" || role === "attention";
}
