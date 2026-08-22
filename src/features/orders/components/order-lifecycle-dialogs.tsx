"use client";

import { AlertCircle, Archive, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useMutationToast } from "@/hooks/use-mutation-toast";

import { cancelOrderAction, restoreOrderAction } from "../cancellation-actions";
import type { CancellationActionState, RestoreActionState } from "../cancellation-actions";
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
        <Button variant="destructive">
          <Archive aria-hidden="true" />
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
            <SubmitButton pendingLabel="Anulando..." variant="destructive">
              <Archive aria-hidden="true" />
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
        <Button variant="outline">
          <RotateCcw aria-hidden="true" />
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
            <SubmitButton pendingLabel="Restaurando...">
              <RotateCcw aria-hidden="true" />
              Confirmar restauración
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
