"use client";

import { Activity, ArrowRight, CalendarDays, FileText, Layers3, MessageSquareText, Package, RotateCcw, Shirt, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useMutationToast } from "@/hooks/use-mutation-toast";

import { reverseOrderPaymentAction, type OrderQuickView, type ReverseOrderPaymentActionState } from "../actions";
import type { BoardOrder } from "../queries";

import { OrderDesignThumbnail } from "./order-design-thumbnail";

function formatOrderNumber(publicNumber: number) {
  return `PED-${String(publicNumber).padStart(6, "0")}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Cordoba" }).format(new Date(value));
}

function openModal(dialog: HTMLDialogElement) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeModal(dialog: HTMLDialogElement) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function ReversePaymentDialog({ data, onReconciled }: { data: OrderQuickView; onReconciled: (order: BoardOrder | null) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<ReverseOrderPaymentActionState>({});
  const [isPending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useMutationToast(state);

  function submit() {
    if (isPending || !data.paymentId) return;
    const formData = new FormData();
    formData.set("orderId", data.id);
    formData.set("paymentId", data.paymentId);
    formData.set("expectedUpdatedAt", data.expectedUpdatedAt);
    formData.set("idempotencyKey", crypto.randomUUID());
    if (reason.trim()) formData.set("reason", reason.trim());

    startTransition(async () => {
      const result = await reverseOrderPaymentAction({}, formData);
      setState(result);
      if (result.reconciledOrder) onReconciled(result.reconciledOrder);
      if (result.status === "success") {
        setOpen(false);
        setReason("");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!isPending) setOpen(nextOpen); }}>
      <AlertDialogTrigger asChild>
        <Button data-no-drag="true" disabled={!data.paymentId || isPending} onPointerDown={(event) => event.stopPropagation()} type="button" variant="destructive">
          <RotateCcw data-icon="inline-start" />
          Revertir pago
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Revertir pago</AlertDialogTitle>
          <AlertDialogDescription>
            Se conservarán el pago y el ingreso original, se registrará la contrapartida y el pedido volverá a su etapa anterior. Esta acción no elimina el historial.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor={`reverse-payment-reason-${data.id}`}>Motivo <span className="font-normal text-muted-foreground">(opcional)</span></label>
          <Textarea disabled={isPending} id={`reverse-payment-reason-${data.id}`} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Qué se corrigió y por qué (opcional)." rows={3} value={reason} />
        </div>
        {state.status === "error" ? <Alert variant="destructive"><AlertTitle>No se pudo revertir el pago</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} ref={cancelRef}>Cancelar</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button disabled={isPending || !data.paymentId} onClick={(event) => { event.preventDefault(); submit(); }} type="button" variant="destructive">
              {isPending ? "Revirtiendo..." : "Revertir pago"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function OrderQuickView({ data, onClose, onReconciled, stageNames }: { data: OrderQuickView & Pick<BoardOrder, "primaryDesignImage" | "productName">; onClose: () => void; onReconciled: (order: BoardOrder | null) => void; stageNames: Record<string, string> }) {
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const handleUrlReady = useCallback((url: string) => setExpandedUrl(url), []);
  const quickViewDialogRef = useRef<HTMLDialogElement>(null);
  const expandedDialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const detailPath = `/orders/${data.id}`;
  const editPath = data.canEditSensitive ? `${detailPath}?view=edit` : `${detailPath}#order-description`;
  const movement = data.lastMovement
    ? `Movido de ${data.lastMovement.fromStageId ? stageNames[data.lastMovement.fromStageId] ?? "una etapa no disponible" : "inicio"} a ${data.lastMovement.toStageId ? stageNames[data.lastMovement.toStageId] ?? "una etapa no disponible" : "una etapa no disponible"}`
    : "Todavía no hay movimientos registrados.";

  useEffect(() => {
    const dialog = quickViewDialogRef.current;
    if (!dialog) return;
    openModal(dialog);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      if (dialog.open) closeModal(dialog);
    };
  }, []);

  useEffect(() => {
    const dialog = expandedDialogRef.current;
    if (!dialog) return;
    if (isExpanded && expandedUrl && !dialog.open) openModal(dialog);
    if (!isExpanded && dialog.open) closeModal(dialog);
  }, [expandedUrl, isExpanded]);

  function closeExpandedImage() {
    setIsExpanded(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <dialog
      aria-label={`Vista rápida de ${formatOrderNumber(data.publicNumber)}`}
      className="m-auto max-h-[90dvh] w-[min(94vw,54rem)] overflow-hidden rounded-2xl border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-foreground/25 backdrop:backdrop-blur-[2px]"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      ref={quickViewDialogRef}
    >
      <article className="flex max-h-[90dvh] min-h-0 flex-col">
      <header className="grid-paper flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-medium uppercase tracking-label text-muted-foreground">Vista rápida · {formatOrderNumber(data.publicNumber)}</p>
          <h2 className="mt-1 break-words text-xl font-semibold tracking-display">{data.teamName ?? "Equipo sin completar"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{data.customerName ?? "Cliente histórico"}</p>
        </div>
        <Button aria-label="Cerrar vista rápida" data-no-drag="true" onClick={onClose} ref={closeButtonRef} size="icon" type="button" variant="ghost"><X aria-hidden="true" /></Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        <div className="grid min-w-0 gap-5 md:grid-cols-[13rem_minmax(0,1fr)]">
          <OrderDesignThumbnail
            alt={`Diseño de ${data.customerName}`}
            className="h-40 w-full rounded-xl md:h-44"
            imageUpdatedAt={data.primaryDesignImage?.updatedAt ?? null}
            key={data.primaryDesignImage?.updatedAt ?? "empty"}
            onActivate={(trigger) => {
              triggerRef.current = trigger;
              setIsExpanded(true);
            }}
            onUrlReady={handleUrlReady}
            orderId={data.id}
          />
          <div className="min-w-0">
            <Badge className="gap-1.5 rounded-full border-primary/25 bg-primary/10 text-primary" variant="outline"><Layers3 aria-hidden="true" className="size-3" />{data.stageName}</Badge>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface-muted/50 p-3"><dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Package aria-hidden="true" className="size-3.5" />Cantidad</dt><dd className="mt-1 font-mono text-sm font-medium tabular-nums">{data.quantity} u.</dd></div>
              <div className="rounded-xl border border-border bg-surface-muted/50 p-3"><dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Shirt aria-hidden="true" className="size-3.5" />Producto</dt><dd className="mt-1 break-words text-sm font-medium">{data.productName ?? "Sin producto"}</dd></div>
              <div className="rounded-xl border border-border bg-surface-muted/50 p-3"><dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><CalendarDays aria-hidden="true" className="size-3.5" />Entrega</dt><dd className="mt-1 font-mono text-sm font-medium tabular-nums">{formatDate(data.promisedDeliveryDate)}</dd></div>
            </dl>
            <section className="mt-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><FileText aria-hidden="true" className="size-4 text-primary" />Descripción</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{data.description?.trim() || "Sin descripción."}</p>
            </section>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-border p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Activity aria-hidden="true" className="size-4 text-primary" />Último movimiento</h3>
            <p className="mt-3 text-sm leading-6">{movement}</p>
            {data.lastMovement ? <p className="mt-1 text-xs text-muted-foreground">{data.lastMovement.actor} · {formatDateTime(data.lastMovement.occurredAt)}</p> : null}
          </section>
          <section className="rounded-xl border border-border p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText aria-hidden="true" className="size-4 text-primary" />Último comentario</h3>
            {data.comments.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Todavía no hay comentarios.</p> : <div className="mt-3 text-sm"><p className="font-medium">{data.comments[0].actor} <span className="font-mono text-xs font-normal text-muted-foreground">{formatDateTime(data.comments[0].occurredAt)}</span></p><p className="mt-1 whitespace-pre-wrap leading-5 text-muted-foreground">{data.comments[0].body}</p></div>}
          </section>
        </div>
      </div>

      <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-muted/35 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <Button asChild data-no-drag="true" variant="outline"><Link href={detailPath}>Ver detalle <ArrowRight data-icon="inline-end" /></Link></Button>
        {data.canEditDescription ? <Button asChild data-no-drag="true"><Link href={editPath}>Editar pedido</Link></Button> : null}
        {data.canReversePayment && data.stageCode === "paid" ? <ReversePaymentDialog data={data} onReconciled={onReconciled} /> : null}
      </footer>
      </article>
      <dialog
        aria-labelledby={`expanded-design-heading-${data.id}`}
        className="m-auto max-h-[90vh] max-w-[min(92vw,56rem)] rounded-xl border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/70"
        onCancel={(event) => {
          event.preventDefault();
          closeExpandedImage();
        }}
        onClose={closeExpandedImage}
        ref={expandedDialogRef}
      >
        <div className="flex max-h-[90vh] flex-col gap-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs font-semibold tracking-data text-muted-foreground">ARCHIVO VISUAL</p>
              <h2 className="mt-1 text-lg font-semibold" id={`expanded-design-heading-${data.id}`}>Diseño de {data.customerName}</h2>
            </div>
            <Button aria-label="Cerrar imagen ampliada" onClick={closeExpandedImage} size="icon" type="button" variant="ghost"><X aria-hidden="true" /></Button>
          </div>
          {expandedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={`Diseño ampliado de ${data.customerName}`} className="max-h-[72vh] w-full object-contain" referrerPolicy="no-referrer" src={expandedUrl} />
          ) : <p className="text-sm text-muted-foreground">Preparando la vista ampliada...</p>}
        </div>
      </dialog>
    </dialog>
  );
}
