const MONEY_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

export function normalizeMoney(value: string) {
  const normalized = value.trim().replace(",", ".");

  if (!MONEY_PATTERN.test(normalized)) {
    throw new Error("El importe no es válido.");
  }

  const [integerPart, fractionPart = ""] = normalized.split(".");
  const integer = integerPart.replace(/^0+(?=\d)/, "");

  return `${integer}.${fractionPart.padEnd(2, "0")}`;
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

export function formatArs(value: string) {
  const [integerPart, fractionPart] = normalizeMoney(value).split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$ ${groupedInteger},${fractionPart}`;
}
