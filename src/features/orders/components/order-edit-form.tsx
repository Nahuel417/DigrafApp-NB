"use client";

import { AlertCircle, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
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

  return <form action={formAction} className="flex flex-col gap-6" noValidate onSubmit={() => { if (idempotencyRef.current && !idempotencyRef.current.value) idempotencyRef.current.value = crypto.randomUUID(); }} ref={formRef}>
    <input name="orderId" type="hidden" value={order.id} /><input name="idempotencyKey" ref={idempotencyRef} type="hidden" /><input name="expectedUpdatedAt" type="hidden" value={order.updatedAt} /><input name="orderDate" type="hidden" value={order.orderDate} />
    <FieldSet><FieldLegend>Identificación</FieldLegend><FieldGroup className="grid gap-4 md:grid-cols-3"><Field data-invalid={Boolean(errorsFor(state, "clientName")?.length)}><FieldLabel htmlFor="edit-client-name">Cliente</FieldLabel><Input defaultValue={order.clientName ?? ""} id="edit-client-name" name="clientName" required /><FieldError errors={errorsFor(state, "clientName")} /></Field><Field data-invalid={Boolean(errorsFor(state, "teamName")?.length)}><FieldLabel htmlFor="edit-team-name">Equipo</FieldLabel><Input defaultValue={order.teamName ?? ""} id="edit-team-name" name="teamName" required /><FieldError errors={errorsFor(state, "teamName")} /></Field><Field data-invalid={Boolean(errorsFor(state, "phone")?.length)}><FieldLabel htmlFor="edit-phone">Teléfono</FieldLabel><Input defaultValue={order.phone ?? ""} id="edit-phone" inputMode="tel" name="phone" required /><FieldError errors={errorsFor(state, "phone")} /></Field></FieldGroup><FieldDescription>Los históricos pueden aparecer vacíos, pero deben completarse para guardar.</FieldDescription></FieldSet>
    <FieldSet><FieldLegend>Fechas</FieldLegend><Field><FieldLabel htmlFor="edit-promised-date">Fecha prometida de entrega</FieldLabel><Input defaultValue={order.promisedDeliveryDate} id="edit-promised-date" name="promisedDeliveryDate" required type="date" /><FieldError errors={errorsFor(state, "promisedDeliveryDate")} /></Field></FieldSet>
    <OrderLineEditor catalogs={catalogs} initialLines={orderLinesForEdit(order.lines)} />
    <FieldSet><FieldLegend>Descripción</FieldLegend><Field><FieldLabel htmlFor="edit-description">Detalles adicionales</FieldLabel><Textarea defaultValue={order.description ?? ""} id="edit-description" name="description" rows={4} /></Field><Field><FieldLabel htmlFor="edit-change-note">Comentario del cambio <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel><Textarea id="edit-change-note" maxLength={300} name="changeNote" rows={2} /><FieldError errors={errorsFor(state, "changeNote")} /></Field></FieldSet>
     <FieldSet><FieldLegend>Importe total</FieldLegend><FieldDescription>No se cargan importes por renglón.</FieldDescription><FieldGroup className="grid gap-4 md:grid-cols-2"><Field><FieldLabel htmlFor="edit-total-amount">Total del pedido</FieldLabel><Input id="edit-total-amount" inputMode="decimal" name="totalAmount" onChange={(event) => setTotalAmount(event.target.value)} required type="text" value={totalAmount} /><FieldError errors={errorsFor(state, "totalAmount")} /></Field><Field><FieldLabel htmlFor="edit-deposit-amount">Monto de seña</FieldLabel><Input id="edit-deposit-amount" inputMode="decimal" name="depositAmount" onChange={(event) => setDepositAmount(event.target.value)} required type="text" value={depositAmount} /><FieldError errors={errorsFor(state, "depositAmount")} /></Field></FieldGroup><label className="flex min-h-11 items-center gap-3 text-sm"><input checked={depositPaid} name="depositPaid" onChange={(event) => setDepositPaid(event.target.checked)} type="checkbox" value="true" />Seña abonada <span className="text-muted-foreground">(no genera caja)</span></label><p className="font-mono text-sm text-muted-foreground">{total && deposit && balance ? `Total ${formatArs(total)} · Seña ${formatArs(deposit)} · Saldo ${formatArs(balance)}` : "Completá importes válidos para ver el resumen."}</p></FieldSet>
    {state.status === "error" ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>No se pudo actualizar el pedido</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert> : null}{state.status === "success" ? <Alert variant="success"><CircleCheck aria-hidden="true" /><AlertDescription>{state.message}</AlertDescription></Alert> : null}
    <div className="flex justify-end"><AlertDialog><AlertDialogTrigger asChild><SubmitButton className="min-h-11 md:min-h-10" onClick={(event) => { if (!formRef.current?.reportValidity()) { event.preventDefault(); event.stopPropagation(); } }} pendingLabel="Guardando..." type="button">Guardar cambios</SubmitButton></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar edición del pedido</AlertDialogTitle><AlertDialogDescription>Se actualizarán los datos, renglones e importes de PED-{String(order.publicNumber).padStart(6, "0")}. El cambio quedará auditado.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => formRef.current?.requestSubmit()} type="button">Confirmar cambios</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
  </form>;
}
