import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canManagePrices } from "@/lib/auth/permissions";

import { createPricingClient } from "./rpc";
import type { ImportedPrice } from "./importer";

export type PriceProduct = ImportedPrice & { id: string };
export type PriceList = { products: PriceProduct[] };

export async function getPriceList(): Promise<PriceList | null> {
  const profile = await getCurrentProfile();
  if (!profile || profile.mustChangePassword || !canManagePrices(profile.role)) return null;
  const { data, error } = await (await createPricingClient()).rpc("get_price_list");
  if (error || !data || typeof data !== "object") throw new Error("No se pudo cargar la lista de precios.");
  const value = data as { products?: PriceProduct[] };
  return { products: (value.products ?? []).map((product) => ({ ...product, group: product.group ?? (product as PriceProduct & { group_name?: PriceProduct["group"] }).group_name!, active: product.active ?? (product as PriceProduct & { is_active?: boolean }).is_active! })) };
}
