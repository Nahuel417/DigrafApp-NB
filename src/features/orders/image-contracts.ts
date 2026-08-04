export const ORDER_DESIGN_BUCKET = "order-designs" as const;
export const MAX_ORDER_DESIGN_IMAGE_BYTES = 10 * 1024 * 1024;
export const ORDER_DESIGN_SIGNED_URL_TTL_SECONDS = 5 * 60;

export const ORDER_DESIGN_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type OrderDesignContentType = (typeof ORDER_DESIGN_CONTENT_TYPES)[number];

export const ORDER_DESIGN_EXTENSIONS: Record<OrderDesignContentType, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const ORDER_DESIGN_OBJECT_PATH_PATTERN = new RegExp(`^orders/(${UUID_PATTERN})/(${UUID_PATTERN})\\.(jpg|jpeg|png|webp)$`);

export function buildOrderDesignObjectPath(orderId: string, contentType: OrderDesignContentType, objectId = crypto.randomUUID()) {
  return `orders/${orderId}/${objectId}.${ORDER_DESIGN_EXTENSIONS[contentType]}`;
}

export function isOrderDesignObjectPath(objectPath: string, orderId?: string) {
  const match = ORDER_DESIGN_OBJECT_PATH_PATTERN.exec(objectPath);
  return Boolean(match && (!orderId || match[1] === orderId));
}

export function objectPathExtensionMatchesContentType(objectPath: string, contentType: OrderDesignContentType) {
  return objectPath.endsWith(`.${ORDER_DESIGN_EXTENSIONS[contentType]}`)
    || (contentType === "image/jpeg" && objectPath.endsWith(".jpeg"));
}
