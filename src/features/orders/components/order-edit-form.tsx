"use client";

import { AlertCircle, BadgeDollarSign, CalendarDays, CircleCheck, Info, UserRound, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMutationToast } from "@/hooks/use-mutation-toast";
import { formatArs, normalizeMoney, safeOrderBalance } from "@/lib/money/decimal";

import type { OrderDetail, OrderDetailCatalogs, OrderFinancials } from "../detail-queries";
import { orderLinesForEdit } from "../detail-format";
import { updateOrderAction, type UpdateOrderActionState } from "../detail-actions";
import { OrderLineEditor } from "./order-line-editor";

function errorsFor(state: UpdateOrderActionState, field: string) { return state.fieldErrors?.[field]?.map((message) => ({ message })); }
function safeMoney(value: string) { try { return value.trim() ? normalizeMoney(value) : null; } catch { return null; } }

function EditSection({ children, hint, icon: Icon, title }: { children: React.ReactNode; hint: string; icon: LucideIcon; title: string }) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
      <header className="mb-5 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon aria-hidden="true" className="size-4" /></span>
        <span className="min-w-0 pt-0.5">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{hint}</span>
        </span>
      </header>
      {children}
    </section>
  );
}

export function OrderEditForm({ action, catalogs, financials, order }: { action: typeof updateOrderAction; catalogs: OrderDetailCatalogs; financials: OrderFinancials | null; order: OrderDetail }) {
  const [state, formAction] = useActionState(action, {});
  const [totalAmount, setTotalAmount] = useState(financials?.totalAmount.toFixed(2) ?? "");
  const [depositAmount, setDepositAmount] = useState(financials?.depositAmount.toFixed(2) ?? "");
  const [depositPaid, setDepositPaid] = useState(financials?.depositPaid ?? false);
  const total = safeMoney(totalAmount);
  const deposit = safeMoney(depositAmount);
  const balance = total && deposit ? safeOrderBalance(total, deposit) : null;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyRef = useRef<HTMLInputElement>(null);
  useMutationToast(state);
  useEffect(() => {
    if (!state.toastId) return;
    if (state.status === "success") { if (idempotencyRef.current) idempotencyRef.current.value = ""; window.requestAnimationFrame(() => router.refresh()); }
    else window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [router, state.status, state.toastId]);

  return (
    <form action={formAction} className="@container/edit-form flex min-w-0 flex-col gap-6" noValidate onSubmit={() => { if (idempotencyRef.current && !idempotencyRef.current.value) idempotencyRef.current.value = crypto.randomUUID(); }} ref={formRef}>
      <input name="orderId" type="hidden" value={order.id} />
      <input name="idempotencyKey" ref={idempotencyRef} type="hidden" />
      <input name="expectedUpdatedAt" type="hidden" value={order.updatedAt} />
      <input name="orderDate" type="hidden" value={order.orderDate} />

      <EditSection hint="Datos de contacto del pedido." icon={UserRound} title="Identificación">
        <FieldGroup className="grid min-w-0 gap-4 @xl/edit-form:grid-cols-2 @4xl/edit-form:grid-cols-3">
          <Field data-invalid={Boolean(errorsFor(state, "clientName")?.length)}>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="edit-client-name">Cliente</FieldLabel>
            <Input className="rounded-xl bg-card shadow-none transition-colors focus-visible:bg-card" defaultValue={order.clientName ?? ""} id="edit-client-name" name="clientName" required />
            <FieldError errors={errorsFor(state, "clientName")} />
          </Field>
          <Field data-invalid={Boolean(errorsFor(state, "teamName")?.length)}>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="edit-team-name">Equipo</FieldLabel>
            <Input className="rounded-xl bg-card shadow-none transition-colors focus-visible:bg-card" defaultValue={order.teamName ?? ""} id="edit-team-name" name="teamName" required />
            <FieldError errors={errorsFor(state, "teamName")} />
          </Field>
          <Field data-invalid={Boolean(errorsFor(state, "phone")?.length)}>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="edit-phone">Teléfono</FieldLabel>
            <Input className="rounded-xl bg-card font-mono text-sm shadow-none transition-colors focus-visible:bg-card" defaultValue={order.phone ?? ""} id="edit-phone" inputMode="tel" name="phone" required />
            <FieldError errors={errorsFor(state, "phone")} />
          </Field>
        </FieldGroup>
        <FieldDescription className="mt-4 text-xs leading-5">Los históricos pueden aparecer vacíos, pero deben completarse para guardar.</FieldDescription>
      </EditSection>

      <EditSection hint="Compromiso de entrega del pedido." icon={CalendarDays} title="Fechas">
        <Field>
          <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="edit-promised-date">Fecha prometida de entrega</FieldLabel>
          <Input className="rounded-xl bg-card font-mono text-sm shadow-none transition-colors focus-visible:bg-card" defaultValue={order.promisedDeliveryDate} id="edit-promised-date" name="promisedDeliveryDate" required type="date" />
          <FieldError errors={errorsFor(state, "promisedDeliveryDate")} />
        </Field>
      </EditSection>

      <OrderLineEditor catalogs={catalogs} initialLines={orderLinesForEdit(order.lines)} />

      <EditSection hint="Indicaciones que no estén en las opciones." icon={Info} title="Descripción">
        <Field>
          <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="edit-description">Detalles adicionales</FieldLabel>
          <Textarea className="min-h-28 resize-none rounded-xl bg-card shadow-none transition-colors focus-visible:bg-card" defaultValue={order.description ?? ""} id="edit-description" name="description" rows={4} />
        </Field>
        <Field className="mt-4">
          <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="edit-change-note">Comentario del cambio <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
          <Textarea className="resize-none rounded-xl bg-card shadow-none transition-colors focus-visible:bg-card" id="edit-change-note" maxLength={300} name="changeNote" rows={2} />
          <FieldError errors={errorsFor(state, "changeNote")} />
        </Field>
      </EditSection>

      <EditSection hint="El pedido conserva un único importe total." icon={BadgeDollarSign} title="Importe total">
        <FieldDescription className="-mt-1 text-xs leading-5">No se cargan importes por renglón.</FieldDescription>
        <FieldGroup className="grid min-w-0 gap-4 @xl/edit-form:grid-cols-2">
          <Field>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="edit-total-amount">Total del pedido</FieldLabel>
            <Input className="h-10 rounded-xl bg-card font-mono text-sm shadow-none transition-colors focus-visible:bg-card md:h-10" id="edit-total-amount" inputMode="decimal" name="totalAmount" onChange={(event) => setTotalAmount(event.target.value)} required type="text" value={totalAmount} />
            <FieldError errors={errorsFor(state, "totalAmount")} />
          </Field>
          <Field>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="edit-deposit-amount">Monto de seña</FieldLabel>
            <Input className="h-10 rounded-xl bg-card font-mono text-sm shadow-none transition-colors focus-visible:bg-card md:h-10" id="edit-deposit-amount" inputMode="decimal" name="depositAmount" onChange={(event) => setDepositAmount(event.target.value)} required type="text" value={depositAmount} />
            <FieldError errors={errorsFor(state, "depositAmount")} />
          </Field>
        </FieldGroup>
        <label className="mt-4 flex min-h-10 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm">
          <input checked={depositPaid} className="size-4 accent-primary" name="depositPaid" onChange={(event) => setDepositPaid(event.target.checked)} type="checkbox" value="true" />
          Seña abonada
          <span className="text-xs text-muted-foreground">no genera movimiento de caja</span>
        </label>
        <p className="mt-3 font-mono text-xs text-muted-foreground">{total && deposit && balance ? `Total ${formatArs(total)} · Seña ${formatArs(deposit)} · Saldo ${formatArs(balance)}` : "Completá importes válidos para ver el resumen."}</p>
      </EditSection>

      {state.status === "error" ? (
        <Alert className="rounded-xl border-destructive/30 bg-card p-4 shadow-xs" variant="destructive">
          <AlertCircle aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-0.5"><AlertTitle className="text-sm">Revisá los datos del pedido</AlertTitle><AlertDescription className="text-xs text-destructive/80">{state.message}</AlertDescription></div>
        </Alert>
      ) : null}
      {state.status === "success" ? (
        <Alert className="rounded-xl border-success/30 bg-success/10 p-4 shadow-xs" variant="success">
          <CircleCheck aria-hidden="true" />
          <AlertDescription className="text-sm">{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end border-t border-border pt-5">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <SubmitButton className="min-h-11 rounded-xl px-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none md:min-h-10" onClick={(event) => { if (!formRef.current?.reportValidity()) { event.preventDefault(); event.stopPropagation(); } }} pendingLabel="Guardando..." type="button">Guardar cambios</SubmitButton>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar edición del pedido</AlertDialogTitle>
              <AlertDialogDescription>Se actualizarán los datos, renglones e importes de PED-{String(order.publicNumber).padStart(6, "0")}. El cambio quedará auditado.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => formRef.current?.requestSubmit()} type="button">Confirmar cambios</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </form>
  );
}
