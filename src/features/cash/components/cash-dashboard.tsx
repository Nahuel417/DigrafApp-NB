"use client";

import { Ban, CircleCheck, CircleX, LockKeyhole, Pencil, RotateCcw, WalletCards } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useMutationToast } from "@/hooks/use-mutation-toast";
import { CASH_AMOUNT_PATTERN, canInsertCashAmount, cashAmountError, formatArs } from "@/lib/money/decimal";

import { closeCashDayAction, correctCashMovementAction, createCashMovementAction, reopenCashDayAction, setCashOpeningAction, voidCashMovementAction, type CashActionState } from "../actions";
import type { CashCategory, CashDaySummary, CashMovement, CashSummary, ClosedCashDay } from "../queries";

const initialState: CashActionState = {};
const unsupportedActions = ["category administration", "payments", "order-derived income"] as const;

export function buildCashDashboardViewModel(summary: Pick<CashSummary, "categories" | "currentBalance" | "openingBalance" | "movements" | "closedAt" | "closureKind" | "closingBalance">, canOperate: boolean, canClose = false) {
  const isClosed = Boolean(summary.closedAt);
  const writable = canOperate && !isClosed;
  return { balance: summary.currentBalance, opening: summary.openingBalance, movementState: summary.movements.length ? "populated" : "empty", actions: writable ? (["opening", "income", "expense", "edit", "void", ...(canClose ? ["close"] : [])] as const) : [], canOperate: writable, canClose: writable && canClose, isClosed, incomeCategory: null, expenseCategories: summary.categories, unsupportedActions };
}

export function idempotencyKeyAfterResult(currentKey: string, status: CashActionState["status"], confirmedKey: string) {
  return status === "success" && confirmedKey ? confirmedKey : currentKey;
}

export function resetMovementFormAfterResult(form: Pick<HTMLFormElement, "reset"> | null, status: CashActionState["status"]) {
  if (status === "success") form?.reset();
}

