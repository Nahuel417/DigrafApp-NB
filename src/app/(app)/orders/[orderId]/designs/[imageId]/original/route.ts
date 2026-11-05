import { getOrderDesignImageOriginalReadUrl } from "@/features/orders/image-queries";

export const dynamic = "force-dynamic";

function unavailable() {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string; imageId: string }> },
) {
  const { orderId, imageId } = await params;

  try {
    const image = await getOrderDesignImageOriginalReadUrl(orderId, imageId);
    if (!image) return unavailable();

    return new Response(null, {
      status: 307,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Location": image.signedUrl,
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return unavailable();
  }
}
