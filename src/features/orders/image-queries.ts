import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";

import {
  ORDER_DESIGN_BUCKET,
  ORDER_DESIGN_SIGNED_URL_TTL_SECONDS,
  type OrderDesignContentType,
} from "./image-contracts";
import { orderDesignImageReadUrlSchema } from "./image-schemas";

export type OrderDesignImage = {
  orderId: string;
  objectPath: string;
  contentType: OrderDesignContentType;
  byteSize: number;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderDesignImageReadUrl = OrderDesignImage & {
  signedUrl: string;
  expiresAt: string;
};

function toOrderDesignImage(image: {
  order_id: string;
  object_path: string;
  content_type: string;
  byte_size: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}): OrderDesignImage {
  return {
    orderId: image.order_id,
    objectPath: image.object_path,
    contentType: image.content_type as OrderDesignContentType,
    byteSize: image.byte_size,
    uploadedBy: image.uploaded_by,
    createdAt: image.created_at,
    updatedAt: image.updated_at,
  };
}

async function getReadableImageQuery(orderId: string) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_design_images")
    .select("order_id, object_path, content_type, byte_size, uploaded_by, created_at, updated_at")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) throw new Error("No se pudo cargar la imagen del pedido.");
  return { image: data ? toOrderDesignImage(data) : null, supabase };
}

export async function getOrderDesignImage(orderId: string): Promise<OrderDesignImage | null> {
  const parsed = orderDesignImageReadUrlSchema.shape.orderId.safeParse(orderId);
  if (!parsed.success) return null;

  const result = await getReadableImageQuery(parsed.data);
  return result?.image ?? null;
}

export async function getOrderDesignImageReadUrl(orderId: string): Promise<OrderDesignImageReadUrl | null> {
  const parsed = orderDesignImageReadUrlSchema.shape.orderId.safeParse(orderId);
  if (!parsed.success) return null;

  const result = await getReadableImageQuery(parsed.data);
  if (!result?.image) return null;

  const { data, error } = await result.supabase.storage
    .from(ORDER_DESIGN_BUCKET)
    .createSignedUrl(result.image.objectPath, ORDER_DESIGN_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error("No se pudo generar el acceso temporal a la imagen.");

  return {
    ...result.image,
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + ORDER_DESIGN_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}
