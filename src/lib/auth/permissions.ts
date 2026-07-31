import type { Database } from "@/lib/supabase/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export function canCreateManualOrder(role: AppRole) {
  return role === "super_admin" || role === "admin" || role === "attention";
}

export function canManageCatalogs(role: AppRole) {
  return role === "super_admin" || role === "admin";
}

export function canManageUsers(role: AppRole) {
  return role === "super_admin" || role === "admin";
}

export function canReadOrderFinancials(role: AppRole) {
  return role === "super_admin" || role === "admin" || role === "attention";
}

export function canMoveOrder(role: AppRole) {
  return role === "super_admin" || role === "admin" || role === "attention" || role === "employee";
}

export function canEditOrderSensitive(role: AppRole) {
  return role === "super_admin" || role === "admin";
}

export function canEditOrderDescription(role: AppRole) {
  return role === "super_admin" || role === "admin" || role === "attention" || role === "employee";
}
