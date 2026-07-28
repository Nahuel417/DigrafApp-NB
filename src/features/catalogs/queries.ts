import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canManageCatalogs } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type CatalogItem = Pick<
  Tables<"catalog_items">,
  "id" | "kind" | "garment_layer" | "name" | "is_active"
>;

export async function getCatalogItems() {
  const profile = await getCurrentProfile();
  if (!profile || profile.mustChangePassword || !canManageCatalogs(profile.role)) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("id, kind, garment_layer, name, is_active")
    .order("kind")
    .order("name");

  if (error) throw new Error("No se pudieron cargar los catálogos.");
  return data;
}
