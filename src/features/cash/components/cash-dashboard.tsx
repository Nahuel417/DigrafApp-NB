"use client";

import Link from "next/link";
import { Ban, CircleCheck, CircleX, LockKeyhole, Pencil, RotateCcw, WalletCards } from "lucide-react";
import { es } from "react-day-picker/locale";
import { useActionState, useEffect, useRef, useState, type ClipboardEvent, type ComponentProps, type DragEvent, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArchivePagination, buildArchiveHref } from "@/components/ui/archive-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useMutationToast } from "@/hooks/use-mutation-toast";
import { CASH_AMOUNT_PATTERN, canInsertCashAmount, cashAmountError, formatArs } from "@/lib/money/decimal";
import { cn } from "@/lib/utils";

import { closeCashDayAction, correctCashMovementAction, createCashMovementAction, reopenCashDayAction, setCashOpeningAction, voidCashMovementAction, type CashActionState } from "../actions";
import type { CashCategory, CashDaySummary, CashMovement, CashSummary, ClosedCashDay } from "../queries";

const initialState: CashActionState = {};
const emptyCashCategoryValue = "__empty__";
const cashDateTimeFormatter = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Cordoba" });
const cashTimeFormatter = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Cordoba" });
const cashMonthFormatter = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });
const CASH_PAGE_SIZE = 10;

export type CashTab = "income" | "expense";
export type CashView = "daily" | "movements";

function dateFromOperationalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function operationalDateFromDate(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

export function formatCashDateTime(value: string) {
  return cashDateTimeFormatter.format(new Date(value));
}

export function formatCashTime(value: string) {
  return cashTimeFormatter.format(new Date(value));
}

export const CASH_REOPEN_REASON_REQUIRED_MESSAGE = "Ingresá un motivo para reabrir la caja";
export function validateReopenReason(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 500) return CASH_REOPEN_REASON_REQUIRED_MESSAGE;
  return null;
}
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
function preventInvalidCashInsertion(input: HTMLInputElement, inserted: string, event: { preventDefault: () => void }, onRejected?: () => void) {
  if (!canInsertCashAmountText(input, inserted)) {
    event.preventDefault();
    onRejected?.();
  }
}
export function preventInvalidCashBeforeInput(event: FormEvent<HTMLInputElement>, onRejected?: () => void) {
  const inputEvent = event.nativeEvent as InputEvent;
  if (inputEvent.inputType?.startsWith("delete")) return;
  preventInvalidCashInsertion(event.currentTarget, inputEvent.data ?? "", event, onRejected);
}
function preventInvalidCashKey(event: KeyboardEvent<HTMLInputElement>, onRejected?: () => void) {
  if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
  preventInvalidCashInsertion(event.currentTarget, event.key, event, onRejected);
}
function preventInvalidCashPaste(event: ClipboardEvent<HTMLInputElement>, onRejected?: () => void) {
  preventInvalidCashInsertion(event.currentTarget, event.clipboardData.getData("text"), event, onRejected);
}
function preventInvalidCashDrop(event: DragEvent<HTMLInputElement>, onRejected?: () => void) {
  preventInvalidCashInsertion(event.currentTarget, event.dataTransfer.getData("text"), event, onRejected);
}
function setCashAmountValidity(input: HTMLInputElement, allowZero: boolean, setClientAmountError?: (error: string | null) => void) {
  const error = cashAmountError(input.value, { allowZero });
  input.setCustomValidity(error ?? "");
  setClientAmountError?.(error);
}
function cashAmountInputProps(allowZero: boolean, setClientAmountError?: (error: string | null) => void) {
  const updateValidity = (input: HTMLInputElement) => setCashAmountValidity(input, allowZero, setClientAmountError);
  const reportRejectedInsertion = (input: HTMLInputElement) => {
    updateValidity(input);
    input.focus();
  };
  return {
    onBeforeInput: (event: FormEvent<HTMLInputElement>) => preventInvalidCashBeforeInput(event, () => reportRejectedInsertion(event.currentTarget)),
    onDrop: (event: DragEvent<HTMLInputElement>) => preventInvalidCashDrop(event, () => reportRejectedInsertion(event.currentTarget)),
    onInput: (event: FormEvent<HTMLInputElement>) => updateValidity(event.currentTarget),
    onInvalid: (event: FormEvent<HTMLInputElement>) => updateValidity(event.currentTarget),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => preventInvalidCashKey(event, () => reportRejectedInsertion(event.currentTarget)),
    onPaste: (event: ClipboardEvent<HTMLInputElement>) => preventInvalidCashPaste(event, () => reportRejectedInsertion(event.currentTarget)),
  };
}
function Feedback({ state }: { state: CashActionState }) {
  if (!state.message) return null;
  const success = state.status === "success";
  return <Alert aria-live="polite" variant={success ? "success" : "destructive"}>{success ? <CircleCheck aria-hidden="true" /> : <CircleX aria-hidden="true" />}<AlertDescription>{state.message}</AlertDescription></Alert>;
}
export function OpeningForm({ summary }: { summary: CashSummary }) {
  const [state, action] = useActionState(setCashOpeningAction, initialState);
  const [clientAmountError, setClientAmountError] = useState<string | null>(null);
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
  const errors = clientAmountError ? [{ message: clientAmountError }, ...(errorsFor(state, "amount") ?? [])] : errorsFor(state, "amount");
  return <form action={action} className="flex flex-col gap-4" ref={formRef}>
    <input name="expectedOpeningUpdatedAt" type="hidden" value={summary.openingUpdatedAt} readOnly /><input name="idempotencyKey" type="hidden" defaultValue={idempotencyKey} readOnly />
    <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end"><Field data-invalid={Boolean(errors?.length)}><FieldLabel htmlFor="cash-opening-amount">Saldo inicial</FieldLabel><Input {...cashAmountInputProps(true, setClientAmountError)} aria-describedby={errors?.length ? "cash-opening-amount-error" : undefined} aria-invalid={Boolean(errors?.length)} inputMode="decimal" id="cash-opening-amount" maxLength={15} name="amount" defaultValue={summary.openingBalance} pattern={CASH_AMOUNT_PATTERN} required type="text" /><FieldError errors={errors} id="cash-opening-amount-error" /></Field><SubmitButton className="w-fit" pendingLabel="Guardando saldo">Guardar apertura</SubmitButton></FieldGroup>
    <Feedback state={state} />
  </form>;
}

