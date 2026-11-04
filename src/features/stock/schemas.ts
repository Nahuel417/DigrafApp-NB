import { z } from "zod";

import { cashAmountError, normalizeMoney } from "@/lib/money/decimal";

const nameSchema = z.string().trim().min(2, "El nombre de la tela debe tener entre 2 y 100 caracteres.").max(100, "El nombre de la tela debe tener entre 2 y 100 caracteres.");
const itemIdSchema = z.string().uuid("La tela seleccionada no es válida.");
const idempotencyKeySchema = z.string().uuid("La solicitud de stock no es válida.");
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const quantityPattern = /^\d{1,12}(?:[.,](?:0|5))?$/;

export const stockQuantityInputPattern = "[0-9]{1,12}([.,](0|5))?";

export function canInsertStockQuantity(
  value: string,
  inserted: string,
  selectionStart: number | null,
  selectionEnd: number | null,
) {
  const start = selectionStart ?? value.length;
  const end = selectionEnd ?? start;
  const nextValue = `${value.slice(0, start)}${inserted}${value.slice(end)}`;
  if (!/^[0-9.,]*$/.test(nextValue)) return false;

  const separators = nextValue.match(/[.,]/g) ?? [];
  if (separators.length > 1) return false;

  const [integerPart = "", fractionPart] = nextValue.split(/[.,]/);
  if (integerPart.length > 12) return false;
  if (fractionPart !== undefined && fractionPart !== "" && !/^[05]$/.test(fractionPart)) return false;
  return !separators.length || integerPart.length > 0;
}

export function currentStockDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isValidStockDate(value: string) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && value <= currentStockDate();
}

const stockDateSchema = z.string().refine(
  isValidStockDate,
  "La fecha debe ser válida y no puede ser futura.",
);

const quantitySchema = z.string().trim().regex(
  quantityPattern,
  "La cantidad debe ser un número de rollos enteros o medios.",
).transform((value) => value.replace(",", "."));

const positiveQuantitySchema = quantitySchema.refine(
  (value) => /[1-9]/.test(value),
  "La cantidad debe ser mayor que cero.",
);

const priceSchema = z.string().superRefine((value, context) => {
  const error = cashAmountError(value, { allowZero: false });
  if (error) context.addIssue({ code: "custom", message: error });
}).transform(normalizeMoney);

const createSchema = z.object({
  action: z.literal("create"),
  idempotencyKey: idempotencyKeySchema,
  name: nameSchema,
  quantity: quantitySchema,
  date: stockDateSchema,
  price: priceSchema,
});

const purchaseSchema = z.object({
  action: z.literal("purchase"),
  idempotencyKey: idempotencyKeySchema,
  itemId: itemIdSchema,
  quantity: positiveQuantitySchema,
  date: stockDateSchema,
  price: priceSchema,
});

const consumptionSchema = z.object({
  action: z.literal("consumption"),
  idempotencyKey: idempotencyKeySchema,
  itemId: itemIdSchema,
  quantity: positiveQuantitySchema,
  date: stockDateSchema,
});

const cancellationSchema = z.object({
  action: z.literal("cancel"),
  idempotencyKey: idempotencyKeySchema,
  itemId: itemIdSchema,
  movementId: z.string().uuid("El movimiento seleccionado no es válido."),
  reason: z.string().trim().min(2, "El motivo de anulación debe tener entre 2 y 500 caracteres.").max(500, "El motivo de anulación debe tener entre 2 y 500 caracteres."),
});

const renameSchema = z.object({
  action: z.literal("rename"),
  idempotencyKey: idempotencyKeySchema,
  itemId: itemIdSchema,
  name: nameSchema,
});

const activationSchema = z.object({
  action: z.literal("activate"),
  idempotencyKey: idempotencyKeySchema,
  itemId: itemIdSchema,
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const stockOperationSchema = z.discriminatedUnion("action", [
  createSchema,
  purchaseSchema,
  consumptionSchema,
  cancellationSchema,
  renameSchema,
  activationSchema,
]);

export type StockOperation = z.infer<typeof stockOperationSchema>;
