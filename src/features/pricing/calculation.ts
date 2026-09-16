export type QuoteLineInput = { name: string; unit: "unidad" | "metro_lineal"; unitPrice: string | number; quantity: string };
export type QuoteLine = QuoteLineInput & { lineTotalCents: bigint };

const CENTS = BigInt(100);
const PERCENT_SCALE = BigInt(10000);

export function decimalToCents(value: string | number) {
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) throw new Error("El importe debe ser mayor que cero y tener hasta dos decimales.");
  const [whole, fraction = ""] = normalized.split(".");
  const cents = BigInt(whole) * CENTS + BigInt(fraction.padEnd(2, "0") || "0");
  if (cents <= BigInt(0)) throw new Error("El importe debe ser mayor que cero.");
  return cents;
}

function decimalToQuantity(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(normalized)) throw new Error("La cantidad debe tener hasta dos decimales.");
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * CENTS + BigInt(fraction.padEnd(2, "0") || "0");
}

function formatCents(cents: bigint) {
  return `${cents / CENTS}.${(cents % CENTS).toString().padStart(2, "0")}`;
}

export function calculateQuote(inputs: QuoteLineInput[], discount: string) {
  const discountBasis = decimalToQuantity(discount);
  if (discountBasis > PERCENT_SCALE) throw new Error("El descuento debe estar entre 0 y 100%.");
  const lines: QuoteLine[] = inputs.map((input) => {
    const quantity = decimalToQuantity(input.quantity);
    if (quantity <= BigInt(0) || (input.unit === "unidad" && quantity % CENTS !== BigInt(0))) throw new Error("La cantidad no es válida para la unidad seleccionada.");
    const lineTotalCents = (decimalToCents(input.unitPrice) * quantity + BigInt(50)) / CENTS;
    return { ...input, lineTotalCents };
  });
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, BigInt(0));
  const discountCents = (subtotalCents * discountBasis + PERCENT_SCALE / BigInt(2)) / PERCENT_SCALE;
  return { lines, subtotalCents, discountCents, totalCents: subtotalCents - discountCents, formatCents };
}

export function formatQuoteCents(value: bigint) {
  return formatCents(value);
}
