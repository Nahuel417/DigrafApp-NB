"use client";

import { AlertCircle, Archive, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useMutationToast } from "@/hooks/use-mutation-toast";

import { archiveDeliveredOrderAction, cancelOrderAction, purgeCancelledOrderAction, restoreOrderAction, unarchiveDeliveredOrderAction } from "../cancellation-actions";
import type { ArchiveDeliveredActionState, CancellationActionState, RestoreActionState } from "../cancellation-actions";
import { formatOrderNumber } from "../detail-format";

type OrderLifecycleDialogProps = {
  orderId: string;
  publicNumber: number;
  customerName: string;
  expectedUpdatedAt: string;
};

export function CancelOrderDialog(props: OrderLifecycleDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<CancellationActionState, FormData>(cancelOrderAction, {});
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  useMutationToast(state);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setIdempotencyKey(crypto.randomUUID());
    setOpen(nextOpen);
  }

  useEffect(() => {
    if (!state.toastId) return;
    if (state.status === "success") {
      cancelButtonRef.current?.click();
      router.refresh();
      return;
    }
    reasonRef.current?.focus();
  }, [router, state.status, state.toastId]);

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogTrigger asChild>
        <Button className="group/lifecycle-action transition-[background-color,border-color,box-shadow,transform,translate] duration-150 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:!translate-none" variant="destructive">
          <Archive aria-hidden="true" className="transition-transform duration-150 group-hover/lifecycle-action:-translate-y-0.5 group-active/lifecycle-action:translate-y-0 motion-reduce:!translate-none" data-icon="inline-start" />
          Anular pedido
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Anular {formatOrderNumber(props.publicNumber)}</AlertDialogTitle>
          <AlertDialogDescription>
            {props.customerName} quedará fuera del tablero y se conservará en el Archivo. Esta acción no elimina relaciones, finanzas ni imágenes y se puede restaurar durante 30 días.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input name="orderId" type="hidden" value={props.orderId} />
          <input name="expectedUpdatedAt" type="hidden" value={props.expectedUpdatedAt} />
          <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
          <Field>
            <FieldLabel htmlFor={`cancel-reason-${props.orderId}`}>Motivo de anulación</FieldLabel>
            <Textarea id={`cancel-reason-${props.orderId}`} maxLength={500} minLength={2} name="reason" ref={reasonRef} required rows={4} />
            <FieldDescription>Entre 2 y 500 caracteres. Se guarda en el historial.</FieldDescription>
          </Field>
          {state.status === "error" ? (
            <Alert role="alert" variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>No se pudo anular el pedido</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelButtonRef}>Cancelar</AlertDialogCancel>
            <SubmitButton className="group/lifecycle-confirm transition-[background-color,border-color,box-shadow,transform,translate] duration-150 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:!translate-none" pendingLabel="Anulando..." variant="destructive">
              <Archive aria-hidden="true" className="transition-transform duration-150 group-hover/lifecycle-confirm:-translate-y-0.5 group-active/lifecycle-confirm:translate-y-0 motion-reduce:!translate-none" data-icon="inline-start" />
              Confirmar anulación
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RestoreOrderDialog(props: OrderLifecycleDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<RestoreActionState, FormData>(restoreOrderAction, {});
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  useMutationToast(state);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setIdempotencyKey(crypto.randomUUID());
    setOpen(nextOpen);
  }

  useEffect(() => {
    if (!state.toastId) return;
    if (state.status === "success") {
      cancelButtonRef.current?.click();
      router.refresh();
    }
  }, [router, state.status, state.toastId]);

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogTrigger asChild>
        <Button className="group/lifecycle-action transition-[background-color,border-color,box-shadow,transform,translate] duration-150 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:!translate-none" variant="outline">
          <RotateCcw aria-hidden="true" className="transition-transform duration-200 group-hover/lifecycle-action:-rotate-45 group-active/lifecycle-action:rotate-0 motion-reduce:!rotate-none" data-icon="inline-start" />
          Restaurar pedido
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restaurar {formatOrderNumber(props.publicNumber)}</AlertDialogTitle>
          <AlertDialogDescription>
            {props.customerName} volverá al tablero en su etapa operativa anterior. La restauración no modifica relaciones, finanzas ni imágenes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input name="orderId" type="hidden" value={props.orderId} />
          <input name="expectedUpdatedAt" type="hidden" value={props.expectedUpdatedAt} />
          <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
          {state.status === "error" ? (
            <Alert role="alert" variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>No se pudo restaurar el pedido</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelButtonRef}>Cancelar</AlertDialogCancel>
            <SubmitButton className="group/lifecycle-confirm transition-[background-color,border-color,box-shadow,transform,translate] duration-150 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:!translate-none" pendingLabel="Restaurando...">
              <RotateCcw aria-hidden="true" className="transition-transform duration-200 group-hover/lifecycle-confirm:-rotate-45 group-active/lifecycle-confirm:rotate-0 motion-reduce:!rotate-none" data-icon="inline-start" />
              Confirmar restauración
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type M16DialogAction = (previous: ArchiveDeliveredActionState, formData: FormData) => Promise<ArchiveDeliveredActionState>;

function M16ArchiveDialog({
  action,
  buttonLabel,
  customerName,
  description,
  destructive = false,
  expectedUpdatedAt,
  orderId,
  pendingLabel,
  publicNumber,
  title,
}: OrderLifecycleDialogProps & {
  action: M16DialogAction;
  buttonLabel: string;
  description: string;
  destructive?: boolean;
  pendingLabel: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ArchiveDeliveredActionState, FormData>(action, {});
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  useMutationToast(state);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setIdempotencyKey(crypto.randomUUID());
    setOpen(nextOpen);
  }

  useEffect(() => {
    if (!state.toastId) return;
    if (state.status === "success") {
      cancelButtonRef.current?.click();
      router.refresh();
    }
  }, [router, state.status, state.toastId]);

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogTrigger asChild>
        <Button className="group/lifecycle-action transition-[background-color,border-color,box-shadow,transform,translate] duration-150 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:!translate-none" variant={destructive ? "destructive" : "outline"}>
          {destructive ? <Trash2 aria-hidden="true" className="transition-transform duration-150 group-hover/lifecycle-action:rotate-6 group-active/lifecycle-action:rotate-0 motion-reduce:!rotate-none" data-icon="inline-start" /> : <Archive aria-hidden="true" className="transition-transform duration-150 group-hover/lifecycle-action:-translate-y-0.5 group-active/lifecycle-action:translate-y-0 motion-reduce:!translate-none" data-icon="inline-start" />}
          {buttonLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title} {formatOrderNumber(publicNumber)}</AlertDialogTitle>
          <AlertDialogDescription>{customerName} {description}</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input name="orderId" type="hidden" value={orderId} />
          <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
          {title.includes("Archivar") || title.includes("Retirar") ? <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} /> : null}
          {destructive ? (
            <Field>
              <FieldLabel htmlFor={`purge-reason-${orderId}`}>Motivo del borrado</FieldLabel>
              <Textarea id={`purge-reason-${orderId}`} maxLength={500} minLength={2} name="reason" required rows={4} />
              <FieldDescription>Entre 2 y 500 caracteres. Se guarda en el historial.</FieldDescription>
            </Field>
          ) : null}
          {state.status === "error" ? (
            <Alert role="alert" variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>No se pudo completar la operación</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelButtonRef}>Cancelar</AlertDialogCancel>
            <SubmitButton className="group/lifecycle-confirm transition-[background-color,border-color,box-shadow,transform,translate] duration-150 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:!translate-none" pendingLabel={pendingLabel} variant={destructive ? "destructive" : "default"}>
              {destructive ? <Trash2 aria-hidden="true" className="transition-transform duration-150 group-hover/lifecycle-confirm:rotate-6 group-active/lifecycle-confirm:rotate-0 motion-reduce:!rotate-none" data-icon="inline-start" /> : <Archive aria-hidden="true" className="transition-transform duration-150 group-hover/lifecycle-confirm:-translate-y-0.5 group-active/lifecycle-confirm:translate-y-0 motion-reduce:!translate-none" data-icon="inline-start" />}
              Confirmar
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ArchiveDeliveredOrderDialog(props: OrderLifecycleDialogProps) {
  return <M16ArchiveDialog {...props} action={archiveDeliveredOrderAction} buttonLabel="Archivar entregado" description="se conservará indefinidamente y podrá retirarse del archivo. No se eliminan relaciones, finanzas ni imágenes." pendingLabel="Archivando..." title="Archivar entregado" />;
}

export function UnarchiveDeliveredOrderDialog(props: OrderLifecycleDialogProps) {
  return <M16ArchiveDialog {...props} action={unarchiveDeliveredOrderAction} buttonLabel="Retirar del archivo de entregados" description="volverá al tablero como pedido entregado. Esta acción es reversible y conserva todos sus datos." pendingLabel="Retirando..." title="Retirar del archivo" />;
}

export function PurgeCancelledOrderDialog(props: OrderLifecycleDialogProps) {
  return <M16ArchiveDialog {...props} action={purgeCancelledOrderAction} buttonLabel="Borrar pedido" description="se ejecuta inmediatamente, elimina los datos operativos y no se puede deshacer; las finanzas y la auditoría se conservarán." destructive pendingLabel="Borrando..." title="Borrar pedido" />;
}
