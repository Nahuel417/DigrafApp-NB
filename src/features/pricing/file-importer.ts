import "server-only";

import mammoth from "mammoth";
import readXlsxFile from "read-excel-file/node";
import { PDFParse } from "pdf-parse";

import { parsePriceText, type ImportedPrice } from "./importer";

export const MAX_PRICE_IMPORT_BYTES = 5 * 1024 * 1024;

export async function parsePriceFile(file: File): Promise<ImportedPrice[]> {
  if (!file.name || file.size === 0) throw new Error("El archivo está vacío.");
  if (file.size > MAX_PRICE_IMPORT_BYTES) throw new Error("El archivo no puede superar 5 MB.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const allowedTypes: Record<string, string[]> = { ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ".pdf": ["application/pdf"] };
  const extension = Object.keys(allowedTypes).find((item) => name.endsWith(item));
  if (!extension || (file.type && !allowedTypes[extension].includes(file.type))) throw new Error("Formato no permitido. Usá XLSX, DOCX o PDF de texto.");
  let text = "";
  if (extension === ".xlsx") {
    const rows = (await readXlsxFile(buffer))[0]?.data ?? [];
    text = rows.map((row) => row.map((cell) => String(cell ?? "")).join("\t")).join("\n");
  } else if (extension === ".docx") {
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (extension === ".pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  return parsePriceText(text);
}
