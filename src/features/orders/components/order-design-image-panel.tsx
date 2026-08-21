"use client";

import { AlertCircle, CheckCircle2, FileImage, ImagePlus, LoaderCircle, RefreshCw, Star, StarOff, Trash2, Upload } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  getOrderDesignImagesReadUrlsAction,
  mutateOrderDesignImageAction,
  startOrderDesignImageUploadAction,
} from "@/features/orders/image-actions";
import type { OrderDesignImageAction } from "@/features/orders/image-contracts";
import type { OrderDesignImageReadUrl } from "@/features/orders/image-queries";
import { createClient } from "@/lib/supabase/browser";

import { validateOrderDesignFileSelection } from "./order-design-image-selection";

type Preview = Pick<OrderDesignImageReadUrl, "expiresAt" | "id" | "isPrimary" | "signedUrl" | "updatedAt">;
type Feedback = { description: string; kind: "error" | "success"; title: string } | null;
type Operation = "idle" | "mutating" | "renewing" | "uploading";

function makeFormData(values: Record<string, string | null | undefined>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined) formData.set(key, value);
  }
  return formData;
}

function toPreview(image: OrderDesignImageReadUrl): Preview {
  return {
    expiresAt: image.expiresAt,
    id: image.id,
    isPrimary: image.isPrimary,
    signedUrl: image.signedUrl,
    updatedAt: image.updatedAt,
  };
}

