import { z } from "zod";

import { MAX_ORDER_DESIGN_IMAGE_BYTES, ORDER_DESIGN_CONTENT_TYPES, ORDER_DESIGN_IMAGE_ACTIONS, isOrderDesignObjectPath } from "./image-contracts";

const optionalTimestamp = z.preprocess(
  (value) => value === "" || value === undefined || value === null ? null : value,
  z.string().datetime({ offset: true, message: "La versión de la imagen no es válida." }).nullable(),
);

const imageContentType = z.enum(ORDER_DESIGN_CONTENT_TYPES);
const imageMutationAction = z.enum(ORDER_DESIGN_IMAGE_ACTIONS);
const optionalUuid = z.preprocess(
  (value) => value === "" || value === undefined || value === null ? null : value,
  z.string().uuid("La imagen seleccionada no es válida.").nullable(),
);
const optionalObjectPath = z.preprocess(
  (value) => value === "" || value === undefined || value === null ? null : value,
  z.string().trim().min(1, "La ruta de imagen no es válida.").nullable(),
);
const optionalContentType = z.preprocess(
  (value) => value === "" || value === undefined || value === null ? null : value,
  imageContentType.nullable(),
);
const optionalByteSize = z.preprocess(
  (value) => value === "" || value === undefined || value === null ? null : value,
  z.coerce.number().int().min(1, "El archivo de imagen está vacío.").max(MAX_ORDER_DESIGN_IMAGE_BYTES, "La imagen no puede superar los 10 MiB.").nullable(),
);

export const orderDesignImageUploadIntentSchema = z.object({
  action: z.enum(["add", "replace"]).default("add"),
  imageId: optionalUuid,
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
  contentType: imageContentType,
  byteSize: z.coerce.number().int().min(1, "El archivo de imagen está vacío.").max(MAX_ORDER_DESIGN_IMAGE_BYTES, "La imagen no puede superar los 10 MiB."),
  expectedImageUpdatedAt: optionalTimestamp,
}).superRefine((value, context) => {
  if (value.action === "add" && value.imageId) {
    context.addIssue({ code: "custom", path: ["imageId"], message: "La solicitud de imagen no es válida." });
  }
  if (value.action === "replace" && !value.imageId) {
    context.addIssue({ code: "custom", path: ["imageId"], message: "La imagen seleccionada no es válida." });
  }
  if (value.action === "replace" && !value.expectedImageUpdatedAt) {
    context.addIssue({ code: "custom", path: ["expectedImageUpdatedAt"], message: "La versión de la imagen no es válida." });
  }
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

export const orderDesignImageMutationSchema = z.object({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
  action: imageMutationAction,
  imageId: optionalUuid,
  objectPath: optionalObjectPath,
  contentType: optionalContentType,
  byteSize: optionalByteSize,
  expectedImageUpdatedAt: optionalTimestamp,
  idempotencyKey: z.string().trim().min(1, "La solicitud de imagen no es válida.").max(200, "La solicitud de imagen no es válida."),
}).superRefine((value, context) => {
  const requiresUpload = value.action === "add" || value.action === "replace";
  if (requiresUpload && !value.objectPath) {
    context.addIssue({ code: "custom", path: ["objectPath"], message: "La ruta de imagen no es válida." });
  }
  if (requiresUpload && !value.contentType) {
    context.addIssue({ code: "custom", path: ["contentType"], message: "El tipo de imagen no es válido." });
  }
  if (requiresUpload && !value.byteSize) {
    context.addIssue({ code: "custom", path: ["byteSize"], message: "El tamaño de imagen no es válido." });
  }
  if (value.action === "add" && value.imageId) {
    context.addIssue({ code: "custom", path: ["imageId"], message: "La solicitud de imagen no es válida." });
  }
  if (value.action === "replace" && !value.imageId) {
    context.addIssue({ code: "custom", path: ["imageId"], message: "La imagen seleccionada no es válida." });
  }
  if (value.action === "replace" && !value.expectedImageUpdatedAt) {
    context.addIssue({ code: "custom", path: ["expectedImageUpdatedAt"], message: "La versión de la imagen no es válida." });
  }
  if (value.action === "delete" || value.action === "set_primary") {
    if (!value.imageId) context.addIssue({ code: "custom", path: ["imageId"], message: "La imagen seleccionada no es válida." });
    if (value.objectPath || value.contentType || value.byteSize || value.expectedImageUpdatedAt) {
      context.addIssue({ code: "custom", path: ["action"], message: "La solicitud de imagen no es válida." });
    }
  }
  if (value.action === "clear_primary" && (value.imageId || value.objectPath || value.contentType || value.byteSize || value.expectedImageUpdatedAt)) {
    context.addIssue({ code: "custom", path: ["action"], message: "La solicitud de imagen no es válida." });
  }
  if (requiresUpload && value.objectPath && !isOrderDesignObjectPath(value.objectPath, value.orderId)) {
    context.addIssue({ code: "custom", path: ["objectPath"], message: "La ruta de imagen no pertenece al pedido." });
  }
});

export type OrderDesignImageMutationValues = z.infer<typeof orderDesignImageMutationSchema>;

export const orderDesignImageReadUrlSchema = z.object({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
});

export type OrderDesignImageReadUrlValues = z.infer<typeof orderDesignImageReadUrlSchema>;
