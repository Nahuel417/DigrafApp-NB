import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { AppRole } from "./schemas";

export type ManagedUser = {
  id: string;
  displayName: string;
  email: string;
  role: AppRole;
  isActive: boolean;
  mustChangePassword: boolean;
};

export async function getManagedUsers() {
  const actor = await getCurrentProfile();
  if (!actor || (actor.role !== "super_admin" && actor.role !== "admin")) return null;

  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, is_active, must_change_password")
    .order("display_name");
  if (error) throw new Error("No se pudieron cargar los usuarios.");

  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (authError) throw new Error("No se pudieron cargar los emails de usuarios.");

  const emailById = new Map(authData.users.map((user) => [user.id, user.email ?? "Sin email"]));
  return profiles.map((profile) => ({
    id: profile.id,
    displayName: profile.display_name,
    email: emailById.get(profile.id) ?? "Sin email",
    role: profile.role,
    isActive: profile.is_active,
    mustChangePassword: profile.must_change_password,
  }));
}
