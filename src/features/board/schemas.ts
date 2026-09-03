import { z } from "zod";

export const moveOrderSchema = z.object({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
  fromStageId: z.string().uuid("La etapa actual no es válida."),
  toStageId: z.string().uuid("La etapa de destino no es válida."),
  expectedUpdatedAt: z.string().datetime({ offset: true, message: "La versión del pedido no es válida." }),
  idempotencyKey: z.string().trim().min(1, "La solicitud de movimiento no es válida.").max(200, "La solicitud de movimiento no es válida."),
}).refine((value) => value.fromStageId !== value.toStageId, {
  message: "El pedido ya está en la etapa seleccionada.",
  path: ["toStageId"],
});

export const reconcileOrderSchema = z.object({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
});

export const confirmOrderPaymentSchema = z.object({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
  expectedUpdatedAt: z.string().datetime({ offset: true, message: "La versión del pedido no es válida." }),
  idempotencyKey: z.string().trim().min(1, "La confirmación de pago no es válida.").max(200, "La confirmación de pago no es válida."),
});

export const reversePaymentSchema = z.object({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
  paymentId: z.string().uuid("El pago seleccionado no es válido."),
  expectedUpdatedAt: z.string().datetime({ offset: true, message: "La versión del pedido no es válida." }),
  idempotencyKey: z.string().trim().min(1, "La reversión de pago no es válida.").max(200, "La reversión de pago no es válida."),
  reason: z.string().trim().max(500, "El motivo de reversión no puede superar los 500 caracteres.").optional(),
});

export const orderLabelSchema = z.enum(["urgent", "returned", "review"]);

export const setOrderLabelSchema = z.object({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
  label: z.union([orderLabelSchema, z.literal("")]).transform((value) => value || null),
  expectedUpdatedAt: z.string().datetime({ offset: true, message: "La versión del pedido no es válida." }),
});

export type MoveOrderValues = z.infer<typeof moveOrderSchema>;
export type ConfirmOrderPaymentValues = z.infer<typeof confirmOrderPaymentSchema>;
export type ReversePaymentValues = z.infer<typeof reversePaymentSchema>;
export type OrderLabel = z.infer<typeof orderLabelSchema>;
export type SetOrderLabelValues = z.infer<typeof setOrderLabelSchema>;
