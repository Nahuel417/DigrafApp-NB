import {
  MAX_ORDER_DESIGN_IMAGE_BYTES,
  type OrderDesignContentType,
  objectPathExtensionMatchesContentType,
} from "./image-contracts";

export type VerifiedOrderDesignImage = {
  byteSize: number;
  contentType: OrderDesignContentType;
};

export type ImageVerificationFailure = {
  message: string;
};

export type ImageVerificationResult =
  | { ok: true; value: VerifiedOrderDesignImage }
  | { ok: false; error: ImageVerificationFailure };

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, value: string) {
  return [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

export function detectOrderDesignContentType(bytes: Uint8Array): OrderDesignContentType | null {
  if (bytes.length >= 4 && startsWith(bytes, [0xff, 0xd8, 0xff]) && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) {
    return "image/jpeg";
  }

  if (bytes.length >= 24 && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && asciiAt(bytes, 12, "IHDR")) {
    return "image/png";
  }

  if (bytes.length >= 12 && asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) {
    return "image/webp";
  }

  return null;
}

export function verifyOrderDesignImageBytes(
  bytes: Uint8Array,
  expectedContentType: OrderDesignContentType,
  expectedByteSize: number,
  objectPath: string,
): ImageVerificationResult {
  if (bytes.length < 1 || bytes.length > MAX_ORDER_DESIGN_IMAGE_BYTES) {
    return { ok: false, error: { message: "El archivo de imagen no cumple el límite de tamaño." } };
  }

  if (bytes.length !== expectedByteSize) {
    return { ok: false, error: { message: "El tamaño real del archivo no coincide con la intención de carga." } };
  }

  const detectedContentType = detectOrderDesignContentType(bytes);
  if (!detectedContentType) {
    return { ok: false, error: { message: "El contenido no es una imagen JPEG, PNG o WebP válida." } };
  }

  if (detectedContentType !== expectedContentType) {
    return { ok: false, error: { message: "El contenido real no coincide con el tipo declarado." } };
  }

  if (!objectPathExtensionMatchesContentType(objectPath, detectedContentType)) {
    return { ok: false, error: { message: "La extensión de la imagen no coincide con su contenido." } };
  }

  return { ok: true, value: { byteSize: bytes.length, contentType: detectedContentType } };
}

export async function verifyUploadedOrderDesignImage(
  storage: { download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }> },
  objectPath: string,
  expectedContentType: OrderDesignContentType,
  expectedByteSize: number,
): Promise<ImageVerificationResult> {
  try {
    const { data, error } = await storage.download(objectPath);
    if (error || !data) {
      return { ok: false, error: { message: "No se pudo leer el objeto de imagen cargado." } };
    }

    return verifyOrderDesignImageBytes(new Uint8Array(await data.arrayBuffer()), expectedContentType, expectedByteSize, objectPath);
  } catch {
    return { ok: false, error: { message: "No se pudo verificar el contenido de la imagen cargada." } };
  }
}
