"use server";

import { revalidatePath } from "next/cache";

import { mutationResult, type MutationState } from "@/lib/action-state";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canManageOrderDesignImages } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import {
  buildOrderDesignObjectPath,
  buildOrderDesignPreviewObjectPath,
  ORDER_DESIGN_BUCKET,
  type OrderDesignImageAction,
  type OrderDesignContentType,
} from "./image-contracts";
import {
  getOrderDesignImagePreviewReadUrl,
  getOrderDesignImageReadUrl,
  getOrderDesignImagesPreviewReadUrls,
  getOrderDesignImagesReadUrls,
} from "./image-queries";
import {
  finalizeOrderDesignImageSchema,
  orderDesignImageMutationSchema,
  orderDesignImageReadUrlSchema,
  orderDesignImageUploadIntentSchema,
} from "./image-schemas";
import { verifyUploadedOrderDesignImage } from "./image-validation";
import { generateOrderDesignImagePreview } from "./image-preview";

type FinalizeOrderDesignImageRpcArgs = Database["public"]["Functions"]["finalize_order_design_image"]["Args"];
type MutateOrderDesignImageRpcArgs = Database["public"]["Functions"]["mutate_order_design_image"]["Args"];

export type OrderDesignImageUploadIntent = {
  action: "add" | "replace";
  bucketId: typeof ORDER_DESIGN_BUCKET;
  byteSize: number;
  contentType: OrderDesignContentType;
  expectedImageUpdatedAt: string | null;
  objectPath: string;
  orderId: string;
  imageId: string | null;
};

export type StartOrderDesignImageUploadActionState = MutationState & {
  uploadIntent?: OrderDesignImageUploadIntent;
};

export type FinalizeOrderDesignImageActionState = MutationState & {
  image?: {
    eventId: string;
    imageUpdatedAt: string;
    objectPath: string;
    orderId: string;
    previousObjectPath: string | null;
  };
};

export type MutateOrderDesignImageActionState = MutationState & {
  image?: {
    action: OrderDesignImageAction;
    byteSize: number | null;
    contentType: string | null;
    eventId: string;
    imageId: string | null;
    isPrimary: boolean | null;
    objectPath: string | null;
    orderId: string;
    previousObjectPath: string | null;
    updatedAt: string | null;
  };
};

export type GetOrderDesignImageReadUrlActionState = MutationState & {
  image?: Awaited<ReturnType<typeof getOrderDesignImageReadUrl>>;
};

export type GetOrderDesignImagePreviewReadUrlActionState = MutationState & {
  image?: Awaited<ReturnType<typeof getOrderDesignImagePreviewReadUrl>>;
};

export type GetOrderDesignImagesReadUrlsActionState = MutationState & {
  images?: Awaited<ReturnType<typeof getOrderDesignImagesReadUrls>>;
};

export type GetOrderDesignImagesPreviewReadUrlsActionState = MutationState & {
  images?: Awaited<ReturnType<typeof getOrderDesignImagesPreviewReadUrls>>;
};

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function uploadIntentInput(formData: FormData) {
  return {
    action: value(formData, "action") || "add",
    imageId: value(formData, "imageId"),
    orderId: value(formData, "orderId"),
    contentType: value(formData, "contentType"),
    byteSize: value(formData, "byteSize"),
    expectedImageUpdatedAt: value(formData, "expectedImageUpdatedAt"),
  };
}

function finalizeInput(formData: FormData) {
  return {
    orderId: value(formData, "orderId"),
    objectPath: value(formData, "objectPath"),
    contentType: value(formData, "contentType"),
    byteSize: value(formData, "byteSize"),
    expectedImageUpdatedAt: value(formData, "expectedImageUpdatedAt"),
    idempotencyKey: value(formData, "idempotencyKey"),
  };
}

