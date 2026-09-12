import { z } from "zod";

import { calculateQuote } from "@/features/pricing/calculation";
import { getPriceList } from "@/features/pricing/queries";
import { renderQuotePdf } from "@/features/pricing/quote-pdf";

const payloadSchema = z.object({
  lines: z.array(z.object({ id: z.string().uuid(), quantity: z.string().min(1).max(20) })).min(1).max(100),
  discount: z.string().regex(/^\d{1,3}(?:[.,]\d{1,2})?$/),
  client: z.string().max(200).default(""), team: z.string().max(200).default(""), phone: z.string().max(40).default(""), dni: z.string().max(20).default(""), notes: z.string().max(2000).default(""), validity: z.coerce.number().int().min(1).max(365),
});

export async function POST(request: Request) {
  try {
    const parsed = payloadSchema.safeParse(await request.json());
    if (!parsed.success) return new Response("La cotización no es válida.", { status: 400 });
    const data = await getPriceList();
    if (!data) return new Response("No autorizado.", { status: 403 });
    const products = parsed.data.lines.map((line) => {
      const product = data.products.find((item) => item.id === line.id && item.active);
      if (!product) throw new Error("Producto no disponible.");
      return { name: product.name, unit: product.unit, unitPrice: product.price, quantity: line.quantity };
    });
    calculateQuote(products, parsed.data.discount);
    const generatedAt = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Cordoba" }).format(new Date());
    const pdf = await renderQuotePdf({ ...parsed.data, lines: products, generatedAt });
    return new Response(new Uint8Array(pdf) as BodyInit, { headers: { "Cache-Control": "private, no-store", "Content-Disposition": "inline; filename=\"cotizacion.pdf\"", "Content-Type": "application/pdf" } });
  } catch { return new Response("No se pudo generar la cotización.", { status: 400 }); }
}
