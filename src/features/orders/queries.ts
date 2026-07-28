import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canCreateManualOrder } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export type OrderCatalogOption = {
  id: string;
  kind: "garment" | "neckline" | "upper_pattern" | "lower_pattern" | "fabric" | "extra";
  garment_layer: "upper" | "lower" | null;
  name: string;
};

export type OrderFormCatalogs = {
  garments: OrderCatalogOption[];
  necklines: OrderCatalogOption[];
  upperPatterns: OrderCatalogOption[];
  lowerPatterns: OrderCatalogOption[];
  fabrics: OrderCatalogOption[];
  extras: OrderCatalogOption[];
};

export async function getOrderFormCatalogs(): Promise<OrderFormCatalogs | null> {
  const profile = await getCurrentProfile();
  if (
    !profile
    || profile.mustChangePassword
    || !canCreateManualOrder(profile.role)
  ) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("id, kind, garment_layer, name")
    .eq("is_active", true)
    .order("kind")
    .order("name");

  if (error) throw new Error("No se pudieron cargar las opciones del pedido.");

  const items = data as OrderCatalogOption[];
  return {
    garments: items.filter((item) => item.kind === "garment"),
    necklines: items.filter((item) => item.kind === "neckline"),
    upperPatterns: items.filter((item) => item.kind === "upper_pattern"),
    lowerPatterns: items.filter((item) => item.kind === "lower_pattern"),
    fabrics: items.filter((item) => item.kind === "fabric"),
    extras: items.filter((item) => item.kind === "extra"),
  };
}
