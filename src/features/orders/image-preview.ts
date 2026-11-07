import sharp from "sharp";

import {
  MAX_ORDER_DESIGN_IMAGE_PIXELS,
  ORDER_DESIGN_PREVIEW_MAX_DIMENSION,
  ORDER_DESIGN_PREVIEW_QUALITY,
  type OrderDesignContentType,
} from "./image-contracts";
import { verifyOrderDesignImageBytes } from "./image-validation";

type OrderDesignImageMetadata = {
  format?: string;
  height?: number;
  pageHeight?: number;
  pages?: number;
  width?: number;
};

type PreviewFailure = { ok: false; error: { message: string } };

export function validateOrderDesignImageMetadata(
  metadata: OrderDesignImageMetadata,
  expectedContentType: OrderDesignContentType,
): { ok: true; width: number; height: number } | PreviewFailure {
  const expectedFormat = expectedContentType === "image/jpeg" ? "jpeg" : expectedContentType.slice("image/".length);
  if (metadata.format !== expectedFormat) {
    return { ok: false, error: { message: "El contenido real no coincide con el tipo declarado." } };
  }

  const width = metadata.width;
  const height = metadata.pageHeight ?? metadata.height;
  const pages = metadata.pages ?? 1;
  if (!width || !height || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || !Number.isSafeInteger(pages) || pages < 1) {
    return { ok: false, error: { message: "La imagen no tiene dimensiones válidas." } };
  }
  if (width * height * pages > MAX_ORDER_DESIGN_IMAGE_PIXELS) {
    return { ok: false, error: { message: "La imagen supera el límite de 40 megapíxeles." } };
  }

  return { ok: true, width, height };
}

export async function generateOrderDesignImagePreview(
  bytes: Uint8Array,
  expectedContentType: OrderDesignContentType,
  objectPath: string,
): Promise<{ ok: true; value: { bytes: Buffer; contentType: "image/webp"; byteSize: number; width: number; height: number } } | PreviewFailure> {
  const verifiedBytes = verifyOrderDesignImageBytes(bytes, expectedContentType, bytes.byteLength, objectPath);
  if (!verifiedBytes.ok) return verifiedBytes;
  try {
    const image = sharp(Buffer.from(bytes), {
      pages: 1,
      failOn: "warning",
      limitInputPixels: MAX_ORDER_DESIGN_IMAGE_PIXELS,
      unlimited: false,
    });
    const metadata = validateOrderDesignImageMetadata(await image.metadata(), expectedContentType);
    if (!metadata.ok) return metadata;

    const { data: preview, info } = await image
      .rotate()
      .resize(ORDER_DESIGN_PREVIEW_MAX_DIMENSION, ORDER_DESIGN_PREVIEW_MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: ORDER_DESIGN_PREVIEW_QUALITY })
      .timeout({ seconds: 10 })
      .toBuffer({ resolveWithObject: true });

    return {
      ok: true,
      value: {
        bytes: preview,
        contentType: "image/webp",
        byteSize: preview.byteLength,
        width: info.width,
        height: info.height,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: error instanceof Error && error.message.toLowerCase().includes("timeout")
          ? "El procesamiento de la imagen superó el tiempo permitido."
          : "El archivo de imagen está dañado o no es compatible.",
      },
    };
  }
}
