"use client";

import { CircleCheck, CircleX, WalletCards } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useMutationToast } from "@/hooks/use-mutation-toast";
import { CASH_AMOUNT_PATTERN, canInsertCashAmount, cashAmountError, formatArs } from "@/lib/money/decimal";

import { createCashMovementAction, setCashOpeningAction, type CashActionState } from "../actions";
import type { CashCategory, CashMovement, CashSummary } from "../queries";

const initialState: CashActionState = {};
const unsupportedActions = ["history", "category administration", "edit", "void", "close", "payments", "order-derived income"] as const;

export function buildCashDashboardViewModel(summary: Pick<CashSummary, "categories" | "currentBalance" | "openingBalance" | "movements">, canOperate: boolean) {
  return { balance: summary.currentBalance, opening: summary.openingBalance, movementState: summary.movements.length ? "populated" : "empty", actions: canOperate ? (["opening", "income", "expense"] as const) : [], canOperate, incomeCategory: null, expenseCategories: summary.categories, unsupportedActions };
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

function MovementList({ movements }: { movements: CashMovement[] }) {
  if (!movements.length) return <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">Todavía no hay movimientos registrados para el día de hoy.</div>;
  return <Table><TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Detalle</TableHead><TableHead>Categoría</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader><TableBody>{movements.map((movement) => <TableRow key={movement.id}><TableCell><Badge variant={movement.direction === "income" ? "active" : "inactive"}>{movement.direction === "income" ? "Ingreso" : "Egreso"}</Badge></TableCell><TableCell>{movement.description ?? "Sin detalle"}</TableCell><TableCell>{movement.expenseCategoryName ?? "—"}</TableCell><TableCell className="text-right font-mono tabular-nums">{movement.direction === "income" ? "+" : "−"}{formatArs(movement.amount)}</TableCell></TableRow>)}</TableBody></Table>;
}

export function CashDashboard({ canOperate, summary }: { canOperate: boolean; summary: CashSummary }) {
  const view = buildCashDashboardViewModel(summary, canOperate);
  return <div className="flex flex-col gap-6">
    <section aria-labelledby="cash-balance-title" className="overflow-hidden rounded-xl border border-border bg-card shadow-xs"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-6"><div><p className="text-xs font-semibold uppercase tracking-label text-muted-foreground">Caja del día</p><h2 className="mt-1 text-3xl font-semibold tracking-display tabular-nums sm:text-4xl" id="cash-balance-title">{formatArs(view.balance)}</h2><p className="mt-2 text-sm text-muted-foreground">Saldo derivado de apertura, ingresos y egresos de hoy.</p></div><Badge variant="active"><WalletCards aria-hidden="true" data-icon="inline-start" />Abierta</Badge></div><div className="grid gap-4 p-5 sm:grid-cols-2 sm:px-6"><div className="rounded-lg border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Saldo inicial</p><p className="mt-1 font-mono text-lg font-semibold tabular-nums">{formatArs(view.opening)}</p></div><div className="rounded-lg border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Día operativo</p><p className="mt-1 font-mono text-lg font-semibold tabular-nums">{summary.operationalDate}</p></div></div></section>
    {view.canOperate ? <><section aria-labelledby="cash-opening-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><h2 className="text-base font-semibold" id="cash-opening-title">Apertura de caja</h2><p className="mt-1 text-sm text-muted-foreground">Podés ajustar el saldo inicial; cada cambio queda auditado.</p><div className="mt-5"><OpeningForm summary={summary} /></div></section><div className="grid gap-6 xl:grid-cols-2"><section aria-labelledby="cash-income-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><h2 className="text-base font-semibold" id="cash-income-title">Registrar ingreso</h2><p className="mt-1 text-sm text-muted-foreground">Ingresá un concepto claro. Los ingresos no llevan categoría.</p><div className="mt-5"><MovementForm direction="income" categories={[]} /></div></section><section aria-labelledby="cash-expense-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><h2 className="text-base font-semibold" id="cash-expense-title">Registrar egreso</h2><p className="mt-1 text-sm text-muted-foreground">Elegí una categoría activa de las disponibles.</p><div className="mt-5"><MovementForm direction="expense" categories={view.expenseCategories} /></div></section></div></> : null}
    <section aria-labelledby="cash-movements-title" className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold" id="cash-movements-title">Movimientos de hoy</h2><p className="mt-1 text-sm text-muted-foreground">Solo se muestran registros del día operativo actual.</p></div><Badge variant="outline">{summary.movements.length} {summary.movements.length === 1 ? "movimiento" : "movimientos"}</Badge></div><div className="mt-5"><MovementList movements={summary.movements} /></div></section>
  </div>;
}