export function MovementForm({ categories, direction }: { categories: CashCategory[]; direction: "income" | "expense" }) {
  const [state, action] = useActionState(createCashMovementAction, initialState);
  const [clientAmountError, setClientAmountError] = useState<string | null>(null);
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
  const amountErrors = clientAmountError ? [{ message: clientAmountError }, ...(errorsFor(state, "amount") ?? [])] : errorsFor(state, "amount");
  const descriptionErrors = errorsFor(state, "description");
  const categoryErrors = errorsFor(state, "expenseCategoryId");
  return <form action={action} className="flex flex-col gap-4" ref={formRef}>
    <input name="direction" type="hidden" value={direction} readOnly /><input name="idempotencyKey" type="hidden" defaultValue={idempotencyKey} readOnly />
     <FieldGroup className="grid gap-4 md:grid-cols-2"><Field data-invalid={Boolean(amountErrors?.length)}><FieldLabel htmlFor={`${prefix}-amount`}>Importe</FieldLabel><Input {...cashAmountInputProps(false, setClientAmountError)} aria-describedby={amountErrors?.length ? `${prefix}-amount-error` : undefined} aria-invalid={Boolean(amountErrors?.length)} inputMode="decimal" id={`${prefix}-amount`} maxLength={15} name="amount" pattern={CASH_AMOUNT_PATTERN} required type="text" /><FieldError errors={amountErrors} id={`${prefix}-amount-error`} /></Field>{isIncome ? <Field data-invalid={Boolean(descriptionErrors?.length)}><FieldLabel htmlFor={`${prefix}-description`}>Concepto</FieldLabel><Input aria-describedby={descriptionErrors?.length ? `${prefix}-description-error` : undefined} aria-invalid={Boolean(descriptionErrors?.length)} id={`${prefix}-description`} name="description" required /><FieldError errors={descriptionErrors} id={`${prefix}-description-error`} /></Field> : <Field data-invalid={Boolean(categoryErrors?.length)}><FieldLabel htmlFor={`${prefix}-category`}>Categoría</FieldLabel><Select name="expenseCategoryId" defaultValue=""><SelectTrigger aria-describedby={categoryErrors?.length ? `${prefix}-category-error` : undefined} aria-invalid={Boolean(categoryErrors?.length)} id={`${prefix}-category`}><SelectValue placeholder="Elegí una categoría" /></SelectTrigger><SelectContent><SelectGroup>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldError errors={categoryErrors} id={`${prefix}-category-error`} /></Field>}</FieldGroup>
    {!isIncome ? <Field data-invalid={Boolean(descriptionErrors?.length)}><FieldLabel htmlFor={`${prefix}-description`}>Detalle <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel><Textarea aria-describedby={descriptionErrors?.length ? `${prefix}-description-error` : undefined} aria-invalid={Boolean(descriptionErrors?.length)} id={`${prefix}-description`} name="description" rows={2} /><FieldError errors={descriptionErrors} id={`${prefix}-description-error`} /></Field> : null}
    <Feedback state={state} /><SubmitButton className="self-start" pendingLabel={isIncome ? "Registrando ingreso" : "Registrando egreso"}>{isIncome ? "Registrar ingreso" : "Registrar egreso"}</SubmitButton>
  </form>;
}