function mutationInput(formData: FormData) {
  return {
    action: value(formData, "action"),
    byteSize: value(formData, "byteSize"),
    contentType: value(formData, "contentType"),
    expectedImageUpdatedAt: value(formData, "expectedImageUpdatedAt"),
    idempotencyKey: value(formData, "idempotencyKey"),
    imageId: value(formData, "imageId"),
    objectPath: value(formData, "objectPath"),
    orderId: value(formData, "orderId"),
  };
}

function canUseOrderDesignImage(profile: Awaited<ReturnType<typeof getCurrentProfile>>) {
  return Boolean(profile && profile.isActive && !profile.mustChangePassword && canManageOrderDesignImages(profile.role));
}

async function prepareOrderDesignPreview(
  storage: Awaited<ReturnType<typeof createClient>>["storage"],
  objectPath: string,
  contentType: OrderDesignContentType,
  byteSize: number,
) {
  const verification = await verifyUploadedOrderDesignImage(storage.from(ORDER_DESIGN_BUCKET), objectPath, contentType, byteSize);
  if (!verification.ok) return verification;

  const previewPath = buildOrderDesignPreviewObjectPath(objectPath);
  try {
    const bucket = createAdminClient().storage.from(ORDER_DESIGN_BUCKET);
    const existing = await bucket.info(previewPath);
    if (existing.data && !existing.error) {
      if (existing.data.contentType !== "image/webp" || typeof existing.data.size !== "number" || existing.data.size < 1) {
        return { ok: false as const, error: { message: "La vista previa guardada no es válida." } };
      }
      return { ok: true as const, previewPath };
    }
    if (existing.error && !("statusCode" in existing.error && String(existing.error.statusCode) === "404")
      && !/not found|does not exist|no such object/i.test(existing.error.message)) {
      return { ok: false as const, error: { message: "No se pudo verificar la vista previa de la imagen." } };
    }

    const preview = await generateOrderDesignImagePreview(verification.value.bytes, contentType, objectPath);
    if (!preview.ok) return preview;
    const { error } = await bucket.upload(previewPath, preview.value.bytes, {
      contentType: preview.value.contentType,
      cacheControl: "0",
      upsert: false,
    });
    if (error) {
      if (("statusCode" in error && String(error.statusCode) === "409") || /already exists|duplicate/i.test(error.message)) {
        const concurrent = await bucket.info(previewPath);
        if (!concurrent.error && concurrent.data?.contentType === "image/webp" && typeof concurrent.data.size === "number" && concurrent.data.size > 0) {
          return { ok: true as const, previewPath };
        }
      }
      return { ok: false as const, error: { message: "No se pudo guardar la vista previa de la imagen." } };
    }
  } catch {
    return { ok: false as const, error: { message: "No se pudo guardar la vista previa de la imagen." } };
  }

  return { ok: true as const, previewPath };
}

async function removeOrderDesignPreview(objectPath: string | null) {
  if (!objectPath) return;
  try {
    const previewPath = buildOrderDesignPreviewObjectPath(objectPath);
    await createAdminClient().storage.from(ORDER_DESIGN_BUCKET).remove([previewPath]);
  } catch {
    // Reconciliation retries sidecar cleanup without changing a committed image mutation.
  }
}

function imageErrorMessage(message: string) {
  const knownMessages = [
    "No tenés permiso para cargar imágenes del pedido.",
    "No tenés permiso para gestionar imágenes del pedido.",
    "La solicitud de imagen no es válida.",
    "El pedido seleccionado no existe.",
    "La imagen cambió en otra sesión. Actualizala e intentá nuevamente.",
    "La clave de idempotencia ya fue utilizada para otra imagen.",
    "La imagen seleccionada ya es la vigente.",
    "El archivo de imagen no está disponible o no cumple los límites permitidos.",
    "La carga de imagen venció. Volvé a cargar el archivo.",
    "El tipo de archivo no coincide con su extensión.",
    "Cada pedido puede tener como máximo tres imágenes.",
    "La imagen seleccionada no pertenece al pedido.",
    "La solicitud de imagen no es válida.",
  ];

  return knownMessages.find((knownMessage) => message.includes(knownMessage)) ?? "No se pudo guardar la imagen del pedido. Intentá nuevamente.";
}

