"use client";

import { ArrowRight, RotateCcw, X } from "lucide-react";
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

export function OrderQuickView({ data, onClose, onReconciled, stageNames }: { data: OrderQuickView & Pick<BoardOrder, "primaryDesignImage">; onClose: () => void; onReconciled: (order: BoardOrder | null) => void; stageNames: Record<string, string> }) {
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const handleUrlReady = useCallback((url: string) => setExpandedUrl(url), []);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const detailPath = `/orders/${data.id}`;
  const editPath = `${detailPath}#${data.canEditSensitive ? "edit-order" : "order-description"}`;
  const movement = data.lastMovement
    ? `Movido de ${data.lastMovement.fromStageId ? stageNames[data.lastMovement.fromStageId] ?? "una etapa no disponible" : "inicio"} a ${data.lastMovement.toStageId ? stageNames[data.lastMovement.toStageId] ?? "una etapa no disponible" : "una etapa no disponible"}`
    : "Todavía no hay movimientos registrados.";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isExpanded && expandedUrl && !dialog.open) dialog.showModal();
    if (!isExpanded && dialog.open) dialog.close();
  }, [expandedUrl, isExpanded]);

  function closeExpandedImage() {
    setIsExpanded(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <aside aria-label={`Vista rápida de ${formatOrderNumber(data.publicNumber)}`} className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold tracking-data text-muted-foreground">{formatOrderNumber(data.publicNumber)}</p>
           <h2 className="mt-1 break-words text-lg font-semibold">{data.customerName ?? "Cliente histórico"}</h2>
           <p className="mt-1 text-sm text-muted-foreground">{data.teamName ?? "Equipo sin completar"}</p>
        </div>
        <Button aria-label="Cerrar vista rápida" data-no-drag="true" onClick={onClose} size="icon" type="button" variant="ghost"><X aria-hidden="true" /></Button>
      </div>
      <OrderDesignThumbnail
        alt={`Diseño de ${data.customerName}`}
        className="mt-3 h-24 w-32 sm:h-28 sm:w-40"
        imageUpdatedAt={data.primaryDesignImage?.updatedAt ?? null}
        key={data.primaryDesignImage?.updatedAt ?? "empty"}
        onActivate={(trigger) => {
          triggerRef.current = trigger;
          setIsExpanded(true);
        }}
        onUrlReady={handleUrlReady}
        orderId={data.id}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2"><Badge variant="outline">{data.stageName}</Badge><span className="text-sm text-muted-foreground">{data.quantity} unidades · {data.orderType === "set" ? "Conjunto" : "Prenda individual"}</span></div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Entrega prometida</dt><dd className="mt-1 font-mono text-sm font-medium">{formatDate(data.promisedDeliveryDate)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Descripción</dt><dd className="mt-1 text-sm">{data.description?.trim() || "Sin descripción."}</dd></div>
      </dl>
      <section className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Último movimiento</h3>
        <p className="mt-2 text-sm">{movement}</p>
        {data.lastMovement ? <p className="mt-1 text-xs text-muted-foreground">{data.lastMovement.actor} · {formatDateTime(data.lastMovement.occurredAt)}</p> : null}
      </section>
      <section className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Comentarios recientes</h3>
        {data.comments.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Todavía no hay comentarios.</p> : <ul className="mt-3 flex flex-col gap-3">{data.comments.map((comment) => <li className="text-sm" key={comment.id}><p className="font-medium">{comment.actor} <span className="font-mono text-xs font-normal text-muted-foreground">{formatDateTime(comment.occurredAt)}</span></p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{comment.body}</p></li>)}</ul>}
      </section>
      <div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-4">
        <Button asChild data-no-drag="true" variant="outline"><Link href={detailPath}>Ver detalle <ArrowRight data-icon="inline-end" /></Link></Button>
        {data.canEditDescription ? <Button asChild data-no-drag="true"><Link href={editPath}>Editar pedido</Link></Button> : null}
        {data.canReversePayment && data.stageCode === "paid" ? <ReversePaymentDialog data={data} onReconciled={onReconciled} /> : null}
      </div>
      <dialog
        aria-labelledby={`expanded-design-heading-${data.id}`}
        className="m-auto max-h-[90vh] max-w-[min(92vw,56rem)] rounded-xl border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/70"
        onCancel={(event) => {
          event.preventDefault();
          closeExpandedImage();
        }}
        onClose={closeExpandedImage}
        ref={dialogRef}
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
    </aside>
  );
}