function MovementCorrectionDialog({ movement, categories }: { movement: CashMovement; categories: CashCategory[] }) {
  const [state, action] = useActionState(correctCashMovementAction, initialState);
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(movement.expenseCategoryId ?? "");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const formId = `cash-correction-${movement.id}`;
  useMutationToast(state);
  useEffect(() => { if (state.toastId && state.status === "success") queueMicrotask(() => { setOpen(false); setIdempotencyKey(state.resetKey ?? crypto.randomUUID()); }); }, [state.resetKey, state.status, state.toastId]);
  return <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger asChild><Button size="sm" variant="outline"><Pencil data-icon="inline-start" />Editar</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar corrección</AlertDialogTitle><AlertDialogDescription>Se conservará el estado anterior y se registrará tu usuario y la hora. La corrección solo aplica mientras la caja esté abierta.</AlertDialogDescription></AlertDialogHeader><form action={action} className="flex flex-col gap-4" id={formId}><input name="movementId" type="hidden" value={movement.id} readOnly /><input name="idempotencyKey" type="hidden" value={idempotencyKey} readOnly /><FieldGroup className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor={`${formId}-direction`}>Tipo</FieldLabel><Select defaultValue={movement.direction} name="direction"><SelectTrigger id={`${formId}-direction`}><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="income">Ingreso</SelectItem><SelectItem value="expense">Egreso</SelectItem></SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor={`${formId}-amount`}>Importe</FieldLabel><Input {...cashAmountInputProps(false)} defaultValue={movement.amount} id={`${formId}-amount`} inputMode="decimal" maxLength={15} name="amount" pattern={CASH_AMOUNT_PATTERN} required type="text" /></Field></FieldGroup><Field><FieldLabel htmlFor={`${formId}-description`}>Detalle</FieldLabel><Textarea defaultValue={movement.description ?? ""} id={`${formId}-description`} name="description" rows={2} /></Field><Field><FieldLabel htmlFor={`${formId}-category`}>Categoría de egreso</FieldLabel><Select defaultValue={categoryId || emptyCashCategoryValue} onValueChange={(value) => setCategoryId(value === emptyCashCategoryValue ? "" : value)}><SelectTrigger id={`${formId}-category`}><SelectValue placeholder="Sin categoría" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value={emptyCashCategoryValue}>Sin categoría</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectGroup></SelectContent></Select><input name="expenseCategoryId" type="hidden" value={categoryId} readOnly /></Field><Feedback state={state} /></form><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction asChild><Button form={formId} type="submit">Confirmar corrección</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
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
  const [clientReasonError, setClientReasonError] = useState<string | null>(null);
  const formId = `cash-reopen-${cashDayId}`;
  const reasonId = `${formId}-reason`;
  const formRef = useRef<HTMLFormElement>(null);
  useMutationToast(state);
  useEffect(() => { if (state.toastId && state.status === "success") queueMicrotask(() => { setOpen(false); setIdempotencyKey(state.resetKey ?? crypto.randomUUID()); }); }, [state.resetKey, state.status, state.toastId]);
  const reasonErrors = errorsFor(state, "reason");
  const reasonError = clientReasonError ?? reasonErrors?.[0]?.message ?? null;
  const reasonInvalid = Boolean(reasonError);
  useEffect(() => {
    if (!clientReasonError) return;
    window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLTextAreaElement>(`#${reasonId}`)?.focus());
  }, [clientReasonError, reasonId]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const reasonField = form.elements.namedItem("reason");
    const value = reasonField instanceof HTMLTextAreaElement ? reasonField.value : "";
    const reasonError = validateReopenReason(value);
    if (reasonError) {
      event.preventDefault();
      setClientReasonError(reasonError);
      window.requestAnimationFrame(() => form.querySelector<HTMLTextAreaElement>(`#${reasonId}`)?.focus());
      return;
    }
    setClientReasonError(null);
  }

  function resetClientError() {
    if (clientReasonError) setClientReasonError(null);
  }

  function preventInvalidReopen(event: React.MouseEvent<HTMLButtonElement>) {
    const reasonField = formRef.current?.elements.namedItem("reason");
    const reasonError = validateReopenReason(reasonField instanceof HTMLTextAreaElement ? reasonField.value : "");
    if (!reasonError) return;
    event.preventDefault();
    setClientReasonError(reasonError);
    window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLTextAreaElement>(`#${reasonId}`)?.focus());
  }

  return <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger asChild><Button variant="outline"><RotateCcw data-icon="inline-start" />Reabrir caja</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar reapertura</AlertDialogTitle><AlertDialogDescription>La caja se abrirá para corregir movimientos del mismo día. El motivo y tu usuario quedarán registrados en el historial.</AlertDialogDescription></AlertDialogHeader><form action={action} className="flex flex-col gap-4" id={formId} noValidate onSubmit={handleSubmit} ref={formRef}><input name="cashDayId" type="hidden" value={cashDayId} readOnly /><input name="idempotencyKey" type="hidden" value={idempotencyKey} readOnly /><Field data-invalid={reasonInvalid}><FieldLabel htmlFor={reasonId}>Motivo</FieldLabel><Textarea aria-describedby={reasonInvalid ? `${reasonId}-error` : undefined} aria-invalid={reasonInvalid} defaultValue="" id={reasonId} maxLength={500} name="reason" onInput={resetClientError} rows={4} /><FieldError errors={reasonError ? [{ message: reasonError }] : reasonErrors} id={`${reasonId}-error`} /></Field><Feedback state={state} /></form><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction asChild><Button form={formId} onClick={preventInvalidReopen} type="submit">Confirmar reapertura</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function MovementList({ movements, categories, writable, requiresVoidReason }: { movements: CashMovement[]; categories: CashCategory[]; writable: boolean; requiresVoidReason: boolean }) {
  if (!movements.length) return <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">Todavía no hay movimientos registrados para el día de hoy.</div>;
  return <Table><TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Detalle</TableHead><TableHead>Categoría</TableHead><TableHead>Registró</TableHead><TableHead>Hora</TableHead><TableHead className="text-right">Importe</TableHead>{writable ? <TableHead className="text-right">Acciones</TableHead> : null}</TableRow></TableHeader><TableBody>{movements.map((movement) => <TableRow key={movement.id}><TableCell><Badge variant={movement.direction === "income" ? "active" : "inactive"}>{movement.direction === "income" ? "Ingreso" : "Egreso"}</Badge></TableCell><TableCell>{movement.description ?? "Sin detalle"}</TableCell><TableCell>{movement.expenseCategoryName ?? "—"}</TableCell><TableCell>{movement.actorDisplayName}</TableCell><TableCell><time className="text-xs text-muted-foreground" dateTime={movement.createdAt}>{formatCashTime(movement.createdAt)}</time></TableCell><TableCell className="text-right font-mono tabular-nums">{movement.direction === "income" ? "+" : "−"}{formatArs(movement.amount)}</TableCell>{writable ? <TableCell><div className="flex justify-end gap-2"><MovementCorrectionDialog categories={categories} movement={movement} /><MovementVoidDialog movement={movement} requiresReason={requiresVoidReason} /></div></TableCell> : null}</TableRow>)}</TableBody></Table>;
}

