"use client";

import { AlertCircle, CheckCircle2, FileImage, LoaderCircle, RefreshCw, Upload } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  finalizeOrderDesignImageAction,
  getOrderDesignImageReadUrlAction,
  startOrderDesignImageUploadAction,
} from "@/features/orders/image-actions";
import type { OrderDesignImageReadUrl } from "@/features/orders/image-queries";
import { createClient } from "@/lib/supabase/browser";

import { validateOrderDesignFileSelection } from "./order-design-image-selection";

type Preview = Pick<OrderDesignImageReadUrl, "expiresAt" | "signedUrl" | "updatedAt">;
type Feedback = { description: string; kind: "error" | "success"; title: string } | null;
type Operation = "idle" | "renewing" | "uploading";

function makeFormData(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

function toPreview(image: OrderDesignImageReadUrl): Preview {
  return { expiresAt: image.expiresAt, signedUrl: image.signedUrl, updatedAt: image.updatedAt };
}

export function OrderDesignImagePanel({
  canManage,
  initialError = null,
  initialImage,
  orderId,
}: {
  canManage: boolean;
  initialError?: string | null;
  initialImage: Preview | null;
  orderId: string;
}) {
  const [preview, setPreview] = useState(initialImage);
  const [feedback, setFeedback] = useState<Feedback>(
    initialError ? { description: initialError, kind: "error", title: "Vista no disponible" } : null,
  );
  const [operation, setOperation] = useState<Operation>("idle");
  const [, startTransition] = useTransition();
  const busyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const lastAutomaticRenewalRef = useRef<string | null>(null);

  function focusFeedback() {
    window.requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  function reportError(title: string, description: string, focusInput = false) {
    setFeedback({ description, kind: "error", title });
    toast.error(description);
    window.requestAnimationFrame(() => {
      if (focusInput) fileInputRef.current?.focus();
      else feedbackRef.current?.focus();
    });
  }

  function reportSuccess(title: string, description: string) {
    setFeedback({ description, kind: "success", title });
    toast.success(title);
    focusFeedback();
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

  function renewPreview(automatic = false) {
    if (automatic && preview && lastAutomaticRenewalRef.current === preview.signedUrl) {
      reportError("Vista no disponible", "No se pudo mostrar el diseño. Usá Renovar vista para intentarlo nuevamente.");
      return;
    }
    if (automatic && preview) lastAutomaticRenewalRef.current = preview.signedUrl;

    runExclusive("renewing", async () => {
      const result = await getOrderDesignImageReadUrlAction({}, makeFormData({ orderId }));
      if (result.status !== "success" || !result.image) {
        reportError("No se pudo renovar la vista", result.message ?? "Intentá nuevamente.");
        return;
      }
      setPreview(toPreview(result.image));
      reportSuccess("Vista renovada", "El acceso temporal al diseño se actualizó.");
    });
  }
  const renewPreviewEvent = useEffectEvent(renewPreview);

  useEffect(() => {
    if (!preview) return;
    const renewBeforeExpiryMs = 5_000;
    const delay = Math.max(0, Date.parse(preview.expiresAt) - Date.now() - renewBeforeExpiryMs);
    const timeout = window.setTimeout(() => renewPreviewEvent(true), delay);
    return () => window.clearTimeout(timeout);
  }, [preview]);

  function submitImage() {
    const file = fileInputRef.current?.files?.[0] ?? null;
    const validation = validateOrderDesignFileSelection(file);
    if (!validation.ok || !file) {
      reportError("Archivo no válido", validation.ok ? "Seleccioná una imagen para continuar." : validation.message, true);
      return;
    }

    runExclusive("uploading", async () => {
      const intent = await startOrderDesignImageUploadAction({}, makeFormData({
        orderId,
        contentType: validation.contentType,
        byteSize: String(file.size),
        expectedImageUpdatedAt: preview?.updatedAt ?? "",
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

      const finalize = await finalizeOrderDesignImageAction({}, makeFormData({
        orderId,
        objectPath: intent.uploadIntent.objectPath,
        contentType: intent.uploadIntent.contentType,
        byteSize: String(intent.uploadIntent.byteSize),
        expectedImageUpdatedAt: intent.uploadIntent.expectedImageUpdatedAt ?? "",
        idempotencyKey: crypto.randomUUID(),
      }));
      if (finalize.status !== "success") {
        reportError("No se pudo confirmar el diseño", finalize.message ?? "Intentá nuevamente.", true);
        return;
      }

      const readUrl = await getOrderDesignImageReadUrlAction({}, makeFormData({ orderId }));
      if (readUrl.status !== "success" || !readUrl.image) {
        reportError("Diseño confirmado", "La imagen quedó guardada, pero la vista no pudo renovarse. Usá Renovar vista.");
        return;
      }

      const replaced = preview !== null;
      setPreview(toPreview(readUrl.image));
      lastAutomaticRenewalRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
      reportSuccess(replaced ? "Diseño reemplazado" : "Diseño cargado", "La imagen vigente del pedido se actualizó.");
    });
  }

  const pending = operation !== "idle";
  const fieldError = feedback?.kind === "error" && operation !== "renewing" ? feedback.description : null;

  return (
    <section aria-busy={pending} aria-labelledby="order-design-heading" className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-label text-muted-foreground">ARCHIVO VISUAL</p>
          <h2 className="mt-1 text-base font-semibold" id="order-design-heading">Diseño vigente</h2>
        </div>
        {preview ? <span className="rounded-full border border-border bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">1 vigente</span> : null}
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {preview ? (
          <figure className="overflow-hidden rounded-lg border border-border bg-muted/30">
            <div className="relative aspect-[4/3] bg-muted">
              {/* Signed URLs are short-lived and must bypass image optimization caches. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Diseño vigente del pedido"
                className="size-full object-contain"
                key={preview.expiresAt}
                onError={() => renewPreview(true)}
                referrerPolicy="no-referrer"
                src={preview.signedUrl}
              />
            </div>
            <figcaption className="border-t border-border px-3 py-2 text-xs leading-5 text-muted-foreground">
              Vista privada con acceso temporal renovable.
            </figcaption>
          </figure>
        ) : (
          <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/25 p-5 text-center">
            <FileImage aria-hidden="true" className="text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Todavía no hay un diseño cargado.</p>
            <p className="mt-1 max-w-xs text-sm leading-5 text-muted-foreground">
              {canManage ? "Cargá una imagen para dejarla disponible al equipo." : "Cuando se cargue una imagen, va a aparecer en este panel."}
            </p>
          </div>
        )}

        {feedback ? (
          <Alert
            ref={feedbackRef}
            tabIndex={-1}
            variant={feedback.kind === "error" ? "destructive" : "success"}
          >
            {feedback.kind === "error" ? <AlertCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            <AlertTitle>{feedback.title}</AlertTitle>
            <AlertDescription>{feedback.description}</AlertDescription>
          </Alert>
        ) : null}

        {preview ? (
          <Button disabled={pending} onClick={() => renewPreview()} type="button" variant="outline">
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
              <FieldDescription id={`order-design-help-${orderId}`}>JPEG, PNG o WebP. Máximo 10 MiB. Una imagen vigente sólo puede reemplazarse.</FieldDescription>
              {fieldError ? <FieldError id={`order-design-error-${orderId}`}>{fieldError}</FieldError> : null}
            </Field>
            <div className="mt-3 flex justify-end">
              <Button disabled={pending} onClick={submitImage} type="button">
                {operation === "uploading" ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" data-icon="inline-start" /> : <Upload aria-hidden="true" data-icon="inline-start" />}
                {operation === "uploading" ? "Procesando diseño..." : preview ? "Reemplazar diseño" : "Cargar diseño"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
