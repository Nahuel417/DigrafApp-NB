"use server";

import { revalidatePath } from "next/cache";

import { mutationResult, type MutationState } from "@/lib/action-state";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canManageCatalogs } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { catalogCategorySchema, catalogItemIdSchema, catalogItemSchema, catalogProductSchema, productCatalogKindLabels, renameCatalogItemSchema } from "./schemas";

export type CatalogActionState = MutationState;

function formValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

async function currentCatalogManager() {
  const profile = await getCurrentProfile();
  if (
    !profile
    || profile.mustChangePassword
    || !canManageCatalogs(profile.role)
  ) {
    return null;
  }

  return profile;
}

function catalogErrorMessage(message: string) {
  const knownMessages = [
    "No tenés permiso para administrar catálogos.",
    "Seleccioná un tipo de catálogo.",
    "La clasificación de la prenda no es válida.",
    "Una prenda debe indicar si es superior o inferior.",
    "Solo las prendas tienen clasificación superior o inferior.",
    "Ya existe un ítem con ese nombre en el catálogo.",
    "El ítem de catálogo seleccionado no existe.",
    "El nombre debe tener entre 2 y 100 caracteres.",
  ];

  return knownMessages.find((knownMessage) => message.includes(knownMessage)) ?? "No se pudo actualizar el catálogo. Intentá nuevamente.";
}

export async function createCatalogItemAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = catalogItemSchema.safeParse({
    kind: formValue(formData, "kind"),
    garmentLayer: formValue(formData, "garmentLayer"),
    name: formValue(formData, "name"),
  });

  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá los datos del catálogo.", parsed.error.flatten().fieldErrors);
  }

  if (!await currentCatalogManager()) {
    return mutationResult("error", "No tenés permiso para administrar catálogos.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_catalog_item", {
    target_kind: parsed.data.kind,
    target_garment_layer: parsed.data.garmentLayer,
    target_name: parsed.data.name,
  });

  if (error) return mutationResult("error", catalogErrorMessage(error.message));

  revalidatePath("/catalogs");
  return {
    ...mutationResult("success", "Ítem de catálogo creado correctamente."),
    resetKey: crypto.randomUUID(),
  };
}

export async function renameCatalogItemAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = renameCatalogItemSchema.safeParse({
    itemId: formValue(formData, "itemId"),
    name: formValue(formData, "name"),
  });

  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá el nombre del catálogo.", parsed.error.flatten().fieldErrors);
  }

  if (!await currentCatalogManager()) {
    return mutationResult("error", "No tenés permiso para administrar catálogos.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_catalog_item", {
    target_id: parsed.data.itemId,
    target_name: parsed.data.name,
  });

  if (error) return mutationResult("error", catalogErrorMessage(error.message));

  revalidatePath("/catalogs");
  return mutationResult("success", "Ítem de catálogo renombrado correctamente.");
}

export async function deleteCatalogItemAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = catalogItemIdSchema.safeParse({ itemId: formValue(formData, "itemId") });

  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "La acción de catálogo no es válida.");
  }

  if (!await currentCatalogManager()) {
    return mutationResult("error", "No tenés permiso para administrar catálogos.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_catalog_item", {
    target_id: parsed.data.itemId,
  });

  if (error) return mutationResult("error", catalogErrorMessage(error.message));

  revalidatePath("/catalogs");
  return mutationResult("success", "Ítem de catálogo eliminado.");
}

export async function createCatalogProductAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const parsed = catalogProductSchema.safeParse({ kind: formValue(formData, "kind"), name: formValue(formData, "name"), categoryId: formValue(formData, "categoryId") });
  if (!parsed.success) return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá los datos del producto.", parsed.error.flatten().fieldErrors);
  if (!await currentCatalogManager()) return mutationResult("error", "No tenés permiso para administrar catálogos.");
  const supabase = await createClient();
  const code = `${parsed.data.kind}s`;
  const { data: sectionId, error: sectionError } = await supabase.rpc("ensure_catalog_section", { target_code: code, target_name: productCatalogKindLabels[parsed.data.kind] });
  if (sectionError) return mutationResult("error", catalogErrorMessage(sectionError.message));
  if (!sectionId) return mutationResult("error", "No se pudo determinar la sección del catálogo.");
  const { error } = parsed.data.categoryId
    ? await supabase.rpc("create_catalog_product", { target_section_id: sectionId, target_kind: parsed.data.kind, target_category_id: parsed.data.categoryId, target_name: parsed.data.name })
    : await supabase.rpc("create_catalog_product_without_category", { target_section_id: sectionId, target_kind: parsed.data.kind, target_name: parsed.data.name });
  if (error) return mutationResult("error", catalogErrorMessage(error.message));
  revalidatePath("/catalogs");
  revalidatePath("/orders/new");
  return { ...mutationResult("success", "Producto creado correctamente."), resetKey: crypto.randomUUID() };
}

