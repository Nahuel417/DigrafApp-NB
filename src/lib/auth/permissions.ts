import type { Database } from "@/lib/supabase/database.types";
import type { CurrentProfile } from "./current-profile";

export type AppRole = Database["public"]["Enums"]["app_role"];

export function canCreateManualOrder(role: AppRole) {
  return role === "super_admin" || role === "admin" || role === "attention";
}

export function canManageCatalogs(role: AppRole) {
  return role === "super_admin" || role === "admin";
}

export function canManageStages(role: AppRole) {
  return role === "super_admin" || role === "admin";
}

export function canManageUsers(role: AppRole) {
  return role === "super_admin" || role === "admin";
}

export function canReadOrderFinancials(role: AppRole) {
  return role === "super_admin" || role === "admin" || role === "attention";
}

export function canConfirmPayment(role: AppRole) {
  return canReadOrderFinancials(role);
}

export function canDeliverPaidOrder(role: AppRole) {
  return role === "super_admin" || role === "admin" || role === "attention";
}

export function canReversePayment(role: AppRole) {
  return role === "super_admin" || role === "admin" || role === "attention";
}

export function canManageOrderLifecycle(role: AppRole) {
  return role === "super_admin" || role === "admin";
}

export function canArchiveDeliveredOrder(role: AppRole) {
  return canManageOrderLifecycle(role);
}

export function canPurgeCancelledOrder(role: AppRole) {
  return role === "super_admin" || role === "admin";
}

export function canMoveOrder(role: AppRole) {
  return role === "super_admin" || role === "admin" || role === "attention" || role === "employee";
}

export function canEditOrderSensitive(role: AppRole) {
  return role === "super_admin" || role === "admin" || role === "attention";
}

export function canManageOrderDesignImages(role: AppRole) {
  return role === "super_admin" || role === "admin" || role === "attention";
}

export function canEditOrderDescription(role: AppRole) {
  return role === "super_admin" || role === "admin" || role === "attention" || role === "employee";
}

export function canOperateCash(profile: Pick<CurrentProfile, "isActive" | "mustChangePassword" | "role">) {
  return profile.isActive && !profile.mustChangePassword && (profile.role === "super_admin" || profile.role === "admin" || profile.role === "attention");
}

export function canCloseCash(role: AppRole) {
  return role === "super_admin" || role === "admin";
}

export function canReopenCash(role: AppRole) {
  return role === "super_admin" || role === "admin" || role === "attention";
}
