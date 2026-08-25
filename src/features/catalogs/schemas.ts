import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

export const catalogItemKinds = [
  "garment",
  "neckline",
  "upper_pattern",
  "lower_pattern",
  "fabric",
  "extra",
] as const satisfies readonly Database["public"]["Enums"]["catalog_item_kind"][];

export type CatalogItemKind = (typeof catalogItemKinds)[number];
export const productCatalogKinds = ["flag", "bag", "shield"] as const;
export type ProductCatalogKind = (typeof productCatalogKinds)[number];
export type CatalogManagerKind = CatalogItemKind | ProductCatalogKind;
export type GarmentLayer = Database["public"]["Enums"]["garment_layer"];

export const catalogItemKindLabels: Record<CatalogItemKind, string> = {
  garment: "Prendas",
  neckline: "Cuellos",
  upper_pattern: "Moldes superiores",
  lower_pattern: "Moldes de short/pollera",
  fabric: "Telas",
  extra: "Extras",
};

export const productCatalogKindLabels: Record<ProductCatalogKind, string> = {
  flag: "Banderas",
  bag: "Bolsos",
  shield: "Escudos",
};

export const catalogManagerKinds: readonly CatalogManagerKind[] = [...catalogItemKinds, ...productCatalogKinds];

export const garmentLayerLabels: Record<GarmentLayer, string> = {
  upper: "Prenda superior",
  lower: "Prenda inferior",
};

export const catalogItemSchema = z
  .object({
    kind: z.enum(catalogItemKinds),
    garmentLayer: z.enum(["", "upper", "lower"]),
    name: z.string().trim().min(2, "Ingresá un nombre de al menos 2 caracteres.").max(100, "El nombre no puede superar los 100 caracteres."),
  })
  .superRefine((value, context) => {
    if (value.kind === "garment" && value.garmentLayer === "") {
      context.addIssue({ code: "custom", path: ["garmentLayer"], message: "Indicá si la prenda es superior o inferior." });
    }

    if (value.kind !== "garment" && value.garmentLayer !== "") {
      context.addIssue({ code: "custom", path: ["garmentLayer"], message: "Solo las prendas tienen clasificación." });
    }
  });

export const renameCatalogItemSchema = z.object({
  itemId: z.string().uuid("El ítem seleccionado no es válido."),
  name: z.string().trim().min(2, "Ingresá un nombre de al menos 2 caracteres.").max(100, "El nombre no puede superar los 100 caracteres."),
});

export const catalogItemIdSchema = z.object({
  itemId: z.string().uuid("El ítem seleccionado no es válido."),
});

export const catalogProductSchema = z.object({
  kind: z.enum(productCatalogKinds),
  name: z.string().trim().min(2, "Ingresá un nombre de al menos 2 caracteres.").max(100, "El nombre no puede superar los 100 caracteres."),
});

export function catalogItemKindLabel(kind: CatalogItemKind) {
  return catalogItemKindLabels[kind];
}

export function catalogManagerKindLabel(kind: CatalogManagerKind) {
  return kind in productCatalogKindLabels
    ? productCatalogKindLabels[kind as ProductCatalogKind]
    : catalogItemKindLabels[kind as CatalogItemKind];
}