function finalizeImageResult(result: {
  event_id: string;
  image_updated_at: string;
  object_path: string;
  order_id: string;
  previous_object_path: string | null;
}) {
  return {
    eventId: result.event_id,
    imageUpdatedAt: result.image_updated_at,
    objectPath: result.object_path,
    orderId: result.order_id,
    previousObjectPath: result.previous_object_path,
  };
}

function mutateImageResult(result: {
  action: OrderDesignImageAction;
  byte_size: number | null;
  content_type: string | null;
  event_id: string;
  image_id: string | null;
  is_primary: boolean | null;
  object_path: string | null;
  order_id: string;
  previous_object_path: string | null;
  updated_at: string | null;
}) {
  return {
    action: result.action,
    byteSize: result.byte_size,
    contentType: result.content_type,
    eventId: result.event_id,
    imageId: result.image_id,
    isPrimary: result.is_primary,
    objectPath: result.object_path,
    orderId: result.order_id,
    previousObjectPath: result.previous_object_path,
    updatedAt: result.updated_at,
  };
}

export async function startOrderDesignImageUploadAction(
  _previous: StartOrderDesignImageUploadActionState,
  formData: FormData,
): Promise<StartOrderDesignImageUploadActionState> {
  const parsed = orderDesignImageUploadIntentSchema.safeParse(uploadIntentInput(formData));
  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá los datos de la imagen.", parsed.error.flatten().fieldErrors);
  }

  const profile = await getCurrentProfile();
  if (!canUseOrderDesignImage(profile)) return mutationResult("error", "No tenés permiso para cargar imágenes del pedido.");

  const supabase = await createClient();
  const [{ data: order, error: orderError }, { data: currentImages, error: imageError }] = await Promise.all([
    supabase.from("orders").select("id").eq("id", parsed.data.orderId).maybeSingle(),
    supabase.from("order_design_images").select("id, updated_at, is_primary").eq("order_id", parsed.data.orderId).order("created_at").order("id"),
  ]);

  if (orderError || imageError) return mutationResult("error", "No se pudo validar el estado actual de la imagen.");
  if (!order) return mutationResult("error", "El pedido seleccionado no existe.");

  const currentImage = parsed.data.action === "replace"
    ? (currentImages ?? []).find((image) => image.id === parsed.data.imageId) ?? null
    : (currentImages ?? []).find((image) => image.is_primary) ?? null;
  if (parsed.data.action === "replace" && !currentImage) return mutationResult("error", "La imagen seleccionada no pertenece al pedido.");

  const currentUpdatedAt = currentImage?.updated_at ?? null;
  if (currentUpdatedAt !== parsed.data.expectedImageUpdatedAt) {
    return mutationResult("error", "La imagen cambió en otra sesión. Actualizala e intentá nuevamente.");
  }

  const objectPath = buildOrderDesignObjectPath(parsed.data.orderId, parsed.data.contentType);
  return {
    ...mutationResult("success", "Carga iniciada."),
    uploadIntent: {
      action: parsed.data.action,
      bucketId: ORDER_DESIGN_BUCKET,
      byteSize: parsed.data.byteSize,
      contentType: parsed.data.contentType,
      expectedImageUpdatedAt: currentUpdatedAt,
      objectPath,
      orderId: parsed.data.orderId,
      imageId: parsed.data.action === "replace" ? currentImage?.id ?? null : null,
    },
  };
}