type CashCalendarDayButtonProps = ComponentProps<typeof CalendarDayButton>;

function CalendarDaySubmitButton({ day, modifiers, onClick, ...props }: CashCalendarDayButtonProps) {
  function submitDate(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    event.preventDefault();
    event.currentTarget.form?.requestSubmit(event.currentTarget);
  }

  return <CalendarDayButton {...props} day={day} modifiers={modifiers} name="date" onClick={submitDate} type="submit" value={operationalDateFromDate(day.date)} />;
}

function MovementCalendar({ summary, closedDays, selectedHistory, tab }: { summary: CashSummary; closedDays: ClosedCashDay[]; selectedHistory: CashDaySummary | null; tab: CashTab }) {
  const availableDays = [
    { cashDayId: summary.cashDayId, operationalDate: summary.operationalDate },
    ...closedDays,
  ].filter((day) => day.operationalDate <= summary.operationalDate);
  const availableDates = [...new Map(availableDays.map((day) => [day.operationalDate, day])).values()];
  const sortedDates = [...availableDates].sort((left, right) => left.operationalDate.localeCompare(right.operationalDate));
  const availableDateValues = new Set(availableDates.map((day) => day.operationalDate));
  const selectedDate = dateFromOperationalDate(selectedHistory?.operationalDate ?? summary.operationalDate);
  const currentDate = dateFromOperationalDate(summary.operationalDate);
  const firstDate = dateFromOperationalDate(sortedDates[0]?.operationalDate ?? summary.operationalDate);
  const monthLabel = (date: Date) => {
    const label = cashMonthFormatter.format(date);
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  return <section aria-labelledby="cash-movement-calendar-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><div><h2 className="text-base font-semibold" id="cash-movement-calendar-title">Consultar movimientos</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Elegí una fecha para revisar sus movimientos. Las fechas disponibles están marcadas en verde.</p></div><form className="mt-5" method="get"><input name="view" type="hidden" value="movements" /><input name="tab" type="hidden" value={tab} /><input name="page" type="hidden" value="1" /><input name="historyPage" type="hidden" value="1" /><div className="overflow-x-auto"><Calendar aria-label="Calendario de movimientos de caja" captionLayout="label" className="w-full max-w-[21rem] rounded-xl border border-border bg-card p-2 shadow-xs" components={{ DayButton: CalendarDaySubmitButton }} defaultMonth={selectedDate} disabled={(date) => !availableDateValues.has(operationalDateFromDate(date))} endMonth={currentDate} fixedWeeks formatters={{ formatCaption: monthLabel, formatWeekdayName: (date) => ["do", "lu", "ma", "mi", "ju", "vi", "sá"][date.getDay()] ?? "" }} locale={es} mode="single" modifiers={{ available: availableDates.map((day) => dateFromOperationalDate(day.operationalDate)) }} selected={selectedDate} showOutsideDays startMonth={firstDate} /></div></form><p className="mt-4 text-xs text-muted-foreground">Usá las flechas o las teclas de dirección para recorrer el calendario. Presioná Enter sobre una fecha habilitada para consultar.</p></section>;
}

function HistoryPanel({ history, movements, historyPage, totalPages, tab, page, view }: { history: CashDaySummary; movements: CashMovement[]; historyPage: number; totalPages: number; tab: CashTab; page: number; view?: CashView }) {
  return <section aria-labelledby="cash-history-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold" id="cash-history-title">Consulta histórica</h2><p className="mt-1 text-sm text-muted-foreground">Día {history.operationalDate}. Esta vista es de solo lectura.</p></div><Badge variant="inactive">Cerrada</Badge></div><div className="mt-5 grid gap-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Saldo inicial</p><p className="font-mono tabular-nums">{formatArs(history.openingBalance)}</p></div><div><p className="text-xs text-muted-foreground">Saldo final</p><p className="font-mono tabular-nums">{formatArs(history.closingBalance ?? "0.00")}</p></div><div><p className="text-xs text-muted-foreground">Cierre</p>{history.closedAt ? <time className="font-mono tabular-nums" dateTime={history.closedAt}>{formatCashDateTime(history.closedAt)}</time> : "—"}</div></div><div className="mt-5"><Table><TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Detalle</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader><TableBody>{movements.map((movement) => <TableRow key={movement.id}><TableCell>{movement.direction === "income" ? "Ingreso" : "Egreso"}</TableCell><TableCell>{movement.description ?? "Sin detalle"}</TableCell><TableCell className="text-right font-mono tabular-nums">{movement.direction === "income" ? "+" : "−"}{formatArs(movement.amount)}</TableCell></TableRow>)}</TableBody></Table>{!history.movements.length ? <p className="mt-3 text-sm text-muted-foreground">No hubo movimientos efectivos en este día.</p> : null}<ArchivePagination ariaLabel="Paginación del historial de caja" basePath="/cash" extraParams={{ tab, page: String(page), cashDay: history.cashDayId, view: view === "movements" ? view : undefined }} pageParam="historyPage" page={historyPage} pageSize={CASH_PAGE_SIZE} total={history.movements.length} totalPages={totalPages} /></div><div className="mt-5"><h3 className="text-sm font-semibold">Historial de correcciones y anulaciones</h3>{history.events.length ? <ul className="mt-2 flex flex-col gap-2 text-sm">{history.events.map((event) => <li className="rounded-md border border-border p-3" key={event.id}>{event.eventType === "correction" ? "Corrección" : "Anulación"} · {event.reason ?? "Sin motivo indicado"} · <time dateTime={event.createdAt}>{formatCashDateTime(event.createdAt)}</time></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No hay eventos de corrección o anulación.</p>}</div></section>;
}

function HistoryAuditPanel({ history, movements }: { history: CashDaySummary; movements: CashMovement[] }) {
  return <section aria-labelledby="cash-history-audit-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><div><h2 className="text-base font-semibold" id="cash-history-audit-title">Trazabilidad del día cerrado</h2><p className="mt-1 text-sm text-muted-foreground">Movimientos, cierre y reaperturas muestran actor y hora del servidor.</p></div><div className="mt-5 flex flex-col gap-4"><div><h3 className="text-sm font-semibold">Movimientos</h3>{movements.length ? <ul className="mt-2 flex flex-col gap-2 text-sm">{movements.map((movement) => <li className="rounded-md border border-border p-3" key={movement.id}><span>{movement.actorDisplayName} · {movement.description ?? "Sin detalle"}</span><time className="block text-xs text-muted-foreground" dateTime={movement.createdAt}>{formatCashDateTime(movement.createdAt)}</time></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No hubo movimientos efectivos en este día.</p>}</div><div><h3 className="text-sm font-semibold">Ciclos de cierre</h3>{history.lifecycleEvents.length ? <ul className="mt-2 flex flex-col gap-2 text-sm">{history.lifecycleEvents.map((event) => <li className="rounded-md border border-border p-3" key={event.id}><span>{event.eventType === "reopen" ? "Reapertura" : `Cierre ${event.closureKind ?? ""}`} · {event.actorDisplayName}{event.reason ? ` · ${event.reason}` : ""}</span><time className="block text-xs text-muted-foreground" dateTime={event.createdAt}>{formatCashDateTime(event.createdAt)}</time></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No hay ciclos auditados.</p>}</div></div></section>;
}

export function CashDashboard({ canOperate, canClose = false, canReopen = false, requiresVoidReason = false, summary, closedDays = [], selectedHistory = null, tab = "income", view = "daily", page = 1, historyPage = 1, cashDay }: { canOperate: boolean; canClose?: boolean; canReopen?: boolean; requiresVoidReason?: boolean; summary: CashSummary; closedDays?: ClosedCashDay[]; selectedHistory?: CashDaySummary | null; tab?: CashTab; view?: CashView; page?: number; historyPage?: number; cashDay?: string }) {
  const viewModel = buildCashDashboardViewModel(summary, canOperate, canClose);
  const total = summary.movements.length;
  const totalPages = Math.max(1, Math.ceil(total / CASH_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const movements = [...summary.movements]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
    .slice((safePage - 1) * CASH_PAGE_SIZE, safePage * CASH_PAGE_SIZE);
  const historyTotal = selectedHistory?.movements.length ?? 0;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / CASH_PAGE_SIZE));
  const safeHistoryPage = Math.min(Math.max(1, historyPage), historyTotalPages);
  const historyMovements = selectedHistory ? [...selectedHistory.movements]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
    .slice((safeHistoryPage - 1) * CASH_PAGE_SIZE, safeHistoryPage * CASH_PAGE_SIZE) : [];
  const sectionLinkClass = (active: boolean) => cn(
    "inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
  );
  const dailyHref = buildArchiveHref("/cash", "page", 1, { view: "daily", tab, cashDay, historyPage: selectedHistory ? String(safeHistoryPage) : undefined });
  const movementsHref = buildArchiveHref("/cash", "page", 1, { view: "movements", tab, cashDay, historyPage: selectedHistory ? String(safeHistoryPage) : undefined });
  const incomeHref = buildArchiveHref("/cash", "page", 1, { tab: "income", cashDay, historyPage: selectedHistory ? String(safeHistoryPage) : undefined });
  const expenseHref = buildArchiveHref("/cash", "page", 1, { tab: "expense", cashDay, historyPage: selectedHistory ? String(safeHistoryPage) : undefined });
  return <div className="flex flex-col gap-6">
    <nav aria-label="Secciones de caja" className="flex gap-2 border-b border-border">
      <Link aria-current={view === "daily" ? "page" : undefined} className={sectionLinkClass(view === "daily")} href={dailyHref}>Caja diaria</Link>
      <Link aria-current={view === "movements" ? "page" : undefined} className={sectionLinkClass(view === "movements")} href={movementsHref}>Movimientos</Link>
    </nav>
    {view === "movements" ? <>
      <MovementCalendar closedDays={closedDays} selectedHistory={selectedHistory} summary={summary} tab={tab} />
      {selectedHistory ? <><HistoryPanel history={selectedHistory} historyPage={safeHistoryPage} movements={historyMovements} page={safePage} tab={tab} totalPages={historyTotalPages} view={view} /><HistoryAuditPanel history={selectedHistory} movements={historyMovements} /></> : <section aria-labelledby="cash-movements-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold" id="cash-movements-title">Movimientos del día</h2><p className="mt-1 text-sm text-muted-foreground">Solo se muestran registros del día operativo actual.</p></div><Badge variant="outline">{total} {total === 1 ? "movimiento" : "movimientos"}</Badge></div><div className="mt-5"><MovementList categories={viewModel.expenseCategories} movements={movements} requiresVoidReason={requiresVoidReason} writable={viewModel.canOperate} /></div><ArchivePagination ariaLabel="Paginación de movimientos de caja" basePath="/cash" extraParams={{ tab, view }} page={safePage} pageSize={CASH_PAGE_SIZE} total={total} totalPages={totalPages} /></section>}
    </> : <>
      <section aria-labelledby="cash-balance-title" className="overflow-hidden rounded-xl border border-border bg-card shadow-xs"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-6"><div><p className="text-xs font-semibold uppercase tracking-label text-muted-foreground">Caja del día</p><h2 className="mt-1 text-3xl font-semibold tracking-display tabular-nums sm:text-4xl" id="cash-balance-title">{formatArs(viewModel.balance)}</h2><p className="mt-2 text-sm text-muted-foreground">{viewModel.isClosed ? "Caja cerrada: no admite nuevas modificaciones." : "Saldo derivado de apertura, ingresos y egresos de hoy."}</p></div><div className="flex items-center gap-3"><Badge variant={viewModel.isClosed ? "inactive" : "active"}>{viewModel.isClosed ? <LockKeyhole aria-hidden="true" data-icon="inline-start" /> : <WalletCards aria-hidden="true" data-icon="inline-start" />}{viewModel.isClosed ? "Caja cerrada" : "Abierta"}</Badge>{viewModel.canClose ? <CloseCashDayDialog cashDayId={summary.cashDayId} /> : null}{viewModel.isClosed && canReopen ? <ReopenCashDayDialog cashDayId={summary.cashDayId} /> : null}</div></div><div className="grid gap-4 p-5 sm:grid-cols-2 sm:px-6"><div className="rounded-lg border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Saldo inicial</p><p className="mt-1 font-mono text-lg font-semibold tabular-nums">{formatArs(viewModel.opening)}</p></div><div className="rounded-lg border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Día operativo</p><p className="mt-1 font-mono text-lg font-semibold tabular-nums">{summary.operationalDate}</p></div></div></section>
      {viewModel.canOperate ? <><section aria-labelledby="cash-opening-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><h2 className="text-base font-semibold" id="cash-opening-title">Apertura de caja</h2><p className="mt-1 text-sm text-muted-foreground">Podés ajustar el saldo inicial; cada cambio queda auditado.</p><div className="mt-5"><OpeningForm summary={summary} /></div></section><section aria-labelledby="cash-movement-form-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><nav aria-label="Pestañas de caja" className="flex gap-2 border-b border-border"><Link aria-current={tab === "income" ? "page" : undefined} className={sectionLinkClass(tab === "income")} href={incomeHref}>Ingresos</Link><Link aria-current={tab === "expense" ? "page" : undefined} className={sectionLinkClass(tab === "expense")} href={expenseHref}>Egresos</Link></nav><div className="mt-5"><h2 className="text-base font-semibold" id="cash-movement-form-title">{tab === "income" ? "Registrar ingreso" : "Registrar egreso"}</h2><p className="mt-1 text-sm text-muted-foreground">{tab === "income" ? "Ingresá un concepto claro. Los ingresos no llevan categoría." : "Elegí una categoría activa de las disponibles."}</p><div className="mt-5"><MovementForm key={tab} categories={tab === "income" ? [] : viewModel.expenseCategories} direction={tab} /></div></div></section></> : null}
      <section aria-labelledby="cash-movements-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold" id="cash-movements-title">Movimientos de hoy</h2><p className="mt-1 text-sm text-muted-foreground">{viewModel.isClosed ? "Registros efectivos del día cerrado." : "Solo se muestran registros del día operativo actual."}</p></div><Badge variant="outline">{total} {total === 1 ? "movimiento" : "movimientos"}</Badge></div><div className="mt-5"><MovementList categories={viewModel.expenseCategories} movements={movements} requiresVoidReason={requiresVoidReason} writable={viewModel.canOperate} /></div><ArchivePagination ariaLabel="Paginación de movimientos de caja" basePath="/cash" extraParams={{ tab, cashDay, historyPage: selectedHistory ? String(safeHistoryPage) : undefined }} page={safePage} pageSize={CASH_PAGE_SIZE} total={total} totalPages={totalPages} /></section>
      {selectedHistory ? <><HistoryPanel history={selectedHistory} historyPage={safeHistoryPage} movements={historyMovements} page={safePage} tab={tab} totalPages={historyTotalPages} /><HistoryAuditPanel history={selectedHistory} movements={historyMovements} /></> : null}
    </>}
  </div>;
}
