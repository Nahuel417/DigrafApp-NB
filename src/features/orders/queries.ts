import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canCreateManualOrder } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type OrderCatalogValue = {
  id: string;
  value: string;
};

export type OrderCatalogOption = {
  id: string;
  name: string;
  selectionMode: Database["public"]["Enums"]["catalog_option_selection_mode"];
  values: OrderCatalogValue[];
};

export type OrderCatalogProduct = {
  id: string;
  kind: Database["public"]["Enums"]["catalog_product_kind"];
  garmentLayer: Database["public"]["Enums"]["garment_layer"] | null;
  name: string;
  options: OrderCatalogOption[];
};

export type LegacyCatalogOption = {
  id: string;
  name: string;
};

export type OrderFormCatalogs = {
  garments: OrderCatalogProduct[];
  flags: OrderCatalogProduct[];
  bags: OrderCatalogProduct[];
  shields: OrderCatalogProduct[];
  necklines: LegacyCatalogOption[];
  upperPatterns: LegacyCatalogOption[];
  lowerPatterns: LegacyCatalogOption[];
  fabrics: LegacyCatalogOption[];
  extras: LegacyCatalogOption[];
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
  const [{ data: products, error: productsError }, { data: options, error: optionsError }, { data: values, error: valuesError }, { data: legacyItems, error: legacyItemsError }] = await Promise.all([
    supabase.from("catalog_products").select("id, kind, garment_layer, name").eq("is_active", true).order("kind").order("name"),
    supabase.from("catalog_product_options").select("id, product_id, name, selection_mode, position").eq("is_active", true).order("position"),
    supabase.from("catalog_product_option_values").select("id, option_id, value, position").eq("is_active", true).order("position"),
    supabase.from("catalog_items").select("id, kind, name").eq("is_active", true).neq("kind", "garment").order("kind").order("name"),
  ]);

  if (productsError || optionsError || valuesError || legacyItemsError) throw new Error("No se pudieron cargar las opciones del pedido.");

  const valuesByOption = new Map<string, OrderCatalogValue[]>();
  for (const value of values ?? []) {
    const current = valuesByOption.get(value.option_id) ?? [];
    current.push({ id: value.id, value: value.value });
    valuesByOption.set(value.option_id, current);
  }
  const optionsByProduct = new Map<string, OrderCatalogOption[]>();
  for (const option of options ?? []) {
    const current = optionsByProduct.get(option.product_id) ?? [];
    current.push({ id: option.id, name: option.name, selectionMode: option.selection_mode, values: valuesByOption.get(option.id) ?? [] });
    optionsByProduct.set(option.product_id, current);
  }
  const items = (products ?? []).map((product) => ({ id: product.id, kind: product.kind, garmentLayer: product.garment_layer, name: product.name, options: optionsByProduct.get(product.id) ?? [] }));
  const legacy = legacyItems ?? [];
  return {
    garments: items.filter((item) => item.kind === "garment"),
    flags: items.filter((item) => item.kind === "flag"),
    bags: items.filter((item) => item.kind === "bag"),
    shields: items.filter((item) => item.kind === "shield"),
    necklines: legacy.filter((item) => item.kind === "neckline"),
    upperPatterns: legacy.filter((item) => item.kind === "upper_pattern"),
    lowerPatterns: legacy.filter((item) => item.kind === "lower_pattern"),
    fabrics: legacy.filter((item) => item.kind === "fabric"),
    extras: legacy.filter((item) => item.kind === "extra"),
  };
}