export async function mutateOrderDesignImageAction(
  _previous: MutateOrderDesignImageActionState,
  formData: FormData,
): Promise<MutateOrderDesignImageActionState> {
  const parsed = orderDesignImageMutationSchema.safeParse(mutationInput(formData));
  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá los datos de la imagen.", parsed.error.flatten().fieldErrors);
  }

  const profile = await getCurrentProfile();
  if (!canUseOrderDesignImage(profile)) return mutationResult("error", "No tenés permiso para gestionar imágenes del pedido.");

  const supabase = await createClient();
  const { data: existingEvent, error: existingEventError } = await supabase
    .from("order_design_image_events")
    .select("id")
    .eq("actor_id", profile!.id)
    .eq("idempotency_key", parsed.data.idempotencyKey)
    .maybeSingle();
  if (existingEventError) return mutationResult("error", "No se pudo verificar el reintento de la imagen.");

  if (!existingEvent && (parsed.data.action === "add" || parsed.data.action === "replace")) {
    const preview = await prepareOrderDesignPreview(
      supabase.storage,
      parsed.data.objectPath!,
      parsed.data.contentType!,
      parsed.data.byteSize!,
    );
    if (!preview.ok) return mutationResult("error", preview.error.message);
  }

  const input: MutateOrderDesignImageRpcArgs = {
    p_action: parsed.data.action,
    p_actor_id: profile!.id,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_order_id: parsed.data.orderId,
    ...(parsed.data.byteSize ? { p_object_path: parsed.data.objectPath! } : {}),
    ...(parsed.data.expectedImageUpdatedAt ? { p_expected_image_updated_at: parsed.data.expectedImageUpdatedAt } : {}),
    ...(parsed.data.imageId ? { p_image_id: parsed.data.imageId } : {}),
  };
  const { data: result, error } = await createAdminClient().rpc("mutate_order_design_image", input);
  if (error) return mutationResult("error", imageErrorMessage(error.message));

  const image = result?.[0];
  if (!image) return mutationResult("error", "La mutación no devolvió un resultado válido.");

  if (parsed.data.action === "replace" || parsed.data.action === "delete") {
    await removeOrderDesignPreview(image.previous_object_path);
  }

  revalidatePath(`/orders/${parsed.data.orderId}`);
  return {
    ...mutationResult("success", "Imagen del pedido actualizada."),
    image: mutateImageResult({ ...image, action: parsed.data.action }),
  };
}

export async function finalizeOrderDesignImageAction(
  _previous: FinalizeOrderDesignImageActionState,
  formData: FormData,
): Promise<FinalizeOrderDesignImageActionState> {
  const parsed = finalizeOrderDesignImageSchema.safeParse(finalizeInput(formData));
  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "Revisá los datos de la imagen.", parsed.error.flatten().fieldErrors);
  }

  const profile = await getCurrentProfile();
  if (!canUseOrderDesignImage(profile)) return mutationResult("error", "No tenés permiso para cargar imágenes del pedido.");

  const supabase = await createClient();
  const { data: existingEvent, error: existingEventError } = await supabase
    .from("order_design_image_events")
    .select("id, order_id, object_path, previous_object_path, image_updated_at")
    .eq("actor_id", profile!.id)
    .eq("idempotency_key", parsed.data.idempotencyKey)
    .maybeSingle();
  if (existingEventError) return mutationResult("error", "No se pudo verificar el reintento de la imagen.");

  if (!existingEvent) {
    const preview = await prepareOrderDesignPreview(
      supabase.storage,
      parsed.data.objectPath,
      parsed.data.contentType,
      parsed.data.byteSize,
    );
    if (!preview.ok) return mutationResult("error", preview.error.message);
  }

  const input: FinalizeOrderDesignImageRpcArgs = {
    p_actor_id: profile!.id,
    p_order_id: parsed.data.orderId,
    p_object_path: parsed.data.objectPath,
    p_idempotency_key: parsed.data.idempotencyKey,
    ...(parsed.data.expectedImageUpdatedAt ? { p_expected_image_updated_at: parsed.data.expectedImageUpdatedAt } : {}),
  };
  const { data: result, error } = await createAdminClient().rpc("finalize_order_design_image", input);
  if (error) return mutationResult("error", imageErrorMessage(error.message));

  const finalizedImage = result?.[0];
  if (!finalizedImage) return mutationResult("error", "La confirmación no devolvió un resultado válido.");

  await removeOrderDesignPreview(finalizedImage.previous_object_path);

  revalidatePath(`/orders/${parsed.data.orderId}`);
  return {
    ...mutationResult("success", existingEvent ? "La carga de imagen ya estaba confirmada." : "Imagen del pedido confirmada."),
    image: finalizeImageResult(finalizedImage),
  };
}

