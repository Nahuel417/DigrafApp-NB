import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canManageCatalogs } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type CatalogItem = Pick<
  Tables<"catalog_items">,
  "id" | "kind" | "garment_layer" | "name" | "is_active"
>;

export type CatalogProduct = Pick<Tables<"catalog_products">, "id" | "kind" | "name" | "is_active">;

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

export async function getProductCatalogs() {
  const profile = await getCurrentProfile();
  if (!profile || profile.mustChangePassword || !canManageCatalogs(profile.role)) return null;

  const supabase = await createClient();
  const { data: products, error } = await supabase
    .from("catalog_products")
    .select("id, kind, name, is_active")
    .neq("kind", "garment")
    .order("kind")
    .order("name");
  if (error) throw new Error("No se pudieron cargar los nuevos catálogos.");
  return { products };
}
