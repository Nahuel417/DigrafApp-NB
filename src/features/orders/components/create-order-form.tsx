"use client";

import { AlertCircle, CircleCheck } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMutationToast } from "@/hooks/use-mutation-toast";
import { formatArs, normalizeMoney, safeOrderBalance } from "@/lib/money/decimal";

import { createOrderAction, type OrderActionState } from "../actions";
import type { OrderFormCatalogs } from "../queries";
import { OrderLineEditor } from "./order-line-editor";

function errorsFor(state: OrderActionState, field: string) {
  return state.fieldErrors?.[field]?.map((message) => ({ message }));
}

function safeMoney(value: string) {
  try { return value.trim() ? normalizeMoney(value) : null; } catch { return null; }
}

export function CreateOrderForm({ catalogs, initialOrderDate }: { catalogs: OrderFormCatalogs; initialOrderDate: string }) {
  const [state, formAction] = useActionState(createOrderAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [totalAmount, setTotalAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPaid, setDepositPaid] = useState(false);
  const total = safeMoney(totalAmount);
  const deposit = safeMoney(depositAmount);
  const balance = total && deposit ? safeOrderBalance(total, deposit) : null;
  useMutationToast(state);

  useEffect(() => {
    if (!state.toastId) return;
    if (state.status === "success") {
      window.requestAnimationFrame(() => resultRef.current?.focus());
    } else window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.status, state.toastId]);

  return <>
    {state.createdOrder ? <div aria-live="polite" className="rounded-xl border border-primary/30 bg-success p-5 text-success-foreground" ref={resultRef} tabIndex={-1}><div className="flex items-start gap-3"><CircleCheck aria-hidden="true" /><div><h2 className="font-semibold">PED-{String(state.createdOrder.publicNumber).padStart(6, "0")} creado</h2><p className="mt-1 text-sm">El pedido quedó en Pedido recibido.</p></div></div></div> : null}
    <form action={formAction} className="flex flex-col gap-7 rounded-xl border border-border bg-card p-5 shadow-xs" key={state.status === "success" && state.toastId ? state.toastId : "create-order-form"} noValidate ref={formRef}>
      <input defaultValue={crypto.randomUUID()} name="idempotencyKey" type="hidden" />
      <FieldSet><FieldLegend>Identificación</FieldLegend><FieldGroup className="grid gap-4 md:grid-cols-3">
        <Field data-invalid={Boolean(errorsFor(state, "clientName")?.length)}><FieldLabel htmlFor="order-client-name">Cliente</FieldLabel><Input aria-describedby="order-client-name-error" aria-invalid={Boolean(errorsFor(state, "clientName")?.length)} id="order-client-name" name="clientName" required /><FieldError errors={errorsFor(state, "clientName")} id="order-client-name-error" /></Field>
        <Field data-invalid={Boolean(errorsFor(state, "teamName")?.length)}><FieldLabel htmlFor="order-team-name">Equipo</FieldLabel><Input aria-describedby="order-team-name-error" aria-invalid={Boolean(errorsFor(state, "teamName")?.length)} id="order-team-name" name="teamName" required /><FieldError errors={errorsFor(state, "teamName")} id="order-team-name-error" /></Field>
        <Field data-invalid={Boolean(errorsFor(state, "phone")?.length)}><FieldLabel htmlFor="order-phone">Teléfono</FieldLabel><Input aria-describedby="order-phone-error" aria-invalid={Boolean(errorsFor(state, "phone")?.length)} id="order-phone" inputMode="tel" name="phone" required /><FieldError errors={errorsFor(state, "phone")} id="order-phone-error" /></Field>
      </FieldGroup></FieldSet>
      <FieldSet><FieldLegend>Fechas</FieldLegend><FieldGroup className="grid gap-4 md:grid-cols-2"><Field><FieldLabel htmlFor="order-date">Fecha del pedido</FieldLabel><Input defaultValue={initialOrderDate} id="order-date" name="orderDate" required type="date" /><FieldError errors={errorsFor(state, "orderDate")} /></Field><Field><FieldLabel htmlFor="order-promised-date">Fecha prometida de entrega</FieldLabel><Input id="order-promised-date" name="promisedDeliveryDate" required type="date" /><FieldError errors={errorsFor(state, "promisedDeliveryDate")} /></Field></FieldGroup></FieldSet>
      <OrderLineEditor catalogs={catalogs} />
      <FieldSet><FieldLegend>Descripción</FieldLegend><Field><FieldLabel htmlFor="order-description">Detalles adicionales <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel><Textarea id="order-description" name="description" rows={4} /><FieldDescription>Esta descripción acompaña la configuración estructurada.</FieldDescription></Field></FieldSet>
       <FieldSet><FieldLegend>Importe total</FieldLegend><FieldDescription>El pedido conserva un único importe total. No se cargan precios por renglón.</FieldDescription><FieldGroup className="grid gap-4 md:grid-cols-2"><Field data-invalid={Boolean(errorsFor(state, "totalAmount")?.length)}><FieldLabel htmlFor="order-total-amount">Total del pedido</FieldLabel><Input aria-describedby="order-total-error" aria-invalid={Boolean(errorsFor(state, "totalAmount")?.length)} id="order-total-amount" inputMode="decimal" name="totalAmount" onChange={(event) => setTotalAmount(event.target.value)} required type="text" value={totalAmount} /><FieldError errors={errorsFor(state, "totalAmount")} id="order-total-error" /></Field><Field data-invalid={Boolean(errorsFor(state, "depositAmount")?.length)}><FieldLabel htmlFor="order-deposit-amount">Monto de seña</FieldLabel><Input aria-describedby="order-deposit-error" aria-invalid={Boolean(errorsFor(state, "depositAmount")?.length)} id="order-deposit-amount" inputMode="decimal" name="depositAmount" onChange={(event) => setDepositAmount(event.target.value)} required type="text" value={depositAmount} /><FieldError errors={errorsFor(state, "depositAmount")} id="order-deposit-error" /></Field></FieldGroup><label className="flex min-h-11 items-center gap-3 text-sm"><input checked={depositPaid} name="depositPaid" onChange={(event) => setDepositPaid(event.target.checked)} type="checkbox" value="true" />Seña abonada <span className="text-muted-foreground">(no genera caja)</span></label><p className="font-mono text-sm text-muted-foreground">{total && deposit && balance ? `Total ${formatArs(total)} · Seña ${formatArs(deposit)} · Saldo ${formatArs(balance)}` : "Completá importes válidos para ver el resumen."}</p></FieldSet>
      {state.status === "error" ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>No se pudo crear el pedido</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert> : null}
      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Los datos se validan nuevamente en el servidor.</p><SubmitButton className="min-h-11 md:min-h-10" pendingLabel="Creando pedido">Crear pedido</SubmitButton></div>
    </form>
  </>;
}