export async function getOrderDesignImageReadUrlAction(
  _previous: GetOrderDesignImageReadUrlActionState,
  formData: FormData,
): Promise<GetOrderDesignImageReadUrlActionState> {
  const parsed = orderDesignImageReadUrlSchema.safeParse({ orderId: value(formData, "orderId") });
  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "El pedido seleccionado no es válido.", parsed.error.flatten().fieldErrors);
  }

  let image: Awaited<ReturnType<typeof getOrderDesignImageReadUrl>>;
  try {
    image = await getOrderDesignImageReadUrl(parsed.data.orderId);
  } catch {
    return mutationResult("error", "No se pudo renovar el acceso temporal a la imagen.");
  }
  if (!image) return mutationResult("error", "El pedido no tiene una imagen vigente o la sesión no está habilitada.");

  return {
    ...mutationResult("success", "Acceso temporal renovado."),
    image,
  };
}

export async function getOrderDesignImagePreviewReadUrlAction(
  _previous: GetOrderDesignImagePreviewReadUrlActionState,
  formData: FormData,
): Promise<GetOrderDesignImagePreviewReadUrlActionState> {
  const parsed = orderDesignImageReadUrlSchema.safeParse({ orderId: value(formData, "orderId") });
  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "El pedido seleccionado no es válido.", parsed.error.flatten().fieldErrors);
  }

  let image: Awaited<ReturnType<typeof getOrderDesignImagePreviewReadUrl>>;
  try {
    image = await getOrderDesignImagePreviewReadUrl(parsed.data.orderId);
  } catch {
    return mutationResult("error", "No se pudo renovar el acceso temporal a la vista previa.");
  }
  if (!image) return mutationResult("error", "El pedido no tiene una imagen vigente o la sesión no está habilitada.");

  return {
    ...mutationResult("success", "Vista previa renovada."),
    image,
  };
}

export async function getOrderDesignImagesReadUrlsAction(
  _previous: GetOrderDesignImagesReadUrlsActionState,
  formData: FormData,
): Promise<GetOrderDesignImagesReadUrlsActionState> {
  const parsed = orderDesignImageReadUrlSchema.safeParse({ orderId: value(formData, "orderId") });
  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "El pedido seleccionado no es válido.", parsed.error.flatten().fieldErrors);
  }

  try {
    const images = await getOrderDesignImagesReadUrls(parsed.data.orderId);
    return {
      ...mutationResult("success", "Acceso temporal renovado."),
      images,
    };
  } catch {
    return mutationResult("error", "No se pudo renovar el acceso temporal a las imágenes.");
  }
}

export async function getOrderDesignImagesPreviewReadUrlsAction(
  _previous: GetOrderDesignImagesPreviewReadUrlsActionState,
  formData: FormData,
): Promise<GetOrderDesignImagesPreviewReadUrlsActionState> {
  const parsed = orderDesignImageReadUrlSchema.safeParse({ orderId: value(formData, "orderId") });
  if (!parsed.success) {
    return mutationResult("error", parsed.error.issues[0]?.message ?? "El pedido seleccionado no es válido.", parsed.error.flatten().fieldErrors);
  }

  try {
    const images = await getOrderDesignImagesPreviewReadUrls(parsed.data.orderId);
    return {
      ...mutationResult("success", "Vistas previas actualizadas."),
      images,
    };
  } catch {
    return mutationResult("error", "No se pudieron renovar las vistas previas de las imágenes.");
  }
}
