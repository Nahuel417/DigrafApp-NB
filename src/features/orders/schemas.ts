import { z } from "zod";

import { compareMoney, normalizeMoney } from "@/lib/money/decimal";

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresá una fecha válida.");

const moneyValue = z
  .string()
  .trim()
  .min(1, "Ingresá un importe.")
  .transform((value) => value.replace(",", "."))
  .refine((value) => /^\d{1,12}(?:\.\d{1,2})?$/.test(value), "Usá un importe con hasta dos decimales.")
  .transform((value) => normalizeMoney(value));

const optionSelectionSchema = z.object({ option_id: z.string().uuid(), value_ids: z.array(z.string().uuid()) });
const legacyOptionsSchema = z.object({
  neckline_id: z.string().uuid().optional(),
  upper_pattern_id: z.string().uuid().optional(),
  lower_pattern_id: z.string().uuid().optional(),
  fabric_id: z.string().uuid().optional(),
  extra_ids: z.array(z.string().uuid()).optional(),
});

const orderLineSchema = z.object({
  position: z.number().int().nonnegative(),
  line_type: z.enum(["individual", "set", "flag", "bag", "shield"]),
  product_id: z.string().uuid().optional(),
  quantity: z.number().int().positive(),
  color: z.string().max(100).nullable().optional(),
  options: z.array(optionSelectionSchema).optional(),
  configuration: z.object({
    upper: z.object({ product_id: z.string().uuid(), options: z.array(optionSelectionSchema).optional() }).optional(),
    lower: z.object({ product_id: z.string().uuid(), options: z.array(optionSelectionSchema).optional() }).optional(),
    legacy_options: legacyOptionsSchema.optional(),
  }).optional(),
  shield_product_ids: z.array(z.string().uuid()).optional(),
}).superRefine((line, context) => {
  if (line.line_type === "set") {
    if (!line.configuration?.upper) context.addIssue({ code: "custom", path: ["configuration", "upper"], message: "Seleccioná la parte superior." });
    if (!line.configuration?.lower) context.addIssue({ code: "custom", path: ["configuration", "lower"], message: "Seleccioná la parte inferior." });
  } else if (!line.product_id) {
    context.addIssue({ code: "custom", path: ["product_id"], message: "Seleccioná un producto." });
  }
});

export const orderLinesValue = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  },
  z.array(orderLineSchema).min(1, "El pedido requiere al menos un renglón."),
);

export const orderFormSchema = z
  .object({
    clientName: z.string().trim().min(2, "Ingresá el cliente.").max(200, "El cliente no puede superar los 200 caracteres."),
    teamName: z.string().trim().min(2, "Ingresá el equipo.").max(200, "El equipo no puede superar los 200 caracteres."),
    phone: z.string().trim().min(6, "Ingresá un teléfono válido.").max(40, "El teléfono no puede superar los 40 caracteres."),
    lines: orderLinesValue,
    orderDate: dateValue,
    promisedDeliveryDate: dateValue,
    description: z.string().trim().max(5000, "La descripción no puede superar los 5000 caracteres."),
    totalAmount: moneyValue,
    depositAmount: moneyValue,
    depositPaid: z.boolean(),
    idempotencyKey: z.string().trim().min(1, "La solicitud de creación no es válida.").max(200, "La solicitud de creación no es válida."),
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

export type OrderFormValues = z.infer<typeof orderFormSchema>;
