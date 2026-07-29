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

export type MoveOrderValues = z.infer<typeof moveOrderSchema>;
