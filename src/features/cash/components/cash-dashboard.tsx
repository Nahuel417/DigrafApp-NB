"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Ban, CalendarDays, CircleCheck, CircleX, Clock3, Coins, LockKeyhole, LockOpen, Pencil, Receipt, RotateCcw, TrendingDown, TrendingUp, UserRound } from "lucide-react";
import { es } from "react-day-picker/locale";
import { useActionState, useEffect, useRef, useState, useTransition, type ClipboardEvent, type ComponentProps, type DragEvent, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";

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
import { Skeleton } from "@/components/ui/skeleton";
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
  const totals = summary.movements.reduce((result, movement) => {
    const [integer, fraction = ""] = movement.amount.split(".");
    result[movement.direction] += BigInt(integer) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
    return result;
  }, { income: BigInt(0), expense: BigInt(0) });
  const fromCents = (value: bigint) => `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}`;
  return { balance: summary.currentBalance, opening: summary.openingBalance, income: fromCents(totals.income), expense: fromCents(totals.expense), movementState: summary.movements.length ? "populated" : "empty", actions: writable ? (["opening", "income", "expense", "edit", "void", ...(canClose ? ["close"] : [])] as const) : [], canOperate: writable, canClose: writable && canClose, isClosed, incomeCategory: null, expenseCategories: summary.categories, unsupportedActions };
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
function Feedback({ hideSuccess = false, state }: { hideSuccess?: boolean; state: CashActionState }) {
  if (!state.message || hideSuccess && state.status === "success") return null;
  const success = state.status === "success";
  return <Alert aria-live="polite" variant={success ? "success" : "destructive"}>{success ? <CircleCheck aria-hidden="true" /> : <CircleX aria-hidden="true" />}<AlertDescription>{state.message}</AlertDescription></Alert>;
}
export function OpeningForm({ cashDayId, canClose = false, summary }: { cashDayId?: string; canClose?: boolean; summary: CashSummary }) {
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
  return (
    <form action={action} className="flex basis-full min-w-0 flex-wrap items-end gap-3 lg:basis-auto lg:w-[27rem] lg:flex-none" ref={formRef}>
      <input name="expectedOpeningUpdatedAt" type="hidden" value={summary.openingUpdatedAt} readOnly />
      <input name="idempotencyKey" type="hidden" defaultValue={idempotencyKey} readOnly />
      <FieldGroup className="flex w-full min-w-0 flex-wrap flex-row items-start gap-3 sm:flex-none">
        <Field className="min-w-0 basis-full sm:w-32 sm:flex-none sm:basis-auto" data-invalid={Boolean(errors?.length)}>
          <FieldLabel className="sr-only" htmlFor="cash-opening-amount">Saldo inicial</FieldLabel>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
            <Input {...cashAmountInputProps(true, setClientAmountError)} aria-describedby={errors?.length ? "cash-opening-amount-error" : undefined} aria-invalid={Boolean(errors?.length)} className={cn("h-9 rounded-lg bg-card pl-7 shadow-none transition-[background-color,border-color,box-shadow,transform] focus-visible:bg-card", errors?.length && "cash-input-error border-destructive bg-destructive/5 ring-1 ring-destructive/20 focus-visible:border-destructive focus-visible:ring-destructive motion-reduce:animate-none")} inputMode="decimal" id="cash-opening-amount" maxLength={15} name="amount" defaultValue={summary.openingBalance} pattern={CASH_AMOUNT_PATTERN} required type="text" />
          </div>
          <FieldError className="min-h-4 text-xs leading-4" errors={errors} id="cash-opening-amount-error" />
        </Field>
        <SubmitButton className="group h-9 min-w-[9rem] shrink-0 rounded-lg px-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none" pendingLabel="Abriendo caja">Guardar apertura</SubmitButton>
        {canClose && cashDayId ? <CloseCashDayDialog cashDayId={cashDayId} /> : null}
      </FieldGroup>
    </form>
  );
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
  return (
    <form action={action} className="flex flex-col gap-4" ref={formRef}>
      <input name="direction" type="hidden" value={direction} readOnly />
      <input name="idempotencyKey" type="hidden" defaultValue={idempotencyKey} readOnly />
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field data-invalid={Boolean(amountErrors?.length)}>
          <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={`${prefix}-amount`}>Importe</FieldLabel>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
            <Input {...cashAmountInputProps(false, setClientAmountError)} aria-describedby={amountErrors?.length ? `${prefix}-amount-error` : undefined} aria-invalid={Boolean(amountErrors?.length)} className="h-11 rounded-xl bg-card pl-7 shadow-none transition-colors focus-visible:bg-card" inputMode="decimal" id={`${prefix}-amount`} maxLength={15} name="amount" pattern={CASH_AMOUNT_PATTERN} required type="text" />
          </div>
          <FieldError errors={amountErrors} id={`${prefix}-amount-error`} />
        </Field>
        {isIncome ? (
          <Field data-invalid={Boolean(descriptionErrors?.length)}>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={`${prefix}-description`}>Concepto</FieldLabel>
            <Input aria-describedby={descriptionErrors?.length ? `${prefix}-description-error` : undefined} aria-invalid={Boolean(descriptionErrors?.length)} className="h-11 rounded-xl bg-card shadow-none transition-colors focus-visible:bg-card" id={`${prefix}-description`} name="description" required />
            <FieldError errors={descriptionErrors} id={`${prefix}-description-error`} />
          </Field>
        ) : (
          <Field data-invalid={Boolean(categoryErrors?.length)}>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={`${prefix}-category`}>Categoría</FieldLabel>
            <Select name="expenseCategoryId" defaultValue="">
              <SelectTrigger aria-describedby={categoryErrors?.length ? `${prefix}-category-error` : undefined} aria-invalid={Boolean(categoryErrors?.length)} className="h-11 rounded-xl bg-card shadow-none" id={`${prefix}-category`}>
                <SelectValue placeholder="Elegí una categoría" />
              </SelectTrigger>
              <SelectContent><SelectGroup>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <FieldError errors={categoryErrors} id={`${prefix}-category-error`} />
          </Field>
        )}
      </FieldGroup>
      {!isIncome ? (
        <Field data-invalid={Boolean(descriptionErrors?.length)}>
          <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={`${prefix}-description`}>Detalle <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
          <Textarea aria-describedby={descriptionErrors?.length ? `${prefix}-description-error` : undefined} aria-invalid={Boolean(descriptionErrors?.length)} className="min-h-20 resize-none rounded-xl bg-card shadow-none transition-colors focus-visible:bg-card" id={`${prefix}-description`} name="description" rows={2} />
          <FieldError errors={descriptionErrors} id={`${prefix}-description-error`} />
        </Field>
      ) : null}
      <Feedback state={state} />
      <SubmitButton className="self-start rounded-xl px-5" pendingLabel={isIncome ? "Registrando ingreso" : "Registrando egreso"}>{isIncome ? <><ArrowDownLeft aria-hidden="true" data-icon="inline-start" />Registrar ingreso</> : <><ArrowUpRight aria-hidden="true" data-icon="inline-start" />Registrar egreso</>}</SubmitButton>
    </form>
  );
}

function MovementCorrectionDialog({ movement, categories }: { movement: CashMovement; categories: CashCategory[] }) {
  const [state, action] = useActionState(correctCashMovementAction, initialState);
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(movement.expenseCategoryId ?? "");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const formId = `cash-correction-${movement.id}`;
  useMutationToast(state);
  useEffect(() => { if (state.toastId && state.status === "success") queueMicrotask(() => { setOpen(false); setIdempotencyKey(state.resetKey ?? crypto.randomUUID()); }); }, [state.resetKey, state.status, state.toastId]);
  return <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger asChild><Button aria-label="Editar" className="rounded-lg" size="icon" title="Editar movimiento" variant="outline"><Pencil aria-hidden="true" /></Button></AlertDialogTrigger><AlertDialogContent className="rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Confirmar corrección</AlertDialogTitle><AlertDialogDescription>Se conservará el estado anterior y se registrará tu usuario y la hora. La corrección solo aplica mientras la caja esté abierta.</AlertDialogDescription></AlertDialogHeader><form action={action} className="flex flex-col gap-4" id={formId}><input name="movementId" type="hidden" value={movement.id} readOnly /><input name="idempotencyKey" type="hidden" value={idempotencyKey} readOnly /><FieldGroup className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor={`${formId}-direction`}>Tipo</FieldLabel><Select defaultValue={movement.direction} name="direction"><SelectTrigger id={`${formId}-direction`}><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="income">Ingreso</SelectItem><SelectItem value="expense">Egreso</SelectItem></SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor={`${formId}-amount`}>Importe</FieldLabel><Input {...cashAmountInputProps(false)} defaultValue={movement.amount} id={`${formId}-amount`} inputMode="decimal" maxLength={15} name="amount" pattern={CASH_AMOUNT_PATTERN} required type="text" /></Field></FieldGroup><Field><FieldLabel htmlFor={`${formId}-description`}>Detalle</FieldLabel><Textarea defaultValue={movement.description ?? ""} id={`${formId}-description`} name="description" rows={2} /></Field><Field><FieldLabel htmlFor={`${formId}-category`}>Categoría de egreso</FieldLabel><Select defaultValue={categoryId || emptyCashCategoryValue} onValueChange={(value) => setCategoryId(value === emptyCashCategoryValue ? "" : value)}><SelectTrigger id={`${formId}-category`}><SelectValue placeholder="Sin categoría" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value={emptyCashCategoryValue}>Sin categoría</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectGroup></SelectContent></Select><input name="expenseCategoryId" type="hidden" value={categoryId} readOnly /></Field><Feedback state={state} /></form><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction asChild><Button form={formId} type="submit">Confirmar corrección</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function MovementVoidDialog({ movement, requiresReason }: { movement: CashMovement; requiresReason: boolean }) {
  const [state, action] = useActionState(voidCashMovementAction, initialState);
  const [open, setOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const formId = `cash-void-${movement.id}`;
  useMutationToast(state);
  useEffect(() => { if (state.toastId && state.status === "success") queueMicrotask(() => { setOpen(false); setIdempotencyKey(state.resetKey ?? crypto.randomUUID()); }); }, [state.resetKey, state.status, state.toastId]);
  return <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger asChild><Button aria-label="Anular" className="rounded-lg" size="icon" title="Anular movimiento" variant="destructive"><Ban aria-hidden="true" /></Button></AlertDialogTrigger><AlertDialogContent className="rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Confirmar anulación</AlertDialogTitle><AlertDialogDescription>El movimiento quedará retenido como anulado y dejará de afectar el saldo. Esta acción no se puede revertir.</AlertDialogDescription></AlertDialogHeader><form action={action} className="flex flex-col gap-4" id={formId}><input name="movementId" type="hidden" value={movement.id} readOnly /><input name="idempotencyKey" type="hidden" value={idempotencyKey} readOnly /><Field><FieldLabel htmlFor={`${formId}-reason`}>Motivo {requiresReason ? null : <span className="font-normal text-muted-foreground">(opcional)</span>}</FieldLabel><Textarea aria-required={requiresReason} id={`${formId}-reason`} minLength={requiresReason ? 2 : undefined} name="reason" required={requiresReason} rows={3} /></Field><Feedback state={state} /></form><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction asChild><Button form={formId} type="submit" variant="destructive">Confirmar anulación</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function CloseCashDayDialog({ cashDayId }: { cashDayId: string }) {
  const [state, action] = useActionState(closeCashDayAction, initialState);
  const [open, setOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const formId = `cash-close-${cashDayId}`;
  useMutationToast(state);
  useEffect(() => { if (state.toastId && state.status === "success") queueMicrotask(() => { setOpen(false); setIdempotencyKey(state.resetKey ?? crypto.randomUUID()); }); }, [state.resetKey, state.status, state.toastId]);
  return <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger asChild><Button className="group h-9 rounded-lg px-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none" type="button" variant="destructive"><LockKeyhole className="transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none" data-icon="inline-start" />Cerrar caja</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar cierre de caja</AlertDialogTitle><AlertDialogDescription>La caja quedará bloqueada para nuevas aperturas, movimientos, correcciones y anulaciones. La consulta histórica seguirá disponible.</AlertDialogDescription></AlertDialogHeader><form action={action} id={formId}><input name="cashDayId" type="hidden" value={cashDayId} readOnly /><input name="idempotencyKey" type="hidden" value={idempotencyKey} readOnly /><Feedback state={state} /></form><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction asChild><Button form={formId} type="submit" variant="destructive">Confirmar cierre</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
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

  return <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger asChild><Button className="group rounded-lg shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none" variant="outline"><RotateCcw className="transition-transform duration-300 group-hover:-rotate-45 motion-reduce:transition-none" data-icon="inline-start" />Reabrir caja</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar reapertura</AlertDialogTitle><AlertDialogDescription>La caja se abrirá para corregir movimientos del mismo día. El motivo y tu usuario quedarán registrados en el historial.</AlertDialogDescription></AlertDialogHeader><form action={action} className="flex flex-col gap-4" id={formId} noValidate onSubmit={handleSubmit} ref={formRef}><input name="cashDayId" type="hidden" value={cashDayId} readOnly /><input name="idempotencyKey" type="hidden" value={idempotencyKey} readOnly /><Field data-invalid={reasonInvalid}><FieldLabel htmlFor={reasonId}>Motivo</FieldLabel><Textarea aria-describedby={reasonInvalid ? `${reasonId}-error` : undefined} aria-invalid={reasonInvalid} defaultValue="" id={reasonId} maxLength={500} name="reason" onInput={resetClientError} rows={4} /><FieldError errors={reasonError ? [{ message: reasonError }] : reasonErrors} id={`${reasonId}-error`} /></Field><Feedback state={state} /></form><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction asChild><Button form={formId} onClick={preventInvalidReopen} type="submit">Confirmar reapertura</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function MovementList({ movements, categories, writable, requiresVoidReason }: { movements: CashMovement[]; categories: CashCategory[]; writable: boolean; requiresVoidReason: boolean }) {
  if (!movements.length) {
    return <div className="mx-5 mb-5 flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center sm:mx-6 sm:mb-6"><Receipt aria-hidden="true" className="size-5 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">Todavía no hay movimientos registrados para el día de hoy.</p></div>;
  }

  return (
    <Table className="min-w-[48rem]">
      <TableHeader>
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableHead className="h-10 w-32 px-5 text-[11px] font-medium uppercase tracking-label">Tipo</TableHead>
          <TableHead className="h-10 min-w-44 px-5 text-[11px] font-medium uppercase tracking-label">Detalle</TableHead>
          <TableHead className="h-10 w-36 px-5 text-[11px] font-medium uppercase tracking-label">Categoría</TableHead>
          <TableHead className="h-10 min-w-40 px-5 text-[11px] font-medium uppercase tracking-label">Registró</TableHead>
          <TableHead className="h-10 w-24 px-5 text-[11px] font-medium uppercase tracking-label">Hora</TableHead>
          <TableHead className="h-10 w-40 px-5 text-right text-[11px] font-medium uppercase tracking-label">Importe</TableHead>
          {writable ? <TableHead className="h-10 w-24 px-5 text-right text-[11px] font-medium uppercase tracking-label">Acciones</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {movements.map((movement) => (
          <TableRow className="transition-colors hover:bg-muted/30" key={movement.id}>
            <TableCell className="px-5 py-3"><Badge className="rounded-full px-2.5 py-1 text-[11px]" variant={movement.direction === "income" ? "active" : "inactive"}>{movement.direction === "income" ? <ArrowDownLeft aria-hidden="true" data-icon="inline-start" /> : <ArrowUpRight aria-hidden="true" data-icon="inline-start" />}{movement.direction === "income" ? "Ingreso" : "Egreso"}</Badge></TableCell>
            <TableCell className="min-w-44 px-5 py-3 text-sm">{movement.description ?? "Sin detalle"}</TableCell>
            <TableCell className="w-36 px-5 py-3 text-sm text-muted-foreground">{movement.expenseCategoryName ?? "—"}</TableCell>
            <TableCell className="min-w-40 whitespace-nowrap px-5 py-3 text-sm"><span className="flex items-center gap-1.5"><UserRound aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />{movement.actorDisplayName}</span></TableCell>
            <TableCell className="w-24 px-5 py-3"><time className="font-mono text-xs tabular-nums text-muted-foreground" dateTime={movement.createdAt}>{formatCashTime(movement.createdAt)}</time></TableCell>
            <TableCell className={cn("w-40 whitespace-nowrap px-5 py-3 text-right font-mono font-medium tabular-nums", movement.direction === "income" ? "text-success-foreground" : "text-destructive")}>{movement.direction === "income" ? "+" : "−"}{formatArs(movement.amount)}</TableCell>
            {writable ? <TableCell className="w-24 px-5 py-3"><div className="flex justify-end gap-2"><MovementCorrectionDialog categories={categories} movement={movement} /><MovementVoidDialog movement={movement} requiresReason={requiresVoidReason} /></div></TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MovementLoading() {
  return <section aria-busy="true" aria-labelledby="cash-movements-loading-title" className="min-h-[22rem] rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold" id="cash-movements-loading-title">Cargando movimientos</h2><p className="mt-1 text-sm text-muted-foreground">Consultando la fecha seleccionada.</p></div><Badge variant="outline">Cargando</Badge></div><div aria-label="Cargando movimientos" aria-live="polite" className="mt-5 flex flex-col gap-3" data-testid="cash-movement-loading" role="status"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div></section>;
}

type CashCalendarDayButtonProps = ComponentProps<typeof CalendarDayButton>;

function CalendarDaySubmitButton({ day, modifiers, onClick, ...props }: CashCalendarDayButtonProps) {
  function submitDate(event: MouseEvent<HTMLButtonElement>) {
    const button = event.currentTarget;
    onClick?.(event);
    event.preventDefault();
    button.form?.requestSubmit(button);
  }

  return <CalendarDayButton {...props} day={day} modifiers={modifiers} name="date" onClick={submitDate} type="submit" value={operationalDateFromDate(day.date)} />;
}

function MovementCalendar({ isPending, onDateSelect, summary, closedDays, selectedHistory, tab }: { isPending: boolean; onDateSelect: (day: Pick<ClosedCashDay, "cashDayId" | "operationalDate">) => void; summary: CashSummary; closedDays: ClosedCashDay[]; selectedHistory: CashDaySummary | null; tab: CashTab }) {
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

  return (
    <section aria-busy={isPending || undefined} aria-labelledby="cash-movement-calendar-title" className="grid-paper rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
      <div>
        <h2 className="text-base font-semibold" id="cash-movement-calendar-title">Consultar movimientos</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Elegí una fecha para revisar sus movimientos. Las fechas disponibles están marcadas en verde.</p>
      </div>
      <form
        className="mt-5"
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          const operationalDate = submitter instanceof HTMLButtonElement ? submitter.value : "";
          const day = availableDays.find((candidate) => candidate.operationalDate === operationalDate);
          if (day) onDateSelect(day);
        }}
      >
        <input name="view" type="hidden" value="movements" />
        <input name="tab" type="hidden" value={tab} />
        <input name="page" type="hidden" value="1" />
        <input name="historyPage" type="hidden" value="1" />
        <div className="overflow-x-auto">
          <Calendar
            aria-label="Calendario de movimientos de caja"
            captionLayout="label"
            className="w-full max-w-[21rem] rounded-xl border border-border bg-card p-2 shadow-xs"
            components={{ DayButton: CalendarDaySubmitButton }}
            defaultMonth={selectedDate}
            disabled={(date) => isPending || !availableDateValues.has(operationalDateFromDate(date))}
            endMonth={currentDate}
            fixedWeeks
            formatters={{ formatCaption: monthLabel, formatWeekdayName: (date) => ["do", "lu", "ma", "mi", "ju", "vi", "sá"][date.getDay()] ?? "" }}
            locale={es}
            mode="single"
            modifiers={{ available: availableDates.map((day) => dateFromOperationalDate(day.operationalDate)) }}
            selected={selectedDate}
            showOutsideDays
            startMonth={firstDate}
          />
        </div>
      </form>
      <p className="mt-4 text-xs text-muted-foreground">Usá las flechas o las teclas de dirección para recorrer el calendario. Presioná Enter sobre una fecha habilitada para consultar.</p>
    </section>
  );
}

function HistoryPanel({ history, movements, historyPage, totalPages, tab, page, view }: { history: CashDaySummary; movements: CashMovement[]; historyPage: number; totalPages: number; tab: CashTab; page: number; view?: CashView }) {
  return (
    <section aria-labelledby="cash-history-title" className="rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Clock3 aria-hidden="true" className="size-4" /></span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold" id="cash-history-title">Consulta histórica</h2>
            <p className="mt-1 text-sm text-muted-foreground">Día {history.operationalDate}. Esta vista es de solo lectura.</p>
          </div>
        </div>
        <Badge variant="inactive">Cerrada</Badge>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-muted/20 p-3"><p className="text-[11px] font-medium uppercase tracking-label text-muted-foreground">Saldo inicial</p><p className="mt-1.5 font-mono font-semibold tabular-nums">{formatArs(history.openingBalance)}</p></div>
        <div className="rounded-xl border border-border bg-muted/20 p-3"><p className="text-[11px] font-medium uppercase tracking-label text-muted-foreground">Saldo final</p><p className="mt-1.5 font-mono font-semibold tabular-nums">{formatArs(history.closingBalance ?? "0.00")}</p></div>
        <div className="rounded-xl border border-border bg-muted/20 p-3"><p className="text-[11px] font-medium uppercase tracking-label text-muted-foreground">Cierre</p>{history.closedAt ? <time className="mt-1.5 block font-mono text-sm font-semibold tabular-nums" dateTime={history.closedAt}>{formatCashDateTime(history.closedAt)}</time> : <p className="mt-1.5 font-mono font-semibold tabular-nums">—</p>}</div>
      </div>
      <div className="mt-5 overflow-hidden rounded-xl border border-border">
        <Table className="min-w-[30rem]">
          <TableHeader><TableRow className="bg-muted/30 hover:bg-muted/30"><TableHead className="text-[11px] font-medium uppercase tracking-label">Tipo</TableHead><TableHead className="text-[11px] font-medium uppercase tracking-label">Detalle</TableHead><TableHead className="text-right text-[11px] font-medium uppercase tracking-label">Importe</TableHead></TableRow></TableHeader>
          <TableBody>{movements.map((movement) => <TableRow key={movement.id}><TableCell>{movement.direction === "income" ? "Ingreso" : "Egreso"}</TableCell><TableCell>{movement.description ?? "Sin detalle"}</TableCell><TableCell className="text-right font-mono tabular-nums">{movement.direction === "income" ? "+" : "−"}{formatArs(movement.amount)}</TableCell></TableRow>)}</TableBody>
        </Table>
        {!history.movements.length ? <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">No hubo movimientos efectivos en este día.</p> : null}
      </div>
      <ArchivePagination ariaLabel="Paginación del historial de caja" basePath="/cash" extraParams={{ tab, page: String(page), cashDay: history.cashDayId, view: view === "movements" ? view : undefined }} pageParam="historyPage" page={historyPage} pageSize={CASH_PAGE_SIZE} total={history.movements.length} totalPages={totalPages} />
      <div className="mt-6 border-t border-border pt-5">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Historial de correcciones y anulaciones</h3><span className="font-mono text-xs tabular-nums text-muted-foreground">{history.events.length}</span></div>
        {history.events.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{history.events.map((event) => <li className="rounded-xl border border-border bg-muted/20 p-3 text-sm" key={event.id}><div className="flex items-center justify-between gap-3"><Badge className="rounded-full px-2 py-0.5 text-[10px]" variant="outline">{event.eventType === "correction" ? "Corrección" : "Anulación"}</Badge><time className="text-xs text-muted-foreground" dateTime={event.createdAt}>{formatCashDateTime(event.createdAt)}</time></div><p className="mt-2 text-muted-foreground">{event.reason ?? "Sin motivo indicado"}</p></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No hay eventos de corrección o anulación.</p>}
      </div>
    </section>
  );
}

function HistoryAuditPanel({ history, movements }: { history: CashDaySummary; movements: CashMovement[] }) {
  return (
    <section aria-labelledby="cash-history-audit-title" className="rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Receipt aria-hidden="true" className="size-4" /></span>
        <div><h2 className="text-base font-semibold" id="cash-history-audit-title">Trazabilidad del día cerrado</h2><p className="mt-1 text-sm text-muted-foreground">Movimientos, cierre y reaperturas muestran actor y hora del servidor.</p></div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Movimientos</h3><span className="font-mono text-xs tabular-nums text-muted-foreground">{movements.length}</span></div>
          {movements.length ? <ul className="mt-3 flex flex-col gap-2">{movements.map((movement) => <li className="rounded-lg border border-border bg-card p-3 text-sm" key={movement.id}><div className="flex min-w-0 items-start gap-3"><span className={cn("grid size-7 shrink-0 place-items-center rounded-full", movement.direction === "income" ? "bg-success/10 text-success-foreground" : "bg-destructive/10 text-destructive")}>{movement.direction === "income" ? <ArrowDownLeft aria-hidden="true" className="size-3.5" /> : <ArrowUpRight aria-hidden="true" className="size-3.5" />}</span><div className="min-w-0 flex-1"><p className="truncate font-medium">{movement.description ?? "Sin detalle"}</p><p className="mt-1 text-xs text-muted-foreground">{movement.actorDisplayName}</p></div><time className="shrink-0 text-xs text-muted-foreground" dateTime={movement.createdAt}>{formatCashDateTime(movement.createdAt)}</time></div></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No hubo movimientos efectivos en este día.</p>}
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Ciclos de cierre</h3><span className="font-mono text-xs tabular-nums text-muted-foreground">{history.lifecycleEvents.length}</span></div>
          {history.lifecycleEvents.length ? <ul className="mt-3 flex flex-col gap-2">{history.lifecycleEvents.map((event) => <li className="rounded-lg border border-border bg-card p-3 text-sm" key={event.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{event.eventType === "reopen" ? "Reapertura" : `Cierre ${event.closureKind ?? ""}`}</p><p className="mt-1 truncate text-xs text-muted-foreground">{event.actorDisplayName}{event.reason ? ` · ${event.reason}` : ""}</p></div><time className="shrink-0 text-xs text-muted-foreground" dateTime={event.createdAt}>{formatCashDateTime(event.createdAt)}</time></div></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No hay ciclos auditados.</p>}
        </div>
      </div>
    </section>
  );
}

export function CashDashboard({ canOperate, canClose = false, canReopen = false, requiresVoidReason = false, summary, closedDays = [], selectedHistory = null, tab = "income", view = "daily", page = 1, historyPage = 1, cashDay }: { canOperate: boolean; canClose?: boolean; canReopen?: boolean; requiresVoidReason?: boolean; summary: CashSummary; closedDays?: ClosedCashDay[]; selectedHistory?: CashDaySummary | null; tab?: CashTab; view?: CashView; page?: number; historyPage?: number; cashDay?: string }) {
  const router = useRouter();
  const [isMovementTransitionPending, startMovementTransition] = useTransition();
  const [pendingCashDayId, setPendingCashDayId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CashTab>(tab);
  const isMovementPending = (cashDay !== undefined && pendingCashDayId !== null && pendingCashDayId !== cashDay) || isMovementTransitionPending;
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
    "inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    active ? "bg-card font-medium text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
  );
  const tabButtonClass = (active: boolean) => cn(
    "inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    active ? "bg-card font-medium text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
  );
  const historyParams = view === "movements" ? { view, cashDay, historyPage: selectedHistory ? String(safeHistoryPage) : undefined } : {};
  const dailyHref = buildArchiveHref("/cash", "page", 1, { view: "daily", tab: activeTab });
  const movementsHref = buildArchiveHref("/cash", "page", 1, { view: "movements", tab: activeTab, ...historyParams });
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs: CashTab[] = ["income", "expense"];
    const currentIndex = tabs.indexOf(activeTab);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex]!;
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`cash-${nextTab}-tab`)?.focus());
  }
  function selectCashDay(day: Pick<ClosedCashDay, "cashDayId" | "operationalDate">) {
    if (isMovementPending) return;
    const params = new URLSearchParams({ tab: activeTab, page: "1", view: "movements", cashDay: day.cashDayId, historyPage: "1" });
    startMovementTransition(() => {
      setPendingCashDayId(day.cashDayId);
      router.push(`/cash?${params.toString()}`, { scroll: false });
    });
  }
  return <div className="flex flex-col gap-6">
    <nav aria-label="Secciones de caja" className="flex w-fit max-w-full gap-1 rounded-xl bg-muted p-1">
      <Link aria-current={view === "daily" ? "page" : undefined} className={sectionLinkClass(view === "daily")} href={dailyHref}>Caja diaria</Link>
      <Link aria-current={view === "movements" ? "page" : undefined} className={sectionLinkClass(view === "movements")} href={movementsHref}>Movimientos</Link>
    </nav>
    {view === "movements" ? <>
       <MovementCalendar closedDays={closedDays} isPending={isMovementPending} onDateSelect={selectCashDay} selectedHistory={selectedHistory} summary={summary} tab={activeTab} />
         {isMovementPending ? <MovementLoading /> : selectedHistory ? <><HistoryPanel history={selectedHistory} historyPage={safeHistoryPage} movements={historyMovements} page={safePage} tab={activeTab} totalPages={historyTotalPages} view={view} /><HistoryAuditPanel history={selectedHistory} movements={historyMovements} /></> : <section aria-labelledby="cash-movements-title" className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs"><div className="flex flex-wrap items-start justify-between gap-3 px-5 py-5 sm:px-6"><div><h2 className="flex items-center gap-2 text-base font-semibold" id="cash-movements-title"><Clock3 aria-hidden="true" className="size-4 text-primary" />Movimientos del día</h2><p className="mt-1 text-sm text-muted-foreground">Solo se muestran registros del día operativo actual.</p></div><Badge className="rounded-full px-3 py-1 text-xs" variant="outline">{total} {total === 1 ? "movimiento" : "movimientos"}</Badge></div><div className="border-t border-border"><MovementList categories={viewModel.expenseCategories} movements={movements} requiresVoidReason={requiresVoidReason} writable={viewModel.canOperate} /></div><div className="px-5 pb-5 sm:px-6"><ArchivePagination ariaLabel="Paginación de movimientos de caja" basePath="/cash" extraParams={{ tab: activeTab, view }} page={safePage} pageSize={CASH_PAGE_SIZE} total={total} totalPages={totalPages} /></div></section>}
    </> : <>
      <section aria-labelledby="cash-balance-title" className="grid-paper relative overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
        <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-8 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-label text-muted-foreground">Caja del día</p>
            <h2 className="mt-3 font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl" id="cash-balance-title">{formatArs(viewModel.balance)}</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{viewModel.isClosed ? "Caja cerrada: no admite nuevas modificaciones." : "Saldo derivado de apertura, ingresos y egresos de hoy."}</p>
          </div>
          <div className={cn("grid gap-3", viewModel.isClosed ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
            <div className="min-w-36 rounded-2xl border border-border bg-card/90 px-4 py-3"><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Coins aria-hidden="true" className="size-3.5 text-primary" />Saldo inicial</p><p className="mt-1.5 font-mono font-semibold tabular-nums">{formatArs(viewModel.opening)}</p></div>
            {viewModel.isClosed ? <div className="min-w-36 rounded-2xl border border-border bg-card/90 px-4 py-3"><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays aria-hidden="true" className="size-3.5 text-primary" />Día operativo</p><p className="mt-1.5 font-mono font-semibold tabular-nums">{summary.operationalDate.split("-").reverse().join("/")}</p></div> : <>
              <div className="min-w-32 rounded-2xl border border-border bg-card/90 px-4 py-3"><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><TrendingUp aria-hidden="true" className="size-3.5 text-success-foreground" />Ingresos</p><p className="mt-1.5 font-mono font-semibold tabular-nums">{formatArs(viewModel.income)}</p></div>
              <div className="min-w-32 rounded-2xl border border-border bg-card/90 px-4 py-3"><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><TrendingDown aria-hidden="true" className="size-3.5 text-destructive" />Egresos</p><p className="mt-1.5 font-mono font-semibold tabular-nums">{formatArs(viewModel.expense)}</p></div>
            </>}
          </div>
        </div>
        {viewModel.canOperate ? <div className="relative flex flex-wrap items-center gap-3 border-t border-border bg-muted/30 px-5 py-4 sm:px-7"><div className="flex min-w-0 flex-1 basis-full items-center gap-3 lg:basis-auto"><LockOpen aria-hidden="true" className="size-4 shrink-0 text-primary" /><div><p className="text-sm font-medium">Apertura de caja</p><p className="hidden text-xs text-muted-foreground sm:block">Cada cambio queda auditado.</p></div></div><OpeningForm canClose={viewModel.canClose} cashDayId={summary.cashDayId} summary={summary} /></div> : viewModel.isClosed ? <div className="relative flex flex-wrap items-center gap-3 border-t border-border bg-muted/30 px-5 py-4 sm:px-7"><LockKeyhole aria-hidden="true" className="size-4 text-destructive" /><div className="mr-auto"><p className="text-sm font-medium">Caja cerrada</p><p className="text-xs text-muted-foreground">Para modificar datos, primero reabrí la caja.</p></div>{canReopen ? <ReopenCashDayDialog cashDayId={summary.cashDayId} /> : null}</div> : null}
      </section>
       {viewModel.canOperate ? <section aria-labelledby="cash-movement-form-title" className="rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><nav aria-label="Pestañas de caja" aria-orientation="horizontal" className="inline-flex w-fit rounded-xl bg-muted p-1" role="tablist"><button aria-controls="cash-income-panel" aria-selected={activeTab === "income"} className={tabButtonClass(activeTab === "income")} id="cash-income-tab" onClick={() => setActiveTab("income")} onKeyDown={handleTabKeyDown} role="tab" tabIndex={activeTab === "income" ? 0 : -1} type="button"><ArrowDownLeft aria-hidden="true" className="size-4 text-success-foreground" />Ingresos</button><button aria-controls="cash-expense-panel" aria-selected={activeTab === "expense"} className={tabButtonClass(activeTab === "expense")} id="cash-expense-tab" onClick={() => setActiveTab("expense")} onKeyDown={handleTabKeyDown} role="tab" tabIndex={activeTab === "expense" ? 0 : -1} type="button"><ArrowUpRight aria-hidden="true" className="size-4 text-destructive" />Egresos</button></nav><p className="text-xs text-muted-foreground">{activeTab === "income" ? "Los ingresos no llevan categoría." : "Elegí una categoría activa de las disponibles."}</p></div><div aria-labelledby={`cash-${activeTab}-tab`} className="mt-6" id={`cash-${activeTab}-panel`} role="tabpanel" tabIndex={0}><h2 className="text-base font-semibold" id="cash-movement-form-title">{activeTab === "income" ? "Registrar ingreso" : "Registrar egreso"}</h2><p className="mt-1 text-sm text-muted-foreground">{activeTab === "income" ? "Ingresá un concepto claro." : "Registrá un egreso con su categoría y detalle."}</p><div className="mt-5"><MovementForm key={activeTab} categories={activeTab === "income" ? [] : viewModel.expenseCategories} direction={activeTab} /></div></div></section> : null}
        <section aria-labelledby="cash-movements-title" className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs"><div className="flex flex-wrap items-start justify-between gap-3 px-5 py-5 sm:px-6"><div><h2 className="flex items-center gap-2 text-base font-semibold" id="cash-movements-title"><Clock3 aria-hidden="true" className="size-4 text-primary" />Movimientos de hoy</h2><p className="mt-1 text-sm text-muted-foreground">{viewModel.isClosed ? "Registros efectivos del día cerrado." : "Solo se muestran registros del día operativo actual."}</p></div><Badge className="rounded-full px-3 py-1 text-xs" variant="outline">{total} {total === 1 ? "movimiento" : "movimientos"}</Badge></div><div className="border-t border-border"><MovementList categories={viewModel.expenseCategories} movements={movements} requiresVoidReason={requiresVoidReason} writable={viewModel.canOperate} /></div><div className="px-5 pb-5 sm:px-6"><ArchivePagination ariaLabel="Paginación de movimientos de caja" basePath="/cash" extraParams={{ tab: activeTab }} page={safePage} pageSize={CASH_PAGE_SIZE} total={total} totalPages={totalPages} /></div></section>
     </>}
  </div>;
}
