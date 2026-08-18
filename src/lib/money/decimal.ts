const MONEY_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;
const AGGREGATE_MONEY_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;
const CASH_AMOUNT_FORMAT_ERROR = "Usá un importe con hasta dos decimales.";
const CASH_AMOUNT_NEGATIVE_ERROR = "El importe debe ser mayor o igual a cero.";
const CASH_AMOUNT_ZERO_ERROR = "El importe debe ser mayor que cero.";
const CASH_AMOUNT_MAX_INTEGER_ERROR = "El importe no puede superar 12 dígitos enteros.";
export const CASH_AMOUNT_PATTERN = "[0-9]{1,12}([.,][0-9]{1,2})?";

export function canInsertCashAmount(value: string, inserted: string, selectionStart: number | null, selectionEnd: number | null) {
  const start = selectionStart ?? value.length;
  const end = selectionEnd ?? start;
  const nextValue = `${value.slice(0, start)}${inserted}${value.slice(end)}`;
  if (!/^[0-9.,]*$/.test(nextValue)) return false;

  const separators = nextValue.match(/[.,]/g) ?? [];
  if (separators.length > 1) return false;

  const [integerPart = "", fractionPart] = nextValue.split(/[.,]/);
  if (integerPart.length > 12 || (fractionPart?.length ?? 0) > 2) return false;
  return !separators.length || integerPart.length > 0;
}

export function cashAmountError(value: string, options: { allowZero?: boolean } = {}) {
  const trimmed = value.trim();
  if (!trimmed) return "Ingresá un importe.";
  if (trimmed !== value) return CASH_AMOUNT_FORMAT_ERROR;
  if (trimmed === "-" || trimmed === "." || trimmed === "," || trimmed.endsWith(".") || trimmed.endsWith(",")) return CASH_AMOUNT_FORMAT_ERROR;
  if (trimmed.startsWith("-")) return CASH_AMOUNT_NEGATIVE_ERROR;
  if ((trimmed.match(/[.,]/g) ?? []).length > 1) return CASH_AMOUNT_FORMAT_ERROR;

  const [integerPart, fractionPart] = trimmed.replace(",", ".").split(".");
  if (!/^\d+$/.test(integerPart)) return CASH_AMOUNT_FORMAT_ERROR;
  if (integerPart.length > 12) return CASH_AMOUNT_MAX_INTEGER_ERROR;
  if (fractionPart !== undefined && !/^\d{1,2}$/.test(fractionPart)) return CASH_AMOUNT_FORMAT_ERROR;
  if (options.allowZero === false && BigInt(integerPart) === BigInt(0) && (!fractionPart || BigInt(fractionPart) === BigInt(0))) return CASH_AMOUNT_ZERO_ERROR;
  return null;
}

export function normalizeMoney(value: string) {
  const normalized = value.trim().replace(",", ".");

  if (!MONEY_PATTERN.test(normalized)) {
    throw new Error("El importe no es válido.");
  }

  const [integerPart, fractionPart = ""] = normalized.split(".");
  const integer = integerPart.replace(/^0+(?=\d)/, "");

  return `${integer}.${fractionPart.padEnd(2, "0")}`;
}

export function normalizeAggregateMoney(value: string | number) {
  const normalized = String(value).trim().replace(",", ".");

  if (!AGGREGATE_MONEY_PATTERN.test(normalized)) {
    throw new Error("El importe agregado no es válido.");
  }

  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [integerPart, fractionPart = ""] = unsigned.split(".");
  const integer = integerPart.replace(/^0+(?=\d)/, "");
  const result = `${integer}.${fractionPart.padEnd(2, "0")}`;

  return result === "0.00" ? result : negative ? `-${result}` : result;
}

export function moneyToCents(value: string) {
  const normalized = normalizeMoney(value);
  const [integerPart, fractionPart] = normalized.split(".");
  return BigInt(integerPart) * BigInt(100) + BigInt(fractionPart);
}

export function compareMoney(left: string, right: string) {
  const leftCents = moneyToCents(left);
  const rightCents = moneyToCents(right);

  if (leftCents === rightCents) return 0;
  return leftCents > rightCents ? 1 : -1;
}

export function visibleBalance(total: string, deposit: string, depositPaid: boolean) {
  if (!depositPaid) return normalizeMoney(total);

  const balanceCents = moneyToCents(total) - moneyToCents(deposit);
  if (balanceCents < BigInt(0)) throw new Error("La seña no puede superar el total.");
  return `${balanceCents / BigInt(100)}.${(balanceCents % BigInt(100)).toString().padStart(2, "0")}`;
}

export function orderBalance(total: string, deposit: string) {
  const balanceCents = moneyToCents(total) - moneyToCents(deposit);
  if (balanceCents < BigInt(0)) throw new Error("La seña no puede superar el total.");
  return `${balanceCents / BigInt(100)}.${(balanceCents % BigInt(100)).toString().padStart(2, "0")}`;
}

export function safeOrderBalance(total: string, deposit: string) {
  try {
    return orderBalance(total, deposit);
  } catch {
    return null;
  }
}

export function formatArs(value: string) {
  const [integerPart, fractionPart] = normalizeAggregateMoney(value).split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$ ${groupedInteger},${fractionPart}`;
}
