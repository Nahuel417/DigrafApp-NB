import { z } from "zod";

import { compareMoney, normalizeMoney } from "@/lib/money/decimal";

const uuidOrEmpty = z.string().trim().refine((value) => value === "" || z.string().uuid().safeParse(value).success, "La selección no es válida.");
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
    customerName: z.string().trim().min(2, "Ingresá el cliente o equipo.").max(200, "El cliente o equipo no puede superar los 200 caracteres."),
    quantity: z.coerce.number().int("La cantidad debe ser un número entero.").min(1, "La cantidad debe ser mayor que cero."),
    orderType: z.enum(["set", "individual"]),
    orderDate: dateValue,
    promisedDeliveryDate: dateValue,
    description: z.string().trim().max(5000, "La descripción no puede superar los 5000 caracteres."),
    totalAmount: moneyValue,
    depositAmount: moneyValue,
    depositPaid: z.enum(["true", "false"]).transform((value) => value === "true"),
    individualLayer: z.enum(["", "upper", "lower"]),
    garmentUpperId: uuidOrEmpty,
    garmentLowerId: uuidOrEmpty,
    necklineId: uuidOrEmpty,
    upperPatternId: uuidOrEmpty,
    lowerPatternId: uuidOrEmpty,
    fabricId: uuidOrEmpty,
    extraIds: z.array(z.string().uuid("Uno de los extras seleccionados no es válido.")),
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

    if (!value.fabricId) {
      context.addIssue({ code: "custom", path: ["fabricId"], message: "Seleccioná una tela." });
    }

    if (value.orderType === "set") {
      if (!value.garmentUpperId) context.addIssue({ code: "custom", path: ["garmentUpperId"], message: "Seleccioná una prenda superior." });
      if (!value.garmentLowerId) context.addIssue({ code: "custom", path: ["garmentLowerId"], message: "Seleccioná una prenda inferior." });
      if (!value.necklineId) context.addIssue({ code: "custom", path: ["necklineId"], message: "Seleccioná un cuello." });
      if (!value.upperPatternId) context.addIssue({ code: "custom", path: ["upperPatternId"], message: "Seleccioná un molde superior." });
      if (!value.lowerPatternId) context.addIssue({ code: "custom", path: ["lowerPatternId"], message: "Seleccioná un molde inferior." });
      return;
    }

    if (!value.individualLayer) {
      context.addIssue({ code: "custom", path: ["individualLayer"], message: "Indicá si la prenda es superior o inferior." });
    }

    if (value.individualLayer === "upper") {
      if (!value.garmentUpperId) context.addIssue({ code: "custom", path: ["garmentUpperId"], message: "Seleccioná una prenda superior." });
      if (!value.necklineId) context.addIssue({ code: "custom", path: ["necklineId"], message: "Seleccioná un cuello." });
      if (!value.upperPatternId) context.addIssue({ code: "custom", path: ["upperPatternId"], message: "Seleccioná un molde superior." });
      if (value.garmentLowerId) context.addIssue({ code: "custom", path: ["garmentLowerId"], message: "Una prenda superior no lleva prenda inferior." });
      if (value.lowerPatternId) context.addIssue({ code: "custom", path: ["lowerPatternId"], message: "Una prenda superior no lleva molde inferior." });
    }

    if (value.individualLayer === "lower") {
      if (!value.garmentLowerId) context.addIssue({ code: "custom", path: ["garmentLowerId"], message: "Seleccioná una prenda inferior." });
      if (!value.lowerPatternId) context.addIssue({ code: "custom", path: ["lowerPatternId"], message: "Seleccioná un molde inferior." });
      if (value.garmentUpperId) context.addIssue({ code: "custom", path: ["garmentUpperId"], message: "Una prenda inferior no lleva prenda superior." });
      if (value.necklineId) context.addIssue({ code: "custom", path: ["necklineId"], message: "El cuello no aplica a una prenda inferior." });
      if (value.upperPatternId) context.addIssue({ code: "custom", path: ["upperPatternId"], message: "Una prenda inferior no lleva molde superior." });
    }
  });

export type UpdateOrderValues = z.infer<typeof updateOrderSchema>;
