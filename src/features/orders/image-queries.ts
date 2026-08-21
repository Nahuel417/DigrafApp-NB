import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";

import {
  ORDER_DESIGN_BUCKET,
  ORDER_DESIGN_SIGNED_URL_TTL_SECONDS,
  type OrderDesignContentType,
} from "./image-contracts";
import { orderDesignImageReadUrlSchema } from "./image-schemas";

export type OrderDesignImage = {
  id: string;
  orderId: string;
  objectPath: string;
  contentType: OrderDesignContentType;
  byteSize: number;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
  isPrimary: boolean;
};

export type OrderDesignPrimaryImage = Pick<OrderDesignImage, "id" | "updatedAt">;

export type OrderDesignImageReadUrl = OrderDesignImage & {
  signedUrl: string;
  expiresAt: string;
};

function toOrderDesignImage(image: {
  id: string;
  order_id: string;
  object_path: string;
  content_type: string;
  byte_size: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  is_primary: boolean;
}): OrderDesignImage {
  return {
    id: image.id,
    orderId: image.order_id,
    objectPath: image.object_path,
    contentType: image.content_type as OrderDesignContentType,
    byteSize: image.byte_size,
    uploadedBy: image.uploaded_by,
    createdAt: image.created_at,
    updatedAt: image.updated_at,
    isPrimary: image.is_primary,
  };
}

export function toPrimaryDesignImage(image: OrderDesignImage | null): OrderDesignPrimaryImage | null {
  return image?.isPrimary ? { id: image.id, updatedAt: image.updatedAt } : null;
}

async function getReadableImageQuery(orderId: string) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_design_images")
    .select("id, order_id, object_path, content_type, byte_size, uploaded_by, created_at, updated_at, is_primary")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(3);

  if (error) throw new Error("No se pudo cargar la imagen del pedido.");
  const images = (data ?? []).map(toOrderDesignImage);
  return { images, primaryImage: images.find((image) => image.isPrimary) ?? null, supabase };
}

export async function getOrderDesignImage(orderId: string): Promise<OrderDesignImage | null> {
  const parsed = orderDesignImageReadUrlSchema.shape.orderId.safeParse(orderId);
  if (!parsed.success) return null;

  const result = await getReadableImageQuery(parsed.data);
  return result?.primaryImage ?? null;
}

export async function getOrderDesignImages(orderId: string): Promise<OrderDesignImage[]> {
  const parsed = orderDesignImageReadUrlSchema.shape.orderId.safeParse(orderId);
  if (!parsed.success) return [];

  const result = await getReadableImageQuery(parsed.data);
  return result?.images ?? [];
}

export async function getOrderDesignPrimaryImage(orderId: string): Promise<OrderDesignPrimaryImage | null> {
  const image = await getOrderDesignImage(orderId);
  return toPrimaryDesignImage(image);
}

export async function getOrderDesignImageReadUrl(orderId: string): Promise<OrderDesignImageReadUrl | null> {
  const parsed = orderDesignImageReadUrlSchema.shape.orderId.safeParse(orderId);
  if (!parsed.success) return null;

  const result = await getReadableImageQuery(parsed.data);
  if (!result?.primaryImage) return null;

  const { data, error } = await result.supabase.storage
    .from(ORDER_DESIGN_BUCKET)
    .createSignedUrl(result.primaryImage.objectPath, ORDER_DESIGN_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error("No se pudo generar el acceso temporal a la imagen.");

  return {
    ...result.primaryImage,
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + ORDER_DESIGN_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function getOrderDesignImagesReadUrls(orderId: string): Promise<OrderDesignImageReadUrl[]> {
  const parsed = orderDesignImageReadUrlSchema.shape.orderId.safeParse(orderId);
  if (!parsed.success) return [];

  const result = await getReadableImageQuery(parsed.data);
  if (!result?.images.length) return [];

  return Promise.all(result.images.map(async (image) => {
    const { data, error } = await result.supabase.storage
      .from(ORDER_DESIGN_BUCKET)
      .createSignedUrl(image.objectPath, ORDER_DESIGN_SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) throw new Error("No se pudo generar el acceso temporal a la imagen.");

    return {
      ...image,
      signedUrl: data.signedUrl,
      expiresAt: new Date(Date.now() + ORDER_DESIGN_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }));
}
