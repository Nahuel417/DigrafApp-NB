import { z } from "zod";

export const PRICE_GROUPS = ["adults", "children", "flags", "additions"] as const;
export type PriceGroup = (typeof PRICE_GROUPS)[number];
export type ImportedPrice = { code: string | null; group: PriceGroup; name: string; unit: "unidad" | "metro_lineal"; price: string; active?: boolean };

const codePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
export const optionalCodeSchema = z.preprocess(
  (value) => (value === null || value === undefined ? "" : String(value)),
  z.string().trim().transform((value) => value || null).refine((value) => value === null || codePattern.test(value), "El código estable no es válido."),
);
export const importedPriceSchema = z.object({ code: optionalCodeSchema, group: z.enum(PRICE_GROUPS), name: z.string().trim().min(2).max(120), unit: z.enum(["unidad", "metro_lineal"]), price: z.string().regex(/^\d{1,12}\.\d{2}$/), active: z.boolean().optional() });

const supportedColumns = new Set(["codigo", "grupo", "nombre", "unidad", "precio", "activo"]);
const defaultColumns = ["nombre", "grupo", "unidad", "precio"] as const;
const groupNames: Record<string, PriceGroup> = { adultos: "adults", adults: "adults", niños: "children", ninos: "children", children: "children", banderas: "flags", flags: "flags", adicionales: "additions", additions: "additions" };
const unitNames: Record<string, "unidad" | "metro_lineal"> = { unidad: "unidad", unidades: "unidad", conjunto: "unidad", metro: "metro_lineal", metros: "metro_lineal", metro_lineal: "metro_lineal" };

function key(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function resolveGroup(value: string, name: string, unit: "unidad" | "metro_lineal" | null) {
  const normalized = key(value);
  if (groupNames[normalized]) return groupNames[normalized];
  if (normalized !== "todas_las_edades") return undefined;
  const productName = key(name);
  return unit === "metro_lineal" || productName.includes("bandera") ? "flags" : "additions";
}

function price(value: string) {
  const clean = value.trim().replace(/\s/g, "").replace(/^\$/, "");
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(?:\.\d{3})+$/.test(clean)
      ? clean.replace(/\./g, "")
      : clean;
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) throw new Error("El precio debe ser mayor que cero y tener hasta dos decimales.");
  const [whole, fraction = ""] = normalized.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function parsePriceText(text: string): ImportedPrice[] {
  const rows = text.split(/\r?\n/).filter((row) => row.trim()).map((row) => row.replace(/[ \t]+$/, ""));
  if (!rows.length) throw new Error("El archivo no contiene filas.");
  const delimiter = rows[0].includes("\t") ? "\t" : rows[0].includes("|") ? "|" : null;
  if (!delimiter) throw new Error("Usá una tabla con columnas separadas por tabulaciones o |.");
  const firstCells = rows[0].split(delimiter).map((cell) => cell.trim());
  const firstKeys = firstCells.map(key);
  const hasHeaders = firstKeys.filter((column) => supportedColumns.has(column)).length >= 2;
  const headers: readonly string[] = hasHeaders ? firstKeys : defaultColumns;
  const dataRows = hasHeaders ? rows.slice(1) : rows;
  const index = (name: string) => headers.indexOf(name);
  const codeIndex = index("codigo");
  const result = dataRows.map((row, rowIndex) => {
    const cells = row.split(delimiter).map((cell) => cell.trim());
    const name = cells[index("nombre")] ?? "";
    const rawGroup = cells[index("grupo")] ?? "";
    const rawUnit = cells[index("unidad")] ?? "";
    const unit = unitNames[key(rawUnit)] ?? null;
    const group = resolveGroup(rawGroup, name, unit);
    const code = codeIndex >= 0 ? cells[codeIndex] ?? "" : "";
    const rowNumber = hasHeaders ? rowIndex + 2 : rowIndex + 1;
    if (!name) throw new Error(`Fila ${rowNumber}: falta el nombre del producto.`);
    if (!group) throw new Error(`Fila ${rowNumber}: el grupo "${rawGroup || "vacío"}" no es válido. Usá Adultos, Niños, Banderas o Adicionales.`);
    if (!unit) throw new Error(`Fila ${rowNumber}: la unidad "${rawUnit || "vacía"}" no es válida. Usá Unidad o Metro lineal.`);
    const rawPrice = cells[index("precio")] ?? "";
    if (!rawPrice) throw new Error(`Fila ${rowNumber}: falta el precio.`);
    if (group === "flags" && unit !== "metro_lineal") throw new Error(`Fila ${rowNumber}: Banderas requiere metro lineal.`);
    const parsedCode = optionalCodeSchema.safeParse(code);
    if (!parsedCode.success) throw new Error(`Fila ${rowNumber}: el código estable no es válido.`);
    const activeValue = cells[index("activo")];
    if (activeValue && !["si", "sí", "true", "1", "activo", "no", "false", "0", "inactivo"].includes(key(activeValue))) throw new Error(`Fila ${rowNumber}: activo debe ser sí/no, true/false, 1/0, activo/inactivo.`);
    let normalizedPrice: string;
    try {
      normalizedPrice = price(rawPrice);
    } catch {
      throw new Error(`Fila ${rowNumber}: el precio "${rawPrice}" no es válido. Usá un importe como $14.000 o $14.000,50.`);
    }
    return { code: parsedCode.data, group, name, unit, price: normalizedPrice, ...(activeValue ? { active: ["si", "sí", "true", "1", "activo"].includes(key(activeValue)) } : {}) };
  });
  if (result.length > 1000) throw new Error("El archivo no puede superar 1000 productos.");
  const codes = new Set<string>();
  for (const item of result) {
    if (!item.code) continue;
    if (codes.has(item.code.toLowerCase())) throw new Error(`Código duplicado en el lote: ${item.code}.`);
    codes.add(item.code.toLowerCase());
  }
  return result;
}
