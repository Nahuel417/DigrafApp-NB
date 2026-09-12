"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { mutationResult, type MutationState } from "@/lib/action-state";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canManagePrices } from "@/lib/auth/permissions";

import { importedPriceSchema, optionalCodeSchema, parsePriceText, type ImportedPrice } from "./importer";
import { parsePriceFile } from "./file-importer";
import { createPricingClient } from "./rpc";

const idSchema = z.string().uuid();
const productSchema = z.object({ id: z.string().uuid().optional(), code: optionalCodeSchema, group: z.enum(["adults", "children", "flags", "additions"], { error: "Elegí un grupo." }), name: z.string().trim().min(2, { error: "Ingresá un nombre de al menos 2 caracteres." }).max(120, { error: "El nombre no puede superar 120 caracteres." }), unit: z.enum(["unidad", "metro_lineal"], { error: "Elegí una unidad." }), price: z.string().trim().refine((value) => /^\d{1,12}(?:[.,]\d{1,2})?$/.test(value) && Number(value.replace(",", ".")) > 0, { error: "Ingresá un precio válido (hasta 2 decimales)." }), active: z.enum(["true", "false"]).transform((value) => value === "true") });

async function authorized() {
  const profile = await getCurrentProfile();
  return profile && !profile.mustChangePassword && canManagePrices(profile.role) ? profile : null;
}

function errorMessage(error: { message: string } | null, fallback: string) {
  return error?.message?.includes("No tenés permiso") ? error.message : fallback;
}

export async function upsertPriceProductAction(_previous: MutationState, formData: FormData): Promise<MutationState> {
  const parsed = productSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return mutationResult("error", "Revisá grupo, nombre, unidad y precio. El código es opcional.", parsed.error.flatten().fieldErrors);
  if (!await authorized()) return mutationResult("error", "No tenés permiso para administrar precios.");
  const client = await createPricingClient();
  const { error } = await client.rpc("upsert_price_product", { p_id: parsed.data.id ?? null, p_code: parsed.data.code, p_group: parsed.data.group, p_name: parsed.data.name, p_unit: parsed.data.unit, p_price: parsed.data.price.replace(",", "."), p_is_active: parsed.data.active });
  if (error) return mutationResult("error", errorMessage(error, "No se pudo guardar el precio."));
  revalidatePath("/commercial"); revalidatePath("/orders/new");
  return { ...mutationResult("success", "Precio guardado."), resetKey: crypto.randomUUID() };
}

export async function deletePriceProductAction(_previous: MutationState, formData: FormData): Promise<MutationState> {
  const parsed = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!parsed.success) return mutationResult("error", "El precio seleccionado no es válido.");
  if (!await authorized()) return mutationResult("error", "No tenés permiso para administrar precios.");
  const { error } = await (await createPricingClient()).rpc("delete_price_product", { p_id: parsed.data });
  if (error) return mutationResult("error", errorMessage(error, "No se pudo eliminar el precio."));
  revalidatePath("/commercial"); revalidatePath("/orders/new");
  return mutationResult("success", "Precio eliminado definitivamente.");
}

export type PriceImportState = MutationState & { preview?: ImportedPrice[] };

export async function previewPricesAction(_previous: PriceImportState, formData: FormData): Promise<PriceImportState> {
  const file = formData.get("file");
  const pasted = String(formData.get("pasted") ?? "").trim();
  if (!(file instanceof File) && !pasted) return mutationResult("error", "Seleccioná un archivo o pegá una tabla.");
  if (!await authorized()) return mutationResult("error", "No tenés permiso para importar precios.");
  try {
    const rows = pasted ? parsePriceText(pasted) : await parsePriceFile(file as File);
    return { ...mutationResult("success", `${rows.length} filas listas para revisar.`), preview: rows };
  } catch (error) {
    return mutationResult("error", error instanceof Error ? error.message : "No se pudo leer el archivo.");
  }
}

export async function importPricesAction(_previous: PriceImportState, formData: FormData): Promise<PriceImportState> {
  if (!await authorized()) return mutationResult("error", "No tenés permiso para importar precios.");
  let rows: ImportedPrice[];
  try {
    const parsed = z.array(importedPriceSchema).max(1000).min(1).safeParse(JSON.parse(String(formData.get("rows") ?? "")));
    if (!parsed.success) throw new Error("La vista previa ya no es válida. Volvé a cargar el archivo.");
    rows = parsed.data;
  } catch (error) {
    return mutationResult("error", error instanceof Error ? error.message : "La vista previa no es válida.");
  }
  const { error } = await (await createPricingClient()).rpc("import_price_products", { p_rows: rows });
  if (error) return mutationResult("error", errorMessage(error, "No se importó el lote. No se cambió ningún precio."));
  revalidatePath("/commercial"); revalidatePath("/orders/new");
  return mutationResult("success", `${rows.length} precios importados correctamente.`);
}