function errorsFor(state: CashActionState, field: string) { return state.fieldErrors?.[field]?.map((message) => ({ message })); }
function canInsertCashAmountText(input: HTMLInputElement, inserted: string) {
  return canInsertCashAmount(input.value, inserted, input.selectionStart, input.selectionEnd);
}
function preventInvalidCashInsertion(input: HTMLInputElement, inserted: string, event: { preventDefault: () => void }) {
  if (!canInsertCashAmountText(input, inserted)) event.preventDefault();
}
function preventInvalidCashBeforeInput(event: FormEvent<HTMLInputElement>) {
  const inputEvent = event.nativeEvent as InputEvent;
  if (inputEvent.inputType.startsWith("delete")) return;
  preventInvalidCashInsertion(event.currentTarget, inputEvent.data ?? "", event);
}
function preventInvalidCashKey(event: KeyboardEvent<HTMLInputElement>) {
  if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
  preventInvalidCashInsertion(event.currentTarget, event.key, event);
}
function preventInvalidCashPaste(event: ClipboardEvent<HTMLInputElement>) {
  preventInvalidCashInsertion(event.currentTarget, event.clipboardData.getData("text"), event);
}
function preventInvalidCashDrop(event: DragEvent<HTMLInputElement>) {
  preventInvalidCashInsertion(event.currentTarget, event.dataTransfer.getData("text"), event);
}
function setCashAmountValidity(event: FormEvent<HTMLInputElement>, allowZero: boolean) {
  event.currentTarget.setCustomValidity(cashAmountError(event.currentTarget.value, { allowZero }) ?? "");
}
function cashAmountInputProps(allowZero: boolean) {
  return {
    onBeforeInput: preventInvalidCashBeforeInput,
    onDrop: preventInvalidCashDrop,
    onInput: (event: FormEvent<HTMLInputElement>) => setCashAmountValidity(event, allowZero),
    onInvalid: (event: FormEvent<HTMLInputElement>) => setCashAmountValidity(event, allowZero),
    onKeyDown: preventInvalidCashKey,
    onPaste: preventInvalidCashPaste,
  };
}
function Feedback({ state }: { state: CashActionState }) {
  if (!state.message) return null;
  const success = state.status === "success";
  return <Alert aria-live="polite" variant={success ? "success" : "destructive"}>{success ? <CircleCheck aria-hidden="true" /> : <CircleX aria-hidden="true" />}<AlertDescription>{state.message}</AlertDescription></Alert>;
}
export function OpeningForm({ summary }: { summary: CashSummary }) {
  const [state, action] = useActionState(setCashOpeningAction, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const formRef = useRef<HTMLFormElement>(null);
  useMutationToast(state);
  useEffect(() => {
    if (!state.toastId) return;
    const form = formRef.current;
    if (state.status === "success") {
      const key = form?.elements.namedItem("idempotencyKey");
      if (key instanceof HTMLInputElement && state.resetKey) key.value = idempotencyKeyAfterResult(key.value, state.status, state.resetKey);
    } else form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state.resetKey, state.status, state.toastId]);
  const errors = errorsFor(state, "amount");
  return <form action={action} className="flex flex-col gap-4" ref={formRef}>
    <input name="expectedOpeningUpdatedAt" type="hidden" value={summary.openingUpdatedAt} readOnly /><input name="idempotencyKey" type="hidden" defaultValue={idempotencyKey} readOnly />
    <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end"><Field data-invalid={Boolean(errors?.length)}><FieldLabel htmlFor="cash-opening-amount">Saldo inicial</FieldLabel><Input {...cashAmountInputProps(true)} aria-describedby={errors?.length ? "cash-opening-amount-error" : undefined} aria-invalid={Boolean(errors?.length)} inputMode="decimal" id="cash-opening-amount" maxLength={15} name="amount" defaultValue={summary.openingBalance} pattern={CASH_AMOUNT_PATTERN} required type="text" /><FieldError errors={errors} id="cash-opening-amount-error" /></Field><SubmitButton className="w-fit" pendingLabel="Guardando saldo">Guardar apertura</SubmitButton></FieldGroup>
    <Feedback state={state} />
  </form>;
}

export function MovementForm({ categories, direction }: { categories: CashCategory[]; direction: "income" | "expense" }) {
  const [state, action] = useActionState(createCashMovementAction, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const formRef = useRef<HTMLFormElement>(null);
  const isIncome = direction === "income";
  const prefix = `cash-${direction}`;
  useMutationToast(state);
  useEffect(() => {
    if (!state.toastId) return;
    const form = formRef.current;
    if (state.status === "success") {
      const key = form?.elements.namedItem("idempotencyKey");
      const nextKey = idempotencyKeyAfterResult(key instanceof HTMLInputElement ? key.value : idempotencyKey, state.status, state.resetKey ?? crypto.randomUUID());
      resetMovementFormAfterResult(form, state.status);
      if (key instanceof HTMLInputElement) key.value = nextKey;
    } else form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [idempotencyKey, state.resetKey, state.status, state.toastId]);
  const amountErrors = errorsFor(state, "amount");
  const descriptionErrors = errorsFor(state, "description");
  const categoryErrors = errorsFor(state, "expenseCategoryId");
  return <form action={action} className="flex flex-col gap-4" ref={formRef}>
    <input name="direction" type="hidden" value={direction} readOnly /><input name="idempotencyKey" type="hidden" defaultValue={idempotencyKey} readOnly />
     <FieldGroup className="grid gap-4 md:grid-cols-2"><Field data-invalid={Boolean(amountErrors?.length)}><FieldLabel htmlFor={`${prefix}-amount`}>Importe</FieldLabel><Input {...cashAmountInputProps(false)} aria-describedby={amountErrors?.length ? `${prefix}-amount-error` : undefined} aria-invalid={Boolean(amountErrors?.length)} inputMode="decimal" id={`${prefix}-amount`} maxLength={15} name="amount" pattern={CASH_AMOUNT_PATTERN} required type="text" /><FieldError errors={amountErrors} id={`${prefix}-amount-error`} /></Field>{isIncome ? <Field data-invalid={Boolean(descriptionErrors?.length)}><FieldLabel htmlFor={`${prefix}-description`}>Concepto</FieldLabel><Input aria-describedby={descriptionErrors?.length ? `${prefix}-description-error` : undefined} aria-invalid={Boolean(descriptionErrors?.length)} id={`${prefix}-description`} name="description" required /><FieldError errors={descriptionErrors} id={`${prefix}-description-error`} /></Field> : <Field data-invalid={Boolean(categoryErrors?.length)}><FieldLabel htmlFor={`${prefix}-category`}>Categoría</FieldLabel><Select name="expenseCategoryId" defaultValue=""><SelectTrigger aria-describedby={categoryErrors?.length ? `${prefix}-category-error` : undefined} aria-invalid={Boolean(categoryErrors?.length)} id={`${prefix}-category`}><SelectValue placeholder="Elegí una categoría" /></SelectTrigger><SelectContent><SelectGroup>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldError errors={categoryErrors} id={`${prefix}-category-error`} /></Field>}</FieldGroup>
    {!isIncome ? <Field data-invalid={Boolean(descriptionErrors?.length)}><FieldLabel htmlFor={`${prefix}-description`}>Detalle <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel><Textarea aria-describedby={descriptionErrors?.length ? `${prefix}-description-error` : undefined} aria-invalid={Boolean(descriptionErrors?.length)} id={`${prefix}-description`} name="description" rows={2} /><FieldError errors={descriptionErrors} id={`${prefix}-description-error`} /></Field> : null}
    <Feedback state={state} /><SubmitButton className="self-start" pendingLabel={isIncome ? "Registrando ingreso" : "Registrando egreso"}>{isIncome ? "Registrar ingreso" : "Registrar egreso"}</SubmitButton>
  </form>;
}

function MovementCorrectionDialog({ movement, categories }: { movement: CashMovement; categories: CashCategory[] }) {
  const [state, action] = useActionState(correctCashMovementAction, initialState);
  const [open, setOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const formId = `cash-correction-${movement.id}`;
  useMutationToast(state);
  useEffect(() => { if (state.toastId && state.status === "success") queueMicrotask(() => { setOpen(false); setIdempotencyKey(state.resetKey ?? crypto.randomUUID()); }); }, [state.resetKey, state.status, state.toastId]);
  return <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger asChild><Button size="sm" variant="outline"><Pencil data-icon="inline-start" />Editar</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar corrección</AlertDialogTitle><AlertDialogDescription>Se conservará el estado anterior y se registrará tu usuario y la hora. La corrección solo aplica mientras la caja esté abierta.</AlertDialogDescription></AlertDialogHeader><form action={action} className="flex flex-col gap-4" id={formId}><input name="movementId" type="hidden" value={movement.id} readOnly /><input name="idempotencyKey" type="hidden" value={idempotencyKey} readOnly /><FieldGroup className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor={`${formId}-direction`}>Tipo</FieldLabel><select className="h-11 rounded-md border border-input bg-background px-3 text-sm" defaultValue={movement.direction} id={`${formId}-direction`} name="direction"><option value="income">Ingreso</option><option value="expense">Egreso</option></select></Field><Field><FieldLabel htmlFor={`${formId}-amount`}>Importe</FieldLabel><Input {...cashAmountInputProps(false)} defaultValue={movement.amount} id={`${formId}-amount`} inputMode="decimal" maxLength={15} name="amount" pattern={CASH_AMOUNT_PATTERN} required type="text" /></Field></FieldGroup><Field><FieldLabel htmlFor={`${formId}-description`}>Detalle</FieldLabel><Textarea defaultValue={movement.description ?? ""} id={`${formId}-description`} name="description" rows={2} /></Field><Field><FieldLabel htmlFor={`${formId}-category`}>Categoría de egreso</FieldLabel><select className="h-11 rounded-md border border-input bg-background px-3 text-sm" defaultValue={movement.expenseCategoryId ?? ""} id={`${formId}-category`} name="expenseCategoryId"><option value="">Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field><Feedback state={state} /></form><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction asChild><Button form={formId} type="submit">Confirmar corrección</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function MovementVoidDialog({ movement, requiresReason }: { movement: CashMovement; requiresReason: boolean }) {
  const [state, action] = useActionState(voidCashMovementAction, initialState);
  const [open, setOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const formId = `cash-void-${movement.id}`;
  useMutationToast(state);
  useEffect(() => { if (state.toastId && state.status === "success") queueMicrotask(() => { setOpen(false); setIdempotencyKey(state.resetKey ?? crypto.randomUUID()); }); }, [state.resetKey, state.status, state.toastId]);
  return <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger asChild><Button size="sm" variant="destructive"><Ban data-icon="inline-start" />Anular</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar anulación</AlertDialogTitle><AlertDialogDescription>El movimiento quedará retenido como anulado y dejará de afectar el saldo. Esta acción no se puede revertir.</AlertDialogDescription></AlertDialogHeader><form action={action} className="flex flex-col gap-4" id={formId}><input name="movementId" type="hidden" value={movement.id} readOnly /><input name="idempotencyKey" type="hidden" value={idempotencyKey} readOnly /><Field><FieldLabel htmlFor={`${formId}-reason`}>Motivo {requiresReason ? null : <span className="font-normal text-muted-foreground">(opcional)</span>}</FieldLabel><Textarea aria-required={requiresReason} id={`${formId}-reason`} minLength={requiresReason ? 2 : undefined} name="reason" required={requiresReason} rows={3} /></Field><Feedback state={state} /></form><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction asChild><Button form={formId} type="submit" variant="destructive">Confirmar anulación</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function CloseCashDayDialog({ cashDayId }: { cashDayId: string }) {
  const [state, action] = useActionState(closeCashDayAction, initialState);
  const [open, setOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const formId = `cash-close-${cashDayId}`;
  useMutationToast(state);
  useEffect(() => { if (state.toastId && state.status === "success") queueMicrotask(() => { setOpen(false); setIdempotencyKey(state.resetKey ?? crypto.randomUUID()); }); }, [state.resetKey, state.status, state.toastId]);
  return <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger asChild><Button variant="destructive"><LockKeyhole data-icon="inline-start" />Cerrar caja</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar cierre de caja</AlertDialogTitle><AlertDialogDescription>La caja quedará bloqueada para nuevas aperturas, movimientos, correcciones y anulaciones. La consulta histórica seguirá disponible.</AlertDialogDescription></AlertDialogHeader><form action={action} id={formId}><input name="cashDayId" type="hidden" value={cashDayId} readOnly /><input name="idempotencyKey" type="hidden" value={idempotencyKey} readOnly /><Feedback state={state} /></form><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction asChild><Button form={formId} type="submit" variant="destructive">Confirmar cierre</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function ReopenCashDayDialog({ cashDayId }: { cashDayId: string }) {
  const [state, action] = useActionState(reopenCashDayAction, initialState);
  const [open, setOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const formId = `cash-reopen-${cashDayId}`;
  useMutationToast(state);
  useEffect(() => { if (state.toastId && state.status === "success") queueMicrotask(() => { setOpen(false); setIdempotencyKey(state.resetKey ?? crypto.randomUUID()); }); }, [state.resetKey, state.status, state.toastId]);
  const reasonErrors = errorsFor(state, "reason");
  return <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger asChild><Button variant="outline"><RotateCcw data-icon="inline-start" />Reabrir caja</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar reapertura</AlertDialogTitle><AlertDialogDescription>La caja se abrirá para corregir movimientos del mismo día. El motivo y tu usuario quedarán registrados en el historial.</AlertDialogDescription></AlertDialogHeader><form action={action} className="flex flex-col gap-4" id={formId}><input name="cashDayId" type="hidden" value={cashDayId} readOnly /><input name="idempotencyKey" type="hidden" value={idempotencyKey} readOnly /><Field data-invalid={Boolean(reasonErrors?.length)}><FieldLabel htmlFor={`${formId}-reason`}>Motivo</FieldLabel><Textarea aria-describedby={reasonErrors?.length ? `${formId}-reason-error` : undefined} aria-invalid={Boolean(reasonErrors?.length)} id={`${formId}-reason`} maxLength={500} minLength={2} name="reason" required rows={4} /><FieldError errors={reasonErrors} id={`${formId}-reason-error`} /></Field><Feedback state={state} /></form><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction asChild><Button form={formId} type="submit">Confirmar reapertura</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function MovementList({ movements, categories, writable, requiresVoidReason }: { movements: CashMovement[]; categories: CashCategory[]; writable: boolean; requiresVoidReason: boolean }) {
  if (!movements.length) return <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">Todavía no hay movimientos registrados para el día de hoy.</div>;
  return <Table><TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Detalle</TableHead><TableHead>Categoría</TableHead><TableHead>Registró</TableHead><TableHead className="text-right">Importe</TableHead>{writable ? <TableHead className="text-right">Acciones</TableHead> : null}</TableRow></TableHeader><TableBody>{movements.map((movement) => <TableRow key={movement.id}><TableCell><Badge variant={movement.direction === "income" ? "active" : "inactive"}>{movement.direction === "income" ? "Ingreso" : "Egreso"}</Badge></TableCell><TableCell>{movement.description ?? "Sin detalle"}</TableCell><TableCell>{movement.expenseCategoryName ?? "—"}</TableCell><TableCell><span>{movement.actorDisplayName}</span><time className="block text-xs text-muted-foreground" dateTime={movement.createdAt}>{movement.createdAt}</time></TableCell><TableCell className="text-right font-mono tabular-nums">{movement.direction === "income" ? "+" : "−"}{formatArs(movement.amount)}</TableCell>{writable ? <TableCell><div className="flex justify-end gap-2"><MovementCorrectionDialog categories={categories} movement={movement} /><MovementVoidDialog movement={movement} requiresReason={requiresVoidReason} /></div></TableCell> : null}</TableRow>)}</TableBody></Table>;
}

function ClosedDaySelector({ closedDays }: { closedDays: ClosedCashDay[] }) {
  if (!closedDays.length) return null;
  return <form className="flex flex-wrap items-end gap-3" method="get"><Field><FieldLabel htmlFor="cash-closed-day">Consultar caja cerrada</FieldLabel><Select defaultValue="" name="cashDay"><SelectTrigger className="min-w-56" id="cash-closed-day"><SelectValue placeholder="Elegí un día" /></SelectTrigger><SelectContent><SelectGroup>{closedDays.map((day) => <SelectItem key={day.cashDayId} value={day.cashDayId}>{day.operationalDate} · {day.closureKind}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Button variant="outline" type="submit">Consultar día</Button></form>;
}

function HistoryPanel({ history }: { history: CashDaySummary }) {
  return <section aria-labelledby="cash-history-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold" id="cash-history-title">Consulta histórica</h2><p className="mt-1 text-sm text-muted-foreground">Día {history.operationalDate}. Esta vista es de solo lectura.</p></div><Badge variant="inactive">Cerrada</Badge></div><div className="mt-5 grid gap-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Saldo inicial</p><p className="font-mono tabular-nums">{formatArs(history.openingBalance)}</p></div><div><p className="text-xs text-muted-foreground">Saldo final</p><p className="font-mono tabular-nums">{formatArs(history.closingBalance ?? "0.00")}</p></div><div><p className="text-xs text-muted-foreground">Cierre</p><p className="font-mono tabular-nums">{history.closedAt ?? "—"}</p></div></div><div className="mt-5"><Table><TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Detalle</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader><TableBody>{history.movements.map((movement) => <TableRow key={movement.id}><TableCell>{movement.direction === "income" ? "Ingreso" : "Egreso"}</TableCell><TableCell>{movement.description ?? "Sin detalle"}</TableCell><TableCell className="text-right font-mono tabular-nums">{movement.direction === "income" ? "+" : "−"}{formatArs(movement.amount)}</TableCell></TableRow>)}</TableBody></Table>{!history.movements.length ? <p className="mt-3 text-sm text-muted-foreground">No hubo movimientos efectivos en este día.</p> : null}</div><div className="mt-5"><h3 className="text-sm font-semibold">Historial de correcciones y anulaciones</h3>{history.events.length ? <ul className="mt-2 flex flex-col gap-2 text-sm">{history.events.map((event) => <li className="rounded-md border border-border p-3" key={event.id}>{event.eventType === "correction" ? "Corrección" : "Anulación"} · {event.reason ?? "Sin motivo indicado"} · {event.createdAt}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No hay eventos de corrección o anulación.</p>}</div></section>;
}

function HistoryAuditPanel({ history, canReopen }: { history: CashDaySummary; canReopen: boolean }) {
  return <section aria-labelledby="cash-history-audit-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold" id="cash-history-audit-title">Trazabilidad del día cerrado</h2><p className="mt-1 text-sm text-muted-foreground">Movimientos, cierre y reaperturas muestran actor y hora del servidor.</p></div>{canReopen ? <ReopenCashDayDialog cashDayId={history.cashDayId} /> : null}</div><div className="mt-5 flex flex-col gap-4"><div><h3 className="text-sm font-semibold">Movimientos</h3>{history.movements.length ? <ul className="mt-2 flex flex-col gap-2 text-sm">{history.movements.map((movement) => <li className="rounded-md border border-border p-3" key={movement.id}><span>{movement.actorDisplayName} · {movement.description ?? "Sin detalle"}</span><time className="block text-xs text-muted-foreground" dateTime={movement.createdAt}>{movement.createdAt}</time></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No hubo movimientos efectivos en este día.</p>}</div><div><h3 className="text-sm font-semibold">Ciclos de cierre</h3>{history.lifecycleEvents.length ? <ul className="mt-2 flex flex-col gap-2 text-sm">{history.lifecycleEvents.map((event) => <li className="rounded-md border border-border p-3" key={event.id}><span>{event.eventType === "reopen" ? "Reapertura" : `Cierre ${event.closureKind ?? ""}`} · {event.actorDisplayName}{event.reason ? ` · ${event.reason}` : ""}</span><time className="block text-xs text-muted-foreground" dateTime={event.createdAt}>{event.createdAt}</time></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No hay ciclos auditados.</p>}</div></div></section>;
}

export function CashDashboard({ canOperate, canClose = false, canReopen = false, requiresVoidReason = false, summary, closedDays = [], selectedHistory = null }: { canOperate: boolean; canClose?: boolean; canReopen?: boolean; requiresVoidReason?: boolean; summary: CashSummary; closedDays?: ClosedCashDay[]; selectedHistory?: CashDaySummary | null }) {
  const view = buildCashDashboardViewModel(summary, canOperate, canClose);
  return <div className="flex flex-col gap-6">
    <section aria-labelledby="cash-balance-title" className="overflow-hidden rounded-xl border border-border bg-card shadow-xs"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-6"><div><p className="text-xs font-semibold uppercase tracking-label text-muted-foreground">Caja del día</p><h2 className="mt-1 text-3xl font-semibold tracking-display tabular-nums sm:text-4xl" id="cash-balance-title">{formatArs(view.balance)}</h2><p className="mt-2 text-sm text-muted-foreground">{view.isClosed ? "Caja cerrada: no admite nuevas modificaciones." : "Saldo derivado de apertura, ingresos y egresos de hoy."}</p></div><div className="flex items-center gap-3"><Badge variant={view.isClosed ? "inactive" : "active"}>{view.isClosed ? <LockKeyhole aria-hidden="true" data-icon="inline-start" /> : <WalletCards aria-hidden="true" data-icon="inline-start" />}{view.isClosed ? "Caja cerrada" : "Abierta"}</Badge>{view.canClose ? <CloseCashDayDialog cashDayId={summary.cashDayId} /> : null}</div></div><div className="grid gap-4 p-5 sm:grid-cols-2 sm:px-6"><div className="rounded-lg border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Saldo inicial</p><p className="mt-1 font-mono text-lg font-semibold tabular-nums">{formatArs(view.opening)}</p></div><div className="rounded-lg border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Día operativo</p><p className="mt-1 font-mono text-lg font-semibold tabular-nums">{summary.operationalDate}</p></div></div></section>
    <ClosedDaySelector closedDays={closedDays} />
    {view.canOperate ? <><section aria-labelledby="cash-opening-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><h2 className="text-base font-semibold" id="cash-opening-title">Apertura de caja</h2><p className="mt-1 text-sm text-muted-foreground">Podés ajustar el saldo inicial; cada cambio queda auditado.</p><div className="mt-5"><OpeningForm summary={summary} /></div></section><div className="grid gap-6 xl:grid-cols-2"><section aria-labelledby="cash-income-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><h2 className="text-base font-semibold" id="cash-income-title">Registrar ingreso</h2><p className="mt-1 text-sm text-muted-foreground">Ingresá un concepto claro. Los ingresos no llevan categoría.</p><div className="mt-5"><MovementForm direction="income" categories={[]} /></div></section><section aria-labelledby="cash-expense-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><h2 className="text-base font-semibold" id="cash-expense-title">Registrar egreso</h2><p className="mt-1 text-sm text-muted-foreground">Elegí una categoría activa de las disponibles.</p><div className="mt-5"><MovementForm direction="expense" categories={view.expenseCategories} /></div></section></div></> : null}
    <section aria-labelledby="cash-movements-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold" id="cash-movements-title">Movimientos de hoy</h2><p className="mt-1 text-sm text-muted-foreground">{view.isClosed ? "Registros efectivos del día cerrado." : "Solo se muestran registros del día operativo actual."}</p></div><Badge variant="outline">{summary.movements.length} {summary.movements.length === 1 ? "movimiento" : "movimientos"}</Badge></div><div className="mt-5"><MovementList categories={view.expenseCategories} movements={summary.movements} requiresVoidReason={requiresVoidReason} writable={view.canOperate} /></div></section>
    {selectedHistory ? <><HistoryPanel history={selectedHistory} /><HistoryAuditPanel canReopen={canReopen} history={selectedHistory} /></> : null}
  </div>;
}
