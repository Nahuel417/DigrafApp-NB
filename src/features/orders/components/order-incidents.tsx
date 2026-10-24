"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, MessageSquareWarning, Package, PencilLine, Plus, RotateCcw, Save, Scissors, Sparkles, Waves, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { useMutationToast } from "@/hooks/use-mutation-toast";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

import { formatDateTime } from "../detail-format";
import { saveOrderIncidentAction } from "../incident-actions";
import type { OrderIncident } from "../incident-queries";
import { canCorrectIncident, canCreateIncident, incidentKinds, incidentReasons, type IncidentKind, type IncidentReason } from "../incident-schemas";
import styles from "./order-incidents.module.css";

type Role = Database["public"]["Enums"]["app_role"];
function kindLabel(kind: string) { return incidentKinds[kind as IncidentKind] ?? kind; }
function reasonLabel(reason: string) { return incidentReasons[reason as IncidentReason] ?? reason; }
const kindIcons = { internal: AlertCircle, complaint_without_return: MessageSquareWarning, complaint_with_return: RotateCcw };
const reasonIcons = { sewing: Scissors, design: Sparkles, incomplete: Package, calendering: Waves, customer_service: MessageSquareWarning };

function IncidentForm({ orderId, role, incident }: { orderId: string; role: Role; incident?: OrderIncident }) {
  const router = useRouter();
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const request = useRef({ id: "", incidentId: incident?.id ?? "" });
  const errorSummary = useRef<HTMLDivElement>(null);
  const confirmed = useRef(false);
  const isCreation = !incident;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [kind, setKind] = useState(incident?.kind ?? "internal");
  const [reasons, setReasons] = useState(incident?.reasons ?? []);
  const [state, action, pending] = useActionState(async (previous: Parameters<typeof saveOrderIncidentAction>[0], data: FormData) => {
    request.current.id ||= crypto.randomUUID();
    request.current.incidentId ||= crypto.randomUUID();
    data.set("requestId", request.current.id);
    data.set("incidentId", request.current.incidentId);
    const result = await saveOrderIncidentAction(previous, data);
    if (result.status === "success") {
      request.current.id = "";
      if (isCreation) {
        request.current.incidentId = "";
        setKind("internal");
        setReasons([]);
      }
    }
    return result;
  }, {});
  useMutationToast(state);
  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    } else if (state.status === "error") errorSummary.current?.focus();
  }, [state.status, state.toastId, router, isCreation]);

  return (
    <>
      <form aria-busy={pending} className="mt-5 flex min-w-0 flex-col gap-5 border-t border-border pt-5" id={`${orderId}-incident-${incident?.id ?? "new"}`} noValidate onChange={() => { request.current.id = ""; }} onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        if (!confirmed.current) { setConfirmOpen(true); return; }
        confirmed.current = false;
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }} ref={form}>
        <input name="orderId" type="hidden" value={orderId} />
        <input name="expectedVersion" type="hidden" value={incident?.version ?? 0} />
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold">{incident ? "Corregir incidencia" : "Nueva incidencia"}</h4>
          <Button aria-label="Cerrar formulario de incidencia" disabled={pending} onClick={(event) => { const disclosure = event.currentTarget.closest("details"); if (disclosure) { disclosure.open = false; disclosure.querySelector("summary")?.focus(); } }} size="icon" type="button" variant="ghost"><X aria-hidden="true" /></Button>
        </div>
        <FieldGroup className="gap-5">
          <FieldSet aria-describedby={state.fieldErrors?.kind ? `${id}-kind-error` : undefined} className="gap-0" disabled={pending}>
            <FieldLegend className="mb-3 text-muted-foreground data-[variant=label]:text-xs" variant="label">Tipo de incidencia</FieldLegend>
            <div className="grid gap-2 @min-[32rem]/incidents:grid-cols-3">
              {Object.entries(incidentKinds).filter(([value]) => canCreateIncident(role, value)).map(([kindValue, label]) => {
                const Icon = kindIcons[kindValue as IncidentKind];
                return (
                  <Field className="relative min-w-0 gap-0" data-invalid={Boolean(state.fieldErrors?.kind)} key={kindValue} orientation="horizontal">
                    <input checked={kind === kindValue} className="peer sr-only" id={`${id}-${kindValue}`} name="kind" onChange={() => setKind(kindValue)} type="radio" value={kindValue} />
                    <FieldLabel className={cn("flex h-full min-h-11 w-full cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring motion-reduce:transition-none", kind === kindValue ? "border-primary/40 bg-primary/5 text-primary" : "border-border hover:bg-secondary")} htmlFor={`${id}-${kindValue}`}>
                      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span className="text-xs font-medium leading-5">{label}</span>
                    </FieldLabel>
                  </Field>
                );
              })}
            </div>
            {state.fieldErrors?.kind ? <p className="text-sm text-destructive" id={`${id}-kind-error`}>{state.fieldErrors.kind.join(" ")}</p> : null}
          </FieldSet>
          <FieldSet aria-describedby={`${id}-reasons-help`} className="gap-0" disabled={pending}>
            <FieldLegend className="mb-3 text-muted-foreground data-[variant=label]:text-xs" variant="label">Motivos</FieldLegend>
            <p className="sr-only" id={`${id}-reasons-help`}>Seleccione uno o varios motivos.</p>
            <div className="grid gap-2 @min-[24rem]/incidents:grid-cols-2">
              {Object.entries(incidentReasons).map(([reason, label]) => {
                const Icon = reasonIcons[reason as IncidentReason];
                return (
                  <Field className="min-w-0 gap-0" data-invalid={Boolean(state.fieldErrors?.reasons)} key={reason} orientation="horizontal">
                    <FieldLabel className={cn("min-h-11 w-full cursor-pointer gap-3 rounded-lg border px-3 py-3 transition-colors duration-150 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring motion-reduce:transition-none", reasons.includes(reason) ? "border-primary/30 bg-primary/5" : "border-border hover:bg-secondary")} htmlFor={`${id}-${reason}`}>
                    <Checkbox aria-describedby={state.fieldErrors?.reasons ? `${id}-reasons-error` : undefined} aria-invalid={Boolean(state.fieldErrors?.reasons)} checked={reasons.includes(reason)} disabled={pending} id={`${id}-${reason}`} name="reasons" onCheckedChange={(checked) => { request.current.id = ""; setReasons((current) => checked === true ? [...current, reason] : current.filter((value) => value !== reason)); }} value={reason} />
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="text-xs font-normal">{label}</span>
                    </FieldLabel>
                  </Field>
                );
              })}
            </div>
            {state.fieldErrors?.reasons ? <p className="text-sm text-destructive" id={`${id}-reasons-error`}>{state.fieldErrors.reasons.join(" ")}</p> : null}
          </FieldSet>
        </FieldGroup>
        {state.status === "error" ? <div ref={errorSummary} tabIndex={-1}><Alert variant="destructive"><AlertDescription>{state.message}</AlertDescription></Alert></div> : null}
        {state.status === "success" ? <p className="flex items-center gap-2 text-xs text-success-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" role="status"><Check aria-hidden="true" className="size-4 shrink-0" />{state.message}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-[11px] text-muted-foreground">{reasons.length ? `${reasons.length} motivo${reasons.length === 1 ? "" : "s"} seleccionado${reasons.length === 1 ? "" : "s"}` : "Seleccione al menos un motivo"}</p>
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            <Button disabled={pending} onClick={(event) => { const disclosure = event.currentTarget.closest("details"); if (disclosure) { disclosure.open = false; disclosure.querySelector("summary")?.focus(); } }} size="sm" type="button" variant="ghost">Cancelar</Button>
            <Button disabled={pending} ref={submit} size="sm" type="submit"><Save aria-hidden="true" data-icon="inline-start" />{pending ? "Guardando..." : incident ? "Guardar corrección" : "Guardar incidencia"}</Button>
          </div>
        </div>
      </form>
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); submit.current?.focus(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{incident ? "¿Guardar la corrección?" : "¿Registrar la incidencia?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {incident ? "Se actualizarán el tipo y los motivos de esta incidencia del pedido. Los valores anteriores se conservarán en el historial y podrán consultarse." : "Se agregará una incidencia a este pedido, sin cambiar su etapa, pagos ni caja. Administración o Atención podrán corregirla, conservando el historial."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { confirmed.current = true; form.current?.requestSubmit(); }}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function OrderIncidents({ orderId, role, readOnly, incidents, error }: {
  orderId: string; role: Role; readOnly: boolean; incidents: OrderIncident[]; error: string | null;
}) {
  return (
    <section aria-labelledby="order-incidents-heading" className={cn(styles.panel, "relative @container/incidents rounded-2xl border border-border bg-card p-5 font-sans shadow-xs sm:p-6")}>
      <header className={cn(!readOnly && styles.header, "mb-5 flex min-h-9 items-center gap-3")}>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/40 text-warning-foreground"><MessageSquareWarning aria-hidden="true" className="size-4" /></span>
        <div className="min-w-0"><div className="flex items-baseline gap-2"><h2 className="text-base font-semibold" id="order-incidents-heading">Incidencias</h2><span className="text-xs font-normal tabular-nums text-muted-foreground">{incidents.length.toString().padStart(2, "0")}</span></div><p className="mt-0.5 text-xs text-muted-foreground">Fallas internas y reclamos del cliente</p></div>
      </header>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : incidents.length === 0 ? <div className={cn(styles.empty, "flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-5")}><Check aria-hidden="true" className="size-4 shrink-0 text-primary" /><div><p className="text-sm font-medium">Sin incidencias registradas</p><p className="mt-0.5 text-xs text-muted-foreground">El pedido no tiene fallas ni reclamos registrados.</p></div></div> : (
        <ol className="flex flex-col gap-4 divide-y divide-border">
          {incidents.map((incident) => (
            <li className={cn(styles.entry, "relative min-w-0 pt-4 first:pt-0")} key={incident.id}>
              <div className={cn(!readOnly && canCorrectIncident(role) && styles.entryHeader, "min-w-0")}>
                <h3 className="text-sm font-medium">{kindLabel(incident.kind)}</h3>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground"><time dateTime={incident.created_at}>{formatDateTime(incident.created_at)}</time>{incident.version > 1 ? " · Corregida" : null}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">{incident.reasons.map((reason) => {
                const Icon = reasonIcons[reason as IncidentReason] ?? AlertCircle;
                return <Badge className="gap-1.5 rounded-md border-0 px-2.5 py-1 text-xs font-normal" key={reason} variant="secondary"><Icon aria-hidden="true" className="size-3 shrink-0" />{reasonLabel(reason)}</Badge>;
              })}</div>
              {incident.version > 1 ? <details className="group/incident-history mt-3"><summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none [&::-webkit-details-marker]:hidden"><ChevronDown aria-hidden="true" className="size-3.5 transition-transform duration-150 group-open/incident-history:rotate-180 motion-reduce:transition-none" />Historial de correcciones</summary>
                <ol aria-label="Historial de correcciones" className="mt-2 flex flex-col gap-3 rounded-lg bg-secondary/40 p-3">
                  {[...incident.order_incident_events].sort((a, b) => a.version - b.version).map((event) => <li className="text-xs" key={event.version}>
                    <time className="font-mono text-[11px] text-muted-foreground" dateTime={event.occurred_at}>{formatDateTime(event.occurred_at)}</time>
                    <p className="mt-1 leading-relaxed">{event.version === 1 ? "Registro inicial" : `Corrección ${event.version - 1}`}: {kindLabel(event.kind)} — {event.reasons.map(reasonLabel).join(", ")}</p>
                  </li>)}
                </ol>
              </details> : null}
              {!readOnly && canCorrectIncident(role) ? <details className={cn(styles.correction, "group/incident-correction mt-3")} key={incident.version}><Button asChild size="sm" variant="ghost"><summary aria-controls={`${orderId}-incident-${incident.id}`} className="list-none [&::-webkit-details-marker]:hidden"><PencilLine aria-hidden="true" data-icon="inline-start" />Corregir incidencia</summary></Button><IncidentForm incident={incident} orderId={orderId} role={role} /></details> : null}
            </li>
          ))}
        </ol>
      )}
      {!readOnly ? <details className={cn(styles.creation, "group/incident-create")}><Button asChild size="sm" variant="outline"><summary aria-controls={`${orderId}-incident-new`} className="list-none [&::-webkit-details-marker]:hidden"><Plus aria-hidden="true" data-icon="inline-start" />Registrar incidencia<ChevronDown aria-hidden="true" className="transition-transform duration-150 group-open/incident-create:rotate-180 motion-reduce:transition-none" /></summary></Button><IncidentForm orderId={orderId} role={role} /></details> : null}
      {readOnly ? <p className="mt-4 text-sm text-muted-foreground">Este pedido no admite nuevas incidencias ni correcciones.</p> : null}
      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground"><AlertCircle aria-hidden="true" className="size-3 shrink-0" />Las incidencias no modifican la etapa ni los pagos.</p>
    </section>
  );
}
