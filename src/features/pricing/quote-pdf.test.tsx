import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { QuotePdfInput } from "./quote-pdf";
import { renderQuotePdf } from "./quote-pdf";

const input: QuotePdfInput = {
  client: "Club Atlético Norte",
  team: "Primera división",
  phone: "3515550000",
  dni: "30111222",
  validity: 10,
  discount: "10",
  generatedAt: "12/9/26, 12:00",
  notes: "Incluye diseño personalizado sujeto a aprobación.",
  lines: Array.from({ length: 18 }, (_, index) => ({
    name: `Camiseta titular ${index + 1}`,
    unit: "unidad" as const,
    unitPrice: 25000 + index * 100,
    quantity: "2",
  })),
};

describe("quote PDF", () => {
  it("renders a paginated quote with client details and totals", async () => {
    const pdf = await renderQuotePdf(input);

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(5_000);
  });
});