export async function renameCatalogProductAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const parsed = renameCatalogItemSchema.safeParse({ itemId: formValue(formData, "itemId"), name: formValue(formData, "name") });
  if (!parsed.success) return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá el nombre.", parsed.error.flatten().fieldErrors);
  if (!await currentCatalogManager()) return mutationResult("error", "No tenés permiso para administrar catálogos.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_catalog_product", { target_id: parsed.data.itemId, target_name: parsed.data.name });
  if (error) return mutationResult("error", catalogErrorMessage(error.message));
  revalidatePath("/catalogs"); revalidatePath("/orders/new");
  return mutationResult("success", "Producto renombrado correctamente.");
}

export async function setCatalogProductActiveAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const parsed = catalogItemIdSchema.safeParse({ itemId: formValue(formData, "itemId") });
  if (!parsed.success) return mutationResult("error", parsed.error.issues[0]?.message ?? "La acción no es válida.");
  if (!await currentCatalogManager()) return mutationResult("error", "No tenés permiso para administrar catálogos.");
  const isActive = formValue(formData, "isActive") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_catalog_product_active", { target_id: parsed.data.itemId, target_is_active: isActive });
  if (error) return mutationResult("error", catalogErrorMessage(error.message));
  revalidatePath("/catalogs"); revalidatePath("/orders/new");
  return mutationResult("success", isActive ? "Producto activado." : "Producto desactivado.");
}

export async function createCatalogCategoryAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const parsed = catalogCategorySchema.safeParse({ name: formValue(formData, "name") });
  if (!parsed.success) return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá la categoría.", parsed.error.flatten().fieldErrors);
  if (!await currentCatalogManager()) return mutationResult("error", "No tenés permiso para administrar catálogos.");
  const supabase = await createClient();
  const { data: sectionId, error: sectionError } = await supabase.rpc("ensure_catalog_section", { target_code: "shields", target_name: "Escudos" });
  if (sectionError) return mutationResult("error", catalogErrorMessage(sectionError.message));
  if (!sectionId) return mutationResult("error", "No se pudo determinar la sección del catálogo.");
  const { error } = await supabase.rpc("create_catalog_category", { target_section_id: sectionId, target_name: parsed.data.name });
  if (error) return mutationResult("error", catalogErrorMessage(error.message));
  revalidatePath("/catalogs");
  return { ...mutationResult("success", "Categoría creada correctamente."), resetKey: crypto.randomUUID() };
}

export async function renameCatalogCategoryAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const parsed = renameCatalogItemSchema.safeParse({ itemId: formValue(formData, "itemId"), name: formValue(formData, "name") });
  if (!parsed.success) return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá la categoría.", parsed.error.flatten().fieldErrors);
  if (!await currentCatalogManager()) return mutationResult("error", "No tenés permiso para administrar catálogos.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_catalog_category", { target_id: parsed.data.itemId, target_name: parsed.data.name });
  if (error) return mutationResult("error", catalogErrorMessage(error.message));
  revalidatePath("/catalogs"); return mutationResult("success", "Categoría renombrada correctamente.");
}

export async function setCatalogCategoryActiveAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const parsed = catalogItemIdSchema.safeParse({ itemId: formValue(formData, "itemId") });
  if (!parsed.success) return mutationResult("error", parsed.error.issues[0]?.message ?? "La acción no es válida.");
  if (!await currentCatalogManager()) return mutationResult("error", "No tenés permiso para administrar catálogos.");
  const isActive = formValue(formData, "isActive") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_catalog_category_active", { target_id: parsed.data.itemId, target_is_active: isActive });
  if (error) return mutationResult("error", catalogErrorMessage(error.message));
  revalidatePath("/catalogs"); return mutationResult("success", isActive ? "Categoría activada." : "Categoría desactivada.");
}
