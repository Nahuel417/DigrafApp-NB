import { z } from "zod";

import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canOperateCash } from "@/lib/auth/permissions";
import { getOrderDetail } from "@/features/orders/detail-queries";
import { getActiveOrderPayment } from "@/features/orders/payment-receipt";
import { renderPaymentReceiptPdf } from "@/features/orders/payment-receipt-pdf";
import { formatOrderNumber } from "@/features/orders/detail-format";

const orderIdSchema = z.string().uuid();

function errorResponse(status: number, message: string) {
  return new Response(message, { headers: { "Content-Type": "text/plain; charset=utf-8" }, status });
}

export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return errorResponse(401, "No autenticado.");
  if (!canOperateCash(profile)) return errorResponse(403, "No tenés permiso para descargar comprobantes.");

  const { orderId: rawOrderId } = await params;
  const orderId = orderIdSchema.safeParse(rawOrderId);
  if (!orderId.success) return errorResponse(400, "El pedido seleccionado no es válido.");

  try {
    const [detail, payment] = await Promise.all([
      getOrderDetail(orderId.data),
      getActiveOrderPayment(orderId.data),
    ]);
    if (!detail) return errorResponse(404, "El pedido seleccionado no existe.");

    const pdf = await renderPaymentReceiptPdf({ ...detail, payment });
    const publicNumber = formatOrderNumber(detail.order.publicNumber);
    return new Response(new Uint8Array(pdf) as BodyInit, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="comprobante-${publicNumber}.pdf"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch {
    return errorResponse(500, "No se pudo generar el comprobante. Intentá nuevamente.");
  }
}
