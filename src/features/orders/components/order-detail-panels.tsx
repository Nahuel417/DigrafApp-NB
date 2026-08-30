"use client";

import { AlertCircle, ChevronDown, CircleCheck, MessageSquarePlus, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useMutationToast } from "@/hooks/use-mutation-toast";

import { createOrderCommentAction, updateOrderDescriptionAction } from "../detail-actions";
import { operationalHistoryDetails, operationalHistorySummary } from "../detail-format";

export function CreateCommentForm({ orderId }: { orderId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [state, formAction] = useActionState(createOrderCommentAction, {});
  useMutationToast(state);

  useEffect(() => {
    if (!state.toastId) return;
    if (state.status === "success") {
      formRef.current?.reset();
      if (idempotencyInputRef.current) {
        idempotencyInputRef.current.value = "";
      }
      return;
    }
    if (state.fieldErrors?.body) textareaRef.current?.focus();
  }, [state.fieldErrors?.body, state.status, state.toastId]);

  return (
    <form action={formAction} className="flex flex-col gap-3" onSubmit={() => { if (idempotencyInputRef.current && !idempotencyInputRef.current.value) idempotencyInputRef.current.value = crypto.randomUUID(); }} ref={formRef}>
      <input name="orderId" type="hidden" value={orderId} />
      <input name="idempotencyKey" ref={idempotencyInputRef} type="hidden" />
      <Field>
        <FieldLabel className="text-xs font-semibold" htmlFor="comment-body">Nuevo comentario</FieldLabel>
        <Textarea
          aria-describedby={state.fieldErrors?.body ? "comment-body-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.body)}
          id="comment-body"
          name="body"
          placeholder="Agregá una nota interna visible para el equipo."
          className="min-h-20 resize-none rounded-xl bg-surface-muted px-3 py-2.5 text-sm shadow-none"
          ref={textareaRef}
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
        <SubmitButton className="h-10 min-h-10 rounded-xl px-4 text-xs shadow-xs" pendingLabel="Publicando...">
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
    <ul className="flex flex-col gap-3">
      {comments.map((comment) => (
        <li className="rounded-xl border border-border bg-surface-muted/50 p-3" key={comment.id}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium">{comment.actor}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{formatDateTime(comment.occurredAt)}</p>
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

type TimelineEvent = {
  id: string;
  type: string;
  actor: string;
  occurredAt: string;
  body: string | null;
  changeNote: string | null;
  fromStageName?: string;
  toStageName?: string;
  details: Record<string, unknown>;
};

function TimelineEventList({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative flex flex-col">
      {events.length > 1 ? <span aria-hidden="true" className="absolute bottom-3.5 left-3.5 top-3.5 w-px bg-border" /> : null}
      {events.map((event) => {
        const EventIcon = event.type === "commented" ? MessageSquarePlus : CircleCheck;
        return (
          <li className="relative flex min-w-0 gap-4 py-3 first:pt-0 last:pb-0" key={event.id}>
            <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-surface-muted text-primary ring-4 ring-card"><EventIcon aria-hidden="true" className="size-3.5" /></span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5">{eventLabel(event.type, event)}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{formatDateTime(event.occurredAt)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{event.actor}</p>
                </div>
                {event.type === "stage_moved" && event.toStageName ? <span className="hidden shrink-0 pt-0.5 text-xs text-muted-foreground sm:block">{event.toStageName}</span> : null}
              </div>
              {event.type === "commented" && event.body ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{event.body}</p>
              ) : null}
              {event.type === "order_updated" && operationalHistoryDetails(event.details).length > 1 ? <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{operationalHistoryDetails(event.details).map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
              {event.changeNote ? <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Motivo:</span> {event.changeNote}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay movimientos registrados en este pedido.</p>;

  const recentEvents = events.slice(0, 4);
  const olderEvents = events.slice(4);

  return (
    <div>
      <TimelineEventList events={recentEvents} />
      {olderEvents.length ? (
        <details className="group/timeline mt-4">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:border-primary/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
            <span className="group-open/timeline:hidden">Ver {olderEvents.length} movimientos anteriores</span>
            <span className="hidden group-open/timeline:inline">Ocultar movimientos anteriores</span>
            <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-150 group-open/timeline:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="mt-4">
            <TimelineEventList events={olderEvents} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function eventLabel(type: string, event: { details: Record<string, unknown>; fromStageName?: string; toStageName?: string }) {
  if (type === "commented") return "Comentario";
  if (type === "payment_confirmed") return "Pago confirmado";
  if (type === "payment_reversed") return "Pago revertido";
  if (type === "stage_moved") return `Se movió el pedido de ${event.fromStageName ?? "la etapa inicial"} a ${event.toStageName ?? "una etapa no disponible"}`;
  if (type === "promised_delivery_date_changed") return "Se actualizó la fecha prometida";
  if (type === "order_updated") return operationalHistorySummary(event.details);
  if (type === "order_cancelled") return "Se anuló el pedido";
  if (type === "order_restored") return "Se restauró el pedido";
  return type;
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
  const router = useRouter();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const idempotencyInputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useMutationToast(state);

  useEffect(() => {
    if (state.status !== "success" || !state.toastId) return;
    if (idempotencyInputRef.current) {
      idempotencyInputRef.current.value = "";
    }
    window.requestAnimationFrame(() => router.refresh());
  }, [router, state.status, state.toastId]);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
      return;
    }
    if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);

  if (readOnly) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">{description.trim() ? description : "Sin descripción."}</p>
      </div>
    );
  }

  if (editing) {
    return (
        <form action={formAction} className="flex flex-col gap-3" onSubmit={(event) => { const input = event.currentTarget.elements.namedItem("idempotencyKey"); if (input instanceof HTMLInputElement && !input.value) input.value = crypto.randomUUID(); }}>
          <input name="orderId" type="hidden" value={orderId} />
          <input name="idempotencyKey" ref={idempotencyInputRef} type="hidden" />
        <input name="expectedUpdatedAt" type="hidden" value={updatedAt} />
        <Textarea defaultValue={description} id="order-description" name="description" ref={textareaRef} rows={4} />
        <Field>
          <FieldLabel htmlFor="order-description-change-note">Comentario del cambio</FieldLabel>
          <Textarea id="order-description-change-note" maxLength={300} name="changeNote" placeholder="Qué se hizo y por qué (opcional)." rows={2} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <SubmitButton className="min-h-11 md:min-h-10" pendingLabel="Guardando...">
            <CircleCheck aria-hidden="true" />
            Guardar
          </SubmitButton>
          <Button className="min-h-11 md:min-h-10" onClick={() => { restoreFocusRef.current = true; setEditing(false); }} type="button" variant="outline">
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
        <Button aria-label="Editar descripción" className="size-10 shrink-0" onClick={() => setEditing(true)} ref={editButtonRef} size="icon" type="button" variant="ghost">
          <Pencil aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
