import { z } from "zod";

import { compareMoney, normalizeMoney } from "@/lib/money/decimal";

import { orderLinesValue } from "./schemas";
const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresá una fecha válida.");
const moneyValue = z
  .string()
  .trim()
  .min(1, "Ingresá un importe.")
  .transform((value) => value.replace(",", "."))
  .refine((value) => /^\d{1,12}(?:\.\d{1,2})?$/.test(value), "Usá un importe con hasta dos decimales.")
  .transform((value) => normalizeMoney(value));

export const updateOrderDescriptionSchema = z.object({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
  description: z.string().trim().max(5000, "La descripción no puede superar los 5000 caracteres."),
  changeNote: z.string().trim().max(300, "El comentario del cambio no puede superar los 300 caracteres."),
  expectedUpdatedAt: z.string().datetime({ offset: true, message: "La versión del pedido no es válida." }),
  idempotencyKey: z.string().trim().min(1, "La solicitud de edición no es válida.").max(200, "La solicitud de edición no es válida."),
});

export type UpdateOrderDescriptionValues = z.infer<typeof updateOrderDescriptionSchema>;

export const createOrderCommentSchema = z.object({
  orderId: z.string().uuid("El pedido seleccionado no es válido."),
  body: z.string().trim().min(1, "El comentario debe tener al menos 1 carácter.").max(5000, "El comentario no puede superar los 5000 caracteres."),
  idempotencyKey: z.string().trim().min(1, "La solicitud de comentario no es válida.").max(200, "La solicitud de comentario no es válida."),
});

export type CreateOrderCommentValues = z.infer<typeof createOrderCommentSchema>;

export const updateOrderSchema = z
  .object({
    orderId: z.string().uuid("El pedido seleccionado no es válido."),
    clientName: z.string().trim().min(2, "Ingresá el cliente.").max(200, "El cliente no puede superar los 200 caracteres."),
    teamName: z.string().trim().min(2, "Ingresá el equipo.").max(200, "El equipo no puede superar los 200 caracteres."),
    phone: z.string().trim().min(6, "Ingresá un teléfono válido.").max(40, "El teléfono no puede superar los 40 caracteres."),
    lines: orderLinesValue,
    orderDate: dateValue,
    promisedDeliveryDate: dateValue,
    description: z.string().trim().max(5000, "La descripción no puede superar los 5000 caracteres."),
    changeNote: z.string().trim().max(300, "El comentario del cambio no puede superar los 300 caracteres."),
    totalAmount: moneyValue,
    depositAmount: moneyValue,
    depositPaid: z.enum(["true", "false"]).transform((value) => value === "true"),
    expectedUpdatedAt: z.string().datetime({ offset: true, message: "La versión del pedido no es válida." }),
    idempotencyKey: z.string().trim().min(1, "La solicitud de edición no es válida.").max(200, "La solicitud de edición no es válida."),
  })
  .superRefine((value, context) => {
    try {
      if (compareMoney(value.depositAmount, value.totalAmount) > 0) {
        context.addIssue({ code: "custom", path: ["depositAmount"], message: "La seña no puede superar el total." });
      }
    } catch {
      // Individual amount validators report malformed values without breaking the action.
    }

    if (value.promisedDeliveryDate < value.orderDate) {
      context.addIssue({ code: "custom", path: ["promisedDeliveryDate"], message: "La fecha prometida no puede ser anterior a la fecha del pedido." });
    }

  });

export type UpdateOrderValues = z.infer<typeof updateOrderSchema>;
