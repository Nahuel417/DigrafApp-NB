import {
  MAX_ORDER_DESIGN_IMAGE_BYTES,
  ORDER_DESIGN_CONTENT_TYPES,
  type OrderDesignContentType,
} from "../image-contracts";

export type OrderDesignFileSelection = {
  size: number;
  type: string;
};

export function validateOrderDesignFileSelection(file: OrderDesignFileSelection | null):
  | { ok: true; contentType: OrderDesignContentType }
  | { ok: false; message: string } {
  if (!file) return { ok: false, message: "Seleccioná una imagen para continuar." };
  if (!ORDER_DESIGN_CONTENT_TYPES.includes(file.type as OrderDesignContentType)) {
    return { ok: false, message: "Elegí una imagen JPEG, PNG o WebP." };
  }
  if (file.size < 1) return { ok: false, message: "El archivo seleccionado está vacío." };
  if (file.size > MAX_ORDER_DESIGN_IMAGE_BYTES) {
    return { ok: false, message: "La imagen no puede superar los 10 MiB." };
  }
  return { ok: true, contentType: file.type as OrderDesignContentType };
}
