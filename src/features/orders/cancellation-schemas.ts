import { z } from "zod";

const orderVersion = z.string().datetime({ offset: true, message: "La versión del pedido no es válida." });
const idempotencyKey = z.string().trim().min(1, "La solicitud de ciclo de vida no es válida.").max(200, "La solicitud de ciclo de vida no es válida.");

export const cancelOrderSchema = z.strictObject({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
  expectedUpdatedAt: orderVersion,
  reason: z.string().trim().min(2, "El motivo de anulación debe tener entre 2 y 500 caracteres.").max(500, "El motivo de anulación debe tener entre 2 y 500 caracteres."),
  idempotencyKey,
});

export const restoreOrderSchema = z.strictObject({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
  expectedUpdatedAt: orderVersion,
  idempotencyKey,
});

export const archiveDeliveredOrderSchema = restoreOrderSchema;

export const purgeCancelledOrderSchema = z.strictObject({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
  idempotencyKey,
});

export type CancelOrderValues = z.infer<typeof cancelOrderSchema>;
export type RestoreOrderValues = z.infer<typeof restoreOrderSchema>;
