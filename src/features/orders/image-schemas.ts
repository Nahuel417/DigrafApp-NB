import { z } from "zod";

import { MAX_ORDER_DESIGN_IMAGE_BYTES, ORDER_DESIGN_CONTENT_TYPES, isOrderDesignObjectPath } from "./image-contracts";

const optionalTimestamp = z.preprocess(
  (value) => value === "" || value === undefined || value === null ? null : value,
  z.string().datetime({ offset: true, message: "La versión de la imagen no es válida." }).nullable(),
);

const imageContentType = z.enum(ORDER_DESIGN_CONTENT_TYPES);

export const orderDesignImageUploadIntentSchema = z.object({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
  contentType: imageContentType,
  byteSize: z.coerce.number().int().min(1, "El archivo de imagen está vacío.").max(MAX_ORDER_DESIGN_IMAGE_BYTES, "La imagen no puede superar los 10 MiB."),
  expectedImageUpdatedAt: optionalTimestamp,
});

export type OrderDesignImageUploadIntentValues = z.infer<typeof orderDesignImageUploadIntentSchema>;

export const finalizeOrderDesignImageSchema = z.object({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
  objectPath: z.string().trim().min(1, "La ruta de imagen no es válida."),
  contentType: imageContentType,
  byteSize: z.coerce.number().int().min(1, "El archivo de imagen está vacío.").max(MAX_ORDER_DESIGN_IMAGE_BYTES, "La imagen no puede superar los 10 MiB."),
  expectedImageUpdatedAt: optionalTimestamp,
  idempotencyKey: z.string().trim().min(1, "La solicitud de imagen no es válida.").max(200, "La solicitud de imagen no es válida."),
}).superRefine((value, context) => {
  if (!isOrderDesignObjectPath(value.objectPath, value.orderId)) {
    context.addIssue({ code: "custom", path: ["objectPath"], message: "La ruta de imagen no pertenece al pedido." });
  }
});

export type FinalizeOrderDesignImageValues = z.infer<typeof finalizeOrderDesignImageSchema>;

export const orderDesignImageReadUrlSchema = z.object({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
});

export type OrderDesignImageReadUrlValues = z.infer<typeof orderDesignImageReadUrlSchema>;