export function OrderDesignImagePanel({
  canManage,
  initialError = null,
  initialImages,
  orderId,
}: {
  canManage: boolean;
  initialError?: string | null;
  initialImages: Preview[];
  orderId: string;
}) {
  const [images, setImages] = useState(initialImages);
  const [feedback, setFeedback] = useState<Feedback>(
    initialError ? { description: initialError, kind: "error", title: "Vista no disponible" } : null,
  );
  const [operation, setOperation] = useState<Operation>("idle");
  const [deleteImageId, setDeleteImageId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const busyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const lastAutomaticRenewalRef = useRef<string | null>(null);
  const focusFeedbackAfterCommitRef = useRef(false);
  const primaryImage = images.find((image) => image.isPrimary) ?? null;
  const primaryExpiresAt = primaryImage?.expiresAt;
  const primarySignedUrl = primaryImage?.signedUrl;

  function reportError(title: string, description: string, focusInput = false) {
    if (!focusInput) focusFeedbackAfterCommitRef.current = true;
    setFeedback({ description, kind: "error", title });
    toast.error(description);
    if (focusInput) fileInputRef.current?.focus();
  }

  function reportSuccess(title: string, description: string) {
    focusFeedbackAfterCommitRef.current = true;
    setFeedback({ description, kind: "success", title });
    toast.success(title);
  }

  function runExclusive(nextOperation: Exclude<Operation, "idle">, work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setOperation(nextOperation);
    startTransition(async () => {
      try {
        await work();
      } finally {
        busyRef.current = false;
        setOperation("idle");
      }
    });
  }

  async function refreshImages() {
    const result = await getOrderDesignImagesReadUrlsAction({}, makeFormData({ orderId }));
    if (result.status !== "success") {
      reportError("No se pudo actualizar la galería", result.message ?? "Intentá nuevamente.");
      return false;
    }
    setImages((result.images ?? []).map(toPreview));
    return true;
  }

  function renewPreview(automatic = false) {
    if (automatic && primaryImage && lastAutomaticRenewalRef.current === primaryImage.signedUrl) {
      reportError("Vista no disponible", "No se pudo mostrar el diseño. Usá Renovar vista para intentarlo nuevamente.");
      return;
    }
    if (automatic && primaryImage) lastAutomaticRenewalRef.current = primaryImage.signedUrl;

    runExclusive("renewing", async () => {
      const refreshed = await refreshImages();
      if (!refreshed) return;
      reportSuccess("Vista renovada", "El acceso temporal al diseño se actualizó.");
    });
  }
  const renewPreviewEvent = useEffectEvent(renewPreview);

  useEffect(() => {
    if (!primaryExpiresAt) return;
    const renewBeforeExpiryMs = 5_000;
    const delay = Math.max(0, Date.parse(primaryExpiresAt) - Date.now() - renewBeforeExpiryMs);
    const timeout = window.setTimeout(() => renewPreviewEvent(true), delay);
    return () => window.clearTimeout(timeout);
  }, [primaryExpiresAt, primarySignedUrl]);

  useEffect(() => {
    if (!focusFeedbackAfterCommitRef.current) return;
    focusFeedbackAfterCommitRef.current = false;
    feedbackRef.current?.focus();
  }, [feedback]);

  function submitImage(targetImageId: string | null) {
    const file = fileInputRef.current?.files?.[0] ?? null;
    const validation = validateOrderDesignFileSelection(file);
    if (!validation.ok || !file) {
      reportError("Archivo no válido", validation.ok ? "Seleccioná una imagen para continuar." : validation.message, true);
      return;
    }

    const targetImage = targetImageId ? images.find((image) => image.id === targetImageId) ?? null : null;
    const action = targetImage ? "replace" : "add";
    runExclusive("uploading", async () => {
      const intent = await startOrderDesignImageUploadAction({}, makeFormData({
        action,
        byteSize: String(file.size),
        contentType: validation.contentType,
        expectedImageUpdatedAt: targetImage?.updatedAt ?? primaryImage?.updatedAt ?? null,
        imageId: targetImage?.id,
        orderId,
      }));
      if (intent.status !== "success" || !intent.uploadIntent) {
        reportError("No se pudo iniciar la carga", intent.message ?? "Intentá nuevamente.", true);
        return;
      }

      const upload = await createClient().storage
        .from(intent.uploadIntent.bucketId)
        .upload(intent.uploadIntent.objectPath, file, {
          contentType: intent.uploadIntent.contentType,
          upsert: false,
        });
      if (upload.error) {
        reportError("No se pudo cargar el archivo", "Verificá la conexión e intentá nuevamente.", true);
        return;
      }

      const mutation = await mutateOrderDesignImageAction({}, makeFormData({
        action,
        byteSize: String(intent.uploadIntent.byteSize),
        contentType: intent.uploadIntent.contentType,
        expectedImageUpdatedAt: intent.uploadIntent.expectedImageUpdatedAt,
        idempotencyKey: crypto.randomUUID(),
        imageId: intent.uploadIntent.imageId,
        objectPath: intent.uploadIntent.objectPath,
        orderId,
      }));
      if (mutation.status !== "success") {
        reportError("No se pudo confirmar el diseño", mutation.message ?? "Intentá nuevamente.", true);
        return;
      }

      const refreshed = await refreshImages();
      if (!refreshed) return;
      lastAutomaticRenewalRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
      reportSuccess(targetImage ? "Diseño reemplazado" : images.length ? "Diseño agregado" : "Diseño cargado", "La galería del pedido se actualizó.");
    });
  }

  function mutateImage(action: OrderDesignImageAction, imageId?: string) {
    runExclusive("mutating", async () => {
      const result = await mutateOrderDesignImageAction({}, makeFormData({ action, imageId, orderId, idempotencyKey: crypto.randomUUID() }));
      if (result.status !== "success") {
        reportError("No se pudo actualizar la galería", result.message ?? "Intentá nuevamente.");
        return;
      }
      const refreshed = await refreshImages();
      if (!refreshed) return;
      if (action === "delete") {
        setDeleteImageId(null);
        reportSuccess("Diseño eliminado", "La imagen se quitó de la galería y no se promovió otra.");
      } else {
        reportSuccess("Diseño principal actualizado", action === "clear_primary" ? "El pedido no tiene una imagen principal." : "La imagen seleccionada quedó como principal.");
      }
    });
  }

  const pending = operation !== "idle";
  const fieldError = feedback?.kind === "error" && operation !== "renewing" ? feedback.description : null;
  const imageCountLabel = images.length === 1 ? "1 imagen" : `${images.length} imágenes`;

  return (
    <section aria-busy={pending} aria-labelledby="order-design-heading" className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-label text-muted-foreground">ARCHIVO VISUAL</p>
          <h2 className="mt-1 text-base font-semibold" id="order-design-heading">Diseño vigente</h2>
        </div>
        {images.length ? <span className="rounded-full border border-border bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">{imageCountLabel}</span> : null}
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {images.length ? (
          <div aria-label="Galería de diseños del pedido" className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4" role="list">
            {images.map((image, index) => (
              <figure className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/30" data-design-image="true" key={image.id} role="listitem">
                <div className="relative aspect-[4/3] bg-muted">
                  {/* Signed URLs are short-lived and must bypass image optimization caches. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={image.isPrimary ? "Diseño vigente del pedido" : `Diseño adicional del pedido ${index + 1}`}
                    className="block size-full object-contain"
                    key={image.expiresAt}
                    onError={() => renewPreview(true)}
                    referrerPolicy="no-referrer"
                    src={image.signedUrl}
                  />
                </div>
                <figcaption className="flex min-w-0 flex-col gap-3 border-t border-border px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-muted-foreground">{image.isPrimary ? "Principal" : `Diseño ${index + 1}`}</span>
                    {image.isPrimary ? <Star aria-label="Imagen principal" className="text-primary" /> : null}
                  </div>
                  {canManage ? (
                    <div className="grid min-w-0 gap-2">
                      {image.isPrimary ? (
                        <Button className="w-full whitespace-normal text-center" disabled={pending} onClick={() => mutateImage("clear_primary")} size="sm" type="button" variant="outline">
                          <StarOff data-icon="inline-start" />Quitar como principal
                        </Button>
                      ) : (
                        <Button className="w-full whitespace-normal text-center" disabled={pending} onClick={() => mutateImage("set_primary", image.id)} size="sm" type="button" variant="outline">
                          <Star data-icon="inline-start" />Seleccionar como principal
                        </Button>
                      )}
                      <Button className="w-full whitespace-normal text-center" disabled={pending} onClick={() => submitImage(image.id)} size="sm" type="button" variant="outline">
                        <RefreshCw data-icon="inline-start" />{image.isPrimary ? "Reemplazar diseño" : `Reemplazar diseño ${index + 1}`}
                      </Button>
                      <Button aria-label="Eliminar diseño" className="w-full whitespace-normal text-center" disabled={pending} onClick={() => setDeleteImageId(image.id)} size="sm" type="button" variant="ghost">
                        <Trash2 data-icon="inline-start" />Eliminar diseño
                      </Button>
                    </div>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/25 p-5 text-center">
            <FileImage aria-hidden="true" className="text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Todavía no hay un diseño cargado.</p>
            <p className="mt-1 max-w-xs text-sm leading-5 text-muted-foreground">
              {canManage ? "Cargá una imagen para dejarla disponible al equipo." : "Cuando se cargue una imagen, va a aparecer en este panel."}
            </p>
          </div>
        )}

        {images.length > 0 && !primaryImage ? (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/25 p-5 text-center">
            <FileImage aria-hidden="true" className="text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No hay un diseño principal seleccionado.</p>
            <p className="mt-1 text-sm text-muted-foreground">Elegí una imagen de la galería para mostrarla en el tablero.</p>
          </div>
        ) : null}

        {feedback ? (
          <Alert className="min-w-0 items-start focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" ref={feedbackRef} tabIndex={-1} variant={feedback.kind === "error" ? "destructive" : "success"}>
            {feedback.kind === "error" ? <AlertCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <AlertTitle>{feedback.title}</AlertTitle>
              <AlertDescription className="break-words">{feedback.description}</AlertDescription>
            </div>
          </Alert>
        ) : null}

        {primaryImage ? (
          <Button className="w-full" disabled={pending} onClick={() => renewPreview()} type="button" variant="outline">
            {operation === "renewing" ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" data-icon="inline-start" /> : <RefreshCw aria-hidden="true" data-icon="inline-start" />}
            {operation === "renewing" ? "Renovando vista..." : "Renovar vista"}
          </Button>
        ) : null}

        {canManage ? (
          <div className="border-t border-border pt-4">
            <Field data-invalid={Boolean(fieldError)}>
              <FieldLabel htmlFor={`order-design-file-${orderId}`}>Archivo de diseño</FieldLabel>
              <Input
                accept="image/jpeg,image/png,image/webp"
                aria-describedby={`order-design-help-${orderId}${fieldError ? ` order-design-error-${orderId}` : ""}`}
                aria-invalid={Boolean(fieldError)}
                disabled={pending}
                id={`order-design-file-${orderId}`}
                ref={fileInputRef}
                type="file"
              />
              <FieldDescription id={`order-design-help-${orderId}`}>JPEG, PNG o WebP. Máximo 10 MiB. Podés guardar hasta tres imágenes sin ordenar manualmente.</FieldDescription>
              {fieldError ? <FieldError id={`order-design-error-${orderId}`}>{fieldError}</FieldError> : null}
            </Field>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {images.length < 3 ? (
                <Button disabled={pending} onClick={() => submitImage(null)} type="button">
                  {operation === "uploading" ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" data-icon="inline-start" /> : images.length ? <ImagePlus aria-hidden="true" data-icon="inline-start" /> : <Upload aria-hidden="true" data-icon="inline-start" />}
                  {operation === "uploading" ? "Procesando diseño..." : images.length ? "Agregar diseño" : "Cargar diseño"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <AlertDialog open={Boolean(deleteImageId)} onOpenChange={(open) => { if (!open && !pending) setDeleteImageId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar diseño</AlertDialogTitle>
            <AlertDialogDescription>La imagen se quitará de la galería. Si era principal, el pedido quedará sin imagen principal y no se promocionará otra.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button disabled={pending || !deleteImageId} onClick={() => { if (deleteImageId) mutateImage("delete", deleteImageId); }} type="button" variant="destructive">
                {pending ? "Eliminando..." : "Eliminar diseño"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
