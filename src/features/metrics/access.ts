import type { AppRole } from "@/lib/auth/permissions";

export function canViewMetrics(role: AppRole) {
  return role === "super_admin" || role === "admin";
}
