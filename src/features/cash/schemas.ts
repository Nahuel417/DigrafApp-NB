import { z } from "zod";

import { normalizeMoney } from "@/lib/money/decimal";

const moneyPattern = /^\d{1,12}(?:[.,]\d{1,2})?$/;

const nonNegativeMoney = z
  .string()
  .trim()
  .min(1, "Ingresá un importe.")
  .max(15, "El importe no puede superar 15 caracteres.")
  .transform((value) => value.replace(",", "."))
  .refine((value) => !value.startsWith("-"), "El importe debe ser mayor o igual a cero.")
  .refine((value) => value.startsWith("-") || moneyPattern.test(value), "Usá un importe con hasta dos decimales.")
  .transform((value) => normalizeMoney(value));

const positiveMoney = nonNegativeMoney.refine((value) => value !== "0.00", "El importe debe ser mayor que cero.");
const idempotencyKey = z.string().trim().min(1, "La solicitud no es válida.").max(200, "La solicitud no es válida.");
const uuidOrEmpty = z
  .string()
  .trim()
  .refine((value) => value === "" || z.string().uuid().safeParse(value).success, "El identificador seleccionado no es válido.")
  .transform((value) => value || null);

export const cashOpeningSchema = z.object({
  amount: nonNegativeMoney,
  expectedOpeningUpdatedAt: z.string().datetime({ offset: true, message: "La versión de apertura no es válida." }),
  idempotencyKey,
}).strict();

export const cashMovementSchema = z.object({
  amount: positiveMoney,
  description: z.string().trim().max(500, "La descripción no puede superar los 500 caracteres.").transform((value) => value || null),
  direction: z.enum(["income", "expense"], { message: "El tipo de movimiento no es válido." }),
  expenseCategoryId: uuidOrEmpty,
  idempotencyKey,
}).strict().superRefine((value, context) => {
  if (value.direction === "income") {
    if (!value.description || value.description.length < 2) {
      context.addIssue({ code: "custom", path: ["description"], message: "Ingresá un concepto válido para el ingreso." });
    }
    if (value.expenseCategoryId) {
      context.addIssue({ code: "custom", path: ["expenseCategoryId"], message: "Un ingreso no puede tener categoría de egreso." });
    }
    return;
  }

  if (!value.expenseCategoryId) {
    context.addIssue({ code: "custom", path: ["expenseCategoryId"], message: "Seleccioná una categoría de egreso." });
  }
});

const cashMovementCorrectionFields = {
  amount: positiveMoney,
  description: z.string().trim().max(500, "La descripción no puede superar los 500 caracteres.").transform((value) => value || null),
  direction: z.enum(["income", "expense"], { message: "El tipo de movimiento no es válido." }),
  expenseCategoryId: uuidOrEmpty,
  idempotencyKey,
};

function validateCashMovementFields(value: z.infer<z.ZodObject<typeof cashMovementCorrectionFields>>, context: z.RefinementCtx) {
  if (value.direction === "income") {
    if (!value.description || value.description.length < 2) context.addIssue({ code: "custom", path: ["description"], message: "Ingresá un concepto válido para el ingreso." });
    if (value.expenseCategoryId) context.addIssue({ code: "custom", path: ["expenseCategoryId"], message: "Un ingreso no puede tener categoría de egreso." });
  } else if (!value.expenseCategoryId) {
    context.addIssue({ code: "custom", path: ["expenseCategoryId"], message: "Seleccioná una categoría de egreso." });
  }
}

export const cashMovementCorrectionSchema = z.object({
  movementId: z.string().uuid("El identificador del movimiento no es válido."),
  ...cashMovementCorrectionFields,
}).strict().superRefine(validateCashMovementFields);

export const cashAttentionVoidReasonSchema = z.string()
  .trim()
  .min(2, "Atención debe indicar un motivo de anulación de 2 a 500 caracteres.")
  .max(500, "Atención debe indicar un motivo de anulación de 2 a 500 caracteres.");

export const cashVoidSchema = z.object({
  movementId: z.string().uuid("El identificador del movimiento no es válido."),
  reason: z.string().trim().max(500, "El motivo de anulación no puede superar los 500 caracteres.").transform((value) => value || null),
  idempotencyKey,
}).strict();

export const cashDayCloseSchema = z.object({
  cashDayId: z.string().uuid("El identificador de la caja no es válido."),
  idempotencyKey,
}).strict();

export const cashDayReopenSchema = z.object({
  cashDayId: z.string().uuid("El identificador de la caja no es válido."),
  reason: z.string().trim().min(2, "Indicá un motivo de reapertura de 2 a 500 caracteres.").max(500, "El motivo de reapertura no puede superar los 500 caracteres."),
  idempotencyKey,
}).strict();

export type CashOpeningInput = z.infer<typeof cashOpeningSchema>;
export type CashMovementInput = z.infer<typeof cashMovementSchema>;
export type CashMovementCorrectionInput = z.infer<typeof cashMovementCorrectionSchema>;
export type CashVoidInput = z.infer<typeof cashVoidSchema>;
export type CashDayCloseInput = z.infer<typeof cashDayCloseSchema>;
export type CashDayReopenInput = z.infer<typeof cashDayReopenSchema>;

export type CashMovementFingerprintInput = Pick<CashMovementInput, "amount" | "description" | "direction" | "expenseCategoryId">;

export function cashMovementFingerprint(input: CashMovementFingerprintInput) {
  return JSON.stringify([
    "create_cash_movement",
    input.direction,
    normalizeMoney(input.amount),
    input.description?.trim() || "",
    input.expenseCategoryId ?? "",
  ]);
}
