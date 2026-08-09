import { z } from "zod";

import { normalizeMoney } from "@/lib/money/decimal";

const moneyPattern = /^\d{1,12}(?:\.\d{1,2})?$/;

const nonNegativeMoney = z
  .string()
  .trim()
  .min(1, "Ingresá un importe.")
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

export type CashOpeningInput = z.infer<typeof cashOpeningSchema>;
export type CashMovementInput = z.infer<typeof cashMovementSchema>;

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
