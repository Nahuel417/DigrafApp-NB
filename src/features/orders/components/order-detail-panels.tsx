"use client";

import { AlertCircle, CircleCheck, MessageSquarePlus, Pencil } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useMutationToast } from "@/hooks/use-mutation-toast";

import { createOrderCommentAction, updateOrderDescriptionAction } from "../detail-actions";

export function CreateCommentForm({ orderId }: { orderId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyInputRef = useRef<HTMLInputElement>(null);
  const [state, formAction] = useActionState(createOrderCommentAction, {});
  useMutationToast(state);

  useEffect(() => {
    if (state.status !== "success" || !state.toastId) return;
    formRef.current?.reset();
    if (idempotencyInputRef.current) {
      idempotencyInputRef.current.value = crypto.randomUUID();
    }
  }, [state.status, state.toastId]);

  return (
    <form action={formAction} className="flex flex-col gap-3" ref={formRef}>
      <input name="orderId" type="hidden" value={orderId} />
      <input defaultValue={crypto.randomUUID()} name="idempotencyKey" ref={idempotencyInputRef} type="hidden" />
      <Field>
        <FieldLabel className="text-sm" htmlFor="comment-body">Nuevo comentario</FieldLabel>
        <Textarea
          aria-describedby={state.fieldErrors?.body ? "comment-body-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.body)}
          id="comment-body"
          name="body"
          placeholder="Agregá una nota interna visible para el equipo."
          rows={3}
        />
        {state.fieldErrors?.body ? <p className="text-sm text-destructive" id="comment-body-error">{state.fieldErrors.body.join(" ")}</p> : null}
      </Field>
      {state.status === "error" && !state.fieldErrors ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>No se pudo publicar el comentario</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton className="min-h-11 md:min-h-10" pendingLabel="Publicando...">
          <MessageSquarePlus aria-hidden="true" />
          Publicar comentario
        </SubmitButton>
      </div>
    </form>
  );
}

export function CommentList({ comments }: { comments: Array<{ id: string; actor: string; body: string; occurredAt: string }> }) {
  if (comments.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay comentarios en este pedido.</p>;

  return (
    <ul className="flex flex-col gap-4">
      {comments.map((comment) => (
        <li className="rounded-lg border border-border bg-card p-4" key={comment.id}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium">{comment.actor}</p>
            <p className="text-xs font-mono text-muted-foreground">{formatDateTime(comment.occurredAt)}</p>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{comment.body}</p>
        </li>
      ))}
    </ul>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date(value));
}

export function Timeline({ events, stageNames }: { events: Array<{
  id: string;
  type: string;
  actor: string;
  occurredAt: string;
  body: string | null;
  fromStageName?: string;
  toStageName?: string;
  details: Record<string, unknown>;
}>; stageNames: Record<string, string> }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay movimientos ni comentarios en este pedido.</p>;

  return (
    <ol className="relative flex flex-col gap-4 border-l border-border pl-6">
      {events.map((event) => (
        <li className="relative" key={event.id}>
          <span className="absolute -left-[1.6rem] top-1.5 flex size-3 rounded-full border border-border bg-primary" />
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium">{eventLabel(event.type, stageNames, event)}</p>
              <p className="text-xs font-mono text-muted-foreground">{formatDateTime(event.occurredAt)}</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{event.actor}</p>
            {event.type === "commented" && event.body ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{event.body}</p>
            ) : null}
            {event.type === "promised_delivery_date_changed" && event.details.previous_promised_delivery_date && event.details.next_promised_delivery_date ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Fecha prometida: {formatDate(event.details.previous_promised_delivery_date as string)} → {formatDate(event.details.next_promised_delivery_date as string)}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function eventLabel(type: string, stageNames: Record<string, string>, event: { fromStageName?: string; toStageName?: string }) {
  if (type === "commented") return "Comentario";
  if (type === "stage_moved") return `Movimiento: ${event.fromStageName ?? "inicio"} → ${event.toStageName ?? "—"}`;
  if (type === "promised_delivery_date_changed") return "Cambio de fecha prometida";
  if (type === "order_updated") return "Pedido actualizado";
  return type;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function EditableDescription({
  description,
  orderId,
  updatedAt,
  readOnly,
}: {
  description: string;
  orderId: string;
  updatedAt: string;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(updateOrderDescriptionAction, {});
  const idempotencyInputRef = useRef<HTMLInputElement>(null);
  useMutationToast(state);

  useEffect(() => {
    if (state.status !== "success" || !state.toastId) return;
    if (idempotencyInputRef.current) {
      idempotencyInputRef.current.value = crypto.randomUUID();
    }
  }, [state.status, state.toastId]);

  if (readOnly) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">{description.trim() ? description : "Sin descripción."}</p>
      </div>
    );
  }

  if (editing) {
    return (
      <form action={formAction} className="flex flex-col gap-3">
        <input name="orderId" type="hidden" value={orderId} />
        <input defaultValue={crypto.randomUUID()} name="idempotencyKey" ref={idempotencyInputRef} type="hidden" />
        <input name="expectedUpdatedAt" type="hidden" value={updatedAt} />
        <Textarea defaultValue={description} id="order-description" name="description" rows={4} />
        <div className="flex flex-wrap gap-2">
          <SubmitButton className="min-h-11 md:min-h-10" pendingLabel="Guardando...">
            <CircleCheck aria-hidden="true" />
            Guardar
          </SubmitButton>
          <Button className="min-h-11 md:min-h-10" onClick={() => setEditing(false)} type="button" variant="outline">
            Cancelar
          </Button>
        </div>
        {state.status === "error" ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-relaxed">{description.trim() ? description : "Sin descripción."}</p>
        <Button aria-label="Editar descripción" className="size-10 shrink-0" onClick={() => setEditing(true)} size="icon" type="button" variant="ghost">
          <Pencil aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

