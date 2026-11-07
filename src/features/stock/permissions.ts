import type { CurrentProfile } from "@/lib/auth/current-profile";

export function canManageFabricStock(role: CurrentProfile["role"]) {
  return role === "super_admin" || role === "admin";
}
