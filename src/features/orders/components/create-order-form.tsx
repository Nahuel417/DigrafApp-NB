'use client';

import type { LucideIcon } from 'lucide-react';
import { AlertCircle, BadgeDollarSign, CalendarDays, CircleCheck, Info, Layers, Shirt, UserRound } from 'lucide-react';
import { es } from 'react-day-picker/locale';
import { useActionState, useEffect, useRef, useState } from 'react';

import { SubmitButton } from '@/components/submit-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useMutationToast } from '@/hooks/use-mutation-toast';
import { formatArs, normalizeMoney, safeOrderBalance } from '@/lib/money/decimal';

import { createOrderAction, type OrderActionState } from '../actions';
import { formatDate } from '../detail-format';
import type { OrderFormCatalogs } from '../queries';
import { OrderLineEditor } from './order-line-editor';

function errorsFor(state: OrderActionState, field: string) {
    return state.fieldErrors?.[field]?.map((message) => ({ message }));
}

type OrderFormValues = {
    clientName: string;
    teamName: string;
    phone: string;
    orderDate: string;
    promisedDeliveryDate: string;
    description: string;
    totalAmount: string;
    depositAmount: string;
    depositPaid: boolean;
};

function initialFormValues(orderDate: string): OrderFormValues {
    return {
        clientName: '',
        teamName: '',
        phone: '',
        orderDate,
        promisedDeliveryDate: '',
        description: '',
        totalAmount: '',
        depositAmount: '',
        depositPaid: false,
    };
}

function safeMoney(value: string) {
    try {
        return value.trim() ? normalizeMoney(value) : null;
    } catch {
        return null;
    }
}

export function CreateOrderForm({ catalogs, initialOrderDate }: { catalogs: OrderFormCatalogs; initialOrderDate: string }) {
    const [state, formAction] = useActionState(createOrderAction, {});
    const formRef = useRef<HTMLFormElement>(null);
    const resultRef = useRef<HTMLDivElement>(null);
    const [values, setValues] = useState(() => initialFormValues(initialOrderDate));
    const [successResetToastId, setSuccessResetToastId] = useState<string>();
    const [clearedFieldErrors, setClearedFieldErrors] = useState<{ toastId?: string; fields: Set<string> }>({ fields: new Set() });
    const [lineSummary, setLineSummary] = useState({ lineCount: 1, unitCount: 1 });
    const idempotencyRef = useRef<HTMLInputElement>(null);
    const resetDraft = state.status === 'success' && Boolean(state.toastId) && state.toastId !== successResetToastId;
    const draftValues = resetDraft ? initialFormValues(initialOrderDate) : values;
    const total = safeMoney(draftValues.totalAmount);
    const deposit = safeMoney(draftValues.depositAmount);
    const balance = total && deposit ? safeOrderBalance(total, deposit) : null;
    useMutationToast(state);

    function clearFieldError(field: string) {
        const toastId = state.toastId;
        setClearedFieldErrors((current) => {
            if (current.toastId === toastId) {
                if (current.fields.has(field)) return current;
                return { toastId, fields: new Set(current.fields).add(field) };
            }
            return { toastId, fields: new Set([field]) };
        });
    }

    function errorsForField(field: string) {
        return clearedFieldErrors.toastId === state.toastId && clearedFieldErrors.fields.has(field) ? undefined : errorsFor(state, field);
    }

    function hasFieldError(field: string) {
        return Boolean(errorsForField(field)?.length);
    }

    function updateValue<K extends keyof OrderFormValues>(field: K, value: OrderFormValues[K]) {
        setValues((current) => ({ ...(resetDraft ? initialFormValues(initialOrderDate) : current), [field]: value }));
        if (resetDraft && state.toastId) setSuccessResetToastId(state.toastId);
        clearFieldError(field);
    }

    useEffect(() => {
        if (!state.toastId) return;
        if (state.status === 'success') {
            window.requestAnimationFrame(() => resultRef.current?.focus());
        } else window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    }, [state.status, state.toastId]);

    return (
        <>
            {state.createdOrder ? (
                <Alert
                    aria-live="polite"
                    className="w-fit max-w-full items-center rounded-lg border-success-foreground/20 bg-success px-3 py-2 shadow-xs mb-4"
                    ref={resultRef}
                    tabIndex={-1}
                    variant="success">
                    <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                        <h2 className="text-xs font-medium leading-4">Pedido PED-{String(state.createdOrder.publicNumber).padStart(6, '0')} creado</h2>
                        <AlertDescription className="text-xs leading-4">Ya está en la etapa Pedido recibido.</AlertDescription>
                    </div>
                </Alert>
            ) : null}

            <form
                action={formAction}
                className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start"
                key={state.status === 'success' && state.toastId ? state.toastId : 'create-order-form'}
                noValidate
                onSubmit={() => {
                    if (resetDraft && state.toastId) {
                        setValues(initialFormValues(initialOrderDate));
                        setSuccessResetToastId(state.toastId);
                    }
                    if (idempotencyRef.current && !idempotencyRef.current.value) idempotencyRef.current.value = crypto.randomUUID();
                }}
                ref={formRef}>
                <input name="idempotencyKey" ref={idempotencyRef} type="hidden" />

                <div className="min-w-0 space-y-6">
                    <Section icon={UserRound} title="Identificación" hint="Datos de contacto del pedido.">
                        <FieldGroup className="grid gap-4 md:grid-cols-3">
                            <Field data-invalid={hasFieldError('clientName')}>
                                <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="order-client-name">
                                    Cliente
                                </FieldLabel>
                                <Input
                                    aria-describedby="order-client-name-error"
                                    aria-invalid={hasFieldError('clientName')}
                                    className="rounded-xl bg-card shadow-none transition-colors focus-visible:bg-card"
                                    id="order-client-name"
                                    name="clientName"
                                    onChange={(event) => updateValue('clientName', event.target.value)}
                                    placeholder="Nombre y apellido"
                                    required
                                    value={draftValues.clientName}
                                />
                                <FieldError errors={errorsForField('clientName')} id="order-client-name-error" />
                            </Field>
                            <Field data-invalid={hasFieldError('teamName')}>
                                <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="order-team-name">
                                    Equipo
                                </FieldLabel>
                                <Input
                                    aria-describedby="order-team-name-error"
                                    aria-invalid={hasFieldError('teamName')}
                                    className="rounded-xl bg-card shadow-none transition-colors focus-visible:bg-card"
                                    id="order-team-name"
                                    name="teamName"
                                    onChange={(event) => updateValue('teamName', event.target.value)}
                                    placeholder="Club o equipo"
                                    required
                                    value={draftValues.teamName}
                                />
                                <FieldError errors={errorsForField('teamName')} id="order-team-name-error" />
                            </Field>
                            <Field data-invalid={hasFieldError('phone')}>
                                <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="order-phone">
                                    Teléfono
                                </FieldLabel>
                                <Input
                                    aria-describedby="order-phone-error"
                                    aria-invalid={hasFieldError('phone')}
                                    className="rounded-xl bg-card font-mono text-sm shadow-none transition-colors focus-visible:bg-card"
                                    id="order-phone"
                                    inputMode="tel"
                                    name="phone"
                                    onChange={(event) => updateValue('phone', event.target.value)}
                                    placeholder="11 5555 5555"
                                    required
                                    value={draftValues.phone}
                                />
                                <FieldError errors={errorsForField('phone')} id="order-phone-error" />
                            </Field>
                        </FieldGroup>
                    </Section>

                    <Section icon={CalendarDays} title="Fechas" hint="Ingreso y compromiso de entrega.">
                        <FieldGroup className="grid gap-4 md:grid-cols-2">
                            <Field data-invalid={hasFieldError('orderDate')}>
                                <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="order-date">
                                    Fecha del pedido
                                </FieldLabel>
                                <DatePickerField errorId="order-date-error" id="order-date" invalid={hasFieldError('orderDate')} label="la fecha del pedido" name="orderDate" onChange={(value) => updateValue('orderDate', value)} triggerLabel="Abrir calendario de ingreso" value={draftValues.orderDate} />
                                <FieldError errors={errorsForField('orderDate')} id="order-date-error" />
                            </Field>
                            <Field data-invalid={hasFieldError('promisedDeliveryDate')}>
                                <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="order-promised-date">
                                    Fecha prometida de entrega
                                </FieldLabel>
                                <DatePickerField
                                    id="order-promised-date"
                                    label="la fecha prometida de entrega"
                                    name="promisedDeliveryDate"
                                    errorId="order-promised-date-error"
                                    invalid={hasFieldError('promisedDeliveryDate')}
                                    onChange={(value) => updateValue('promisedDeliveryDate', value)}
                                    triggerLabel="Abrir calendario de entrega"
                                    value={draftValues.promisedDeliveryDate}
                                />
                                <FieldError errors={errorsForField('promisedDeliveryDate')} id="order-promised-date-error" />
                            </Field>
                        </FieldGroup>
                    </Section>

                    <OrderLineEditor catalogs={catalogs} error={errorsForField('lines')?.map((error) => error?.message).filter(Boolean).join(' ')} onEdit={() => clearFieldError('lines')} onSummaryChange={setLineSummary} />

                    <Section icon={Info} title="Descripción" hint="Indicaciones que no estén en las opciones.">
                        <Field data-invalid={hasFieldError('description')}>
                            <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="order-description">
                                Detalles adicionales <span className="font-normal text-muted-foreground">(opcional)</span>
                            </FieldLabel>
                            <Textarea
                                aria-describedby="order-description-error"
                                aria-invalid={hasFieldError('description')}
                                className="min-h-28 resize-none rounded-xl bg-card shadow-none transition-colors focus-visible:bg-card"
                                id="order-description"
                                name="description"
                                onChange={(event) => updateValue('description', event.target.value)}
                                placeholder="Ej. numeración del 1 al 24, escudo en pecho izquierdo."
                                rows={4}
                                value={draftValues.description}
                            />
                            <FieldError errors={errorsForField('description')} id="order-description-error" />
                            <FieldDescription className="flex items-center gap-1.5 text-xs">
                                <Info aria-hidden="true" className="size-3" />
                                Esta descripción acompaña la configuración estructurada.
                            </FieldDescription>
                        </Field>
                    </Section>

                    <Section icon={BadgeDollarSign} title="Importe total" hint="El pedido conserva un único importe total. No se cargan precios por renglón.">
                        <FieldGroup className="grid gap-4 md:grid-cols-2">
                            <Field data-invalid={hasFieldError('totalAmount')}>
                                <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="order-total-amount">
                                    Total del pedido
                                </FieldLabel>
                                <Input
                                    aria-describedby="order-total-error"
                                    aria-invalid={hasFieldError('totalAmount')}
                                    className="h-10 rounded-xl bg-card font-mono text-sm shadow-none transition-colors focus-visible:bg-card md:h-10"
                                    id="order-total-amount"
                                    inputMode="decimal"
                                    name="totalAmount"
                                    onChange={(event) => updateValue('totalAmount', event.target.value)}
                                    placeholder="$ 0,00"
                                    required
                                    type="text"
                                    value={draftValues.totalAmount}
                                />
                                <FieldError errors={errorsForField('totalAmount')} id="order-total-error" />
                            </Field>
                            <Field data-invalid={hasFieldError('depositAmount')}>
                                <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="order-deposit-amount">
                                    Monto de seña
                                </FieldLabel>
                                <Input
                                    aria-describedby="order-deposit-error"
                                    aria-invalid={hasFieldError('depositAmount')}
                                    className="h-10 rounded-xl bg-card font-mono text-sm shadow-none transition-colors focus-visible:bg-card md:h-10"
                                    id="order-deposit-amount"
                                    inputMode="decimal"
                                    name="depositAmount"
                                    onChange={(event) => updateValue('depositAmount', event.target.value)}
                                    placeholder="$ 0,00"
                                    required
                                    type="text"
                                    value={draftValues.depositAmount}
                                />
                                <FieldError errors={errorsForField('depositAmount')} id="order-deposit-error" />
                            </Field>
                        </FieldGroup>
                        <label className="mt-4 flex min-h-10 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm">
                            <input
                                checked={draftValues.depositPaid}
                                className="size-4 accent-primary"
                                name="depositPaid"
                                onChange={(event) => updateValue('depositPaid', event.target.checked)}
                                type="checkbox"
                                value="true"
                            />
                            Seña abonada
                            <span className="text-xs text-muted-foreground">no genera movimiento de caja</span>
                        </label>
                        <p className="mt-3 font-mono text-xs text-muted-foreground">
                            {total && deposit && balance
                                ? `Total ${formatArs(total)} · Seña ${formatArs(deposit)} · Saldo ${formatArs(balance)}`
                                : 'Completá importes válidos para ver el resumen.'}
                        </p>
                    </Section>

                    {state.status === 'error' ? (
                        <Alert className="rounded-xl border-destructive/30 bg-card p-4 shadow-xs" variant="destructive">
                            <AlertCircle aria-hidden="true" />
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <AlertTitle className="text-sm">Revisá los datos del pedido</AlertTitle>
                                <AlertDescription className="text-xs text-destructive/80">{state.message}</AlertDescription>
                            </div>
                        </Alert>
                    ) : null}
                </div>

                <aside className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-xs lg:sticky lg:top-6">
                    <div className="grid-paper relative px-5 py-5">
                        <p className="relative text-[11px] font-medium uppercase tracking-label text-muted-foreground">Saldo visible</p>
                        <p className="relative mt-2 font-mono text-2xl font-semibold tracking-tight text-foreground">{balance ? formatArs(balance) : formatArs('0')}</p>
                    </div>
                    <dl className="divide-y divide-border border-t border-border text-sm">
                        <SummaryRow label="Total del pedido" value={total ? formatArs(total) : formatArs('0')} />
                        <SummaryRow label="Seña" value={deposit ? formatArs(deposit) : formatArs('0')} badge={draftValues.depositPaid ? 'Pagada' : 'No pagada'} ok={draftValues.depositPaid} />
                        <SummaryRow icon={Layers} label="Renglones" value={String(lineSummary.lineCount)} />
                        <SummaryRow icon={Shirt} label="Unidades" value={String(lineSummary.unitCount)} />
                        <SummaryRow icon={CalendarDays} label="Entrega" value={draftValues.promisedDeliveryDate ? formatDate(draftValues.promisedDeliveryDate) : 'Sin definir'} />
                    </dl>
                    <div className="border-t border-border p-4">
                        <SubmitButton
                            className="group min-h-11 w-full rounded-xl px-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none md:min-h-10"
                            pendingLabel="Creando pedido">
                            <CircleCheck
                                aria-hidden="true"
                                className="size-4 transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none"
                                data-icon="inline-start"
                            />
                            Crear pedido
                        </SubmitButton>
                        <p className="mt-2 text-center text-[11px] text-muted-foreground">Se crea directamente en Pedido recibido.</p>
                    </div>
                </aside>
            </form>
        </>
    );
}

function DatePickerField({
    defaultValue = '',
    errorId,
    id,
    invalid = false,
    label,
    name,
    onChange,
    triggerLabel,
    value,
}: {
    defaultValue?: string;
    errorId?: string;
    id: string;
    invalid?: boolean;
    label: string;
    name: string;
    onChange?: (value: string) => void;
    triggerLabel: string;
    value?: string;
}) {
    const [internalValue, setInternalValue] = useState(defaultValue);
    const [open, setOpen] = useState(false);
    const fieldRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const selectedValue = value ?? internalValue;
    const selectedDate = dateFromInput(selectedValue);

    useEffect(() => {
        if (!open) return;

        function closeOnOutsidePointer(event: PointerEvent) {
            if (!fieldRef.current?.contains(event.target as Node)) setOpen(false);
        }

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key !== 'Escape') return;
            setOpen(false);
            window.requestAnimationFrame(() => triggerRef.current?.focus());
        }

        document.addEventListener('pointerdown', closeOnOutsidePointer);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsidePointer);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    function setDate(nextValue: string) {
        setInternalValue(nextValue);
        onChange?.(nextValue);
    }

    return (
        <div className="relative" ref={fieldRef}>
            <Input
                aria-describedby={errorId}
                aria-invalid={invalid}
                className="rounded-xl bg-card pr-10 font-mono text-sm shadow-none transition-colors focus-visible:bg-card [appearance:none] [&::-webkit-calendar-picker-indicator]:opacity-0"
                id={id}
                name={name}
                onChange={(event) => setDate(event.target.value)}
                ref={inputRef}
                required
                type="date"
                value={selectedValue}
            />
            <Button
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label={triggerLabel}
                className="absolute right-0 top-1/2 size-11 -translate-y-1/2 rounded-l-none text-muted-foreground hover:text-foreground md:size-10"
                onClick={() => setOpen((current) => !current)}
                ref={triggerRef}
                size="icon"
                type="button"
                variant="ghost">
                <CalendarDays aria-hidden="true" />
            </Button>
            {open ? (
                <div
                    aria-label={`Calendario para ${label}`}
                    className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-full max-w-[21rem] rounded-xl border border-border bg-card p-2 shadow-md"
                    role="dialog">
                    <Calendar
                        aria-label={`Calendario para ${label}`}
                        captionLayout="label"
                        className="w-full rounded-xl border-0 bg-card p-2 shadow-none"
                        defaultMonth={selectedDate ?? new Date()}
                        fixedWeeks
                        formatters={{
                            formatCaption: (date) => {
                                const label = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(date);
                                return label.charAt(0).toUpperCase() + label.slice(1);
                            },
                            formatWeekdayName: (date) => ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sá'][date.getDay()] ?? '',
                        }}
                        locale={es}
                        mode="single"
                        onSelect={(date) => {
                            if (!date) return;
                            setDate(dateToInput(date));
                            setOpen(false);
                            window.requestAnimationFrame(() => inputRef.current?.focus());
                        }}
                        selected={selectedDate}
                        showOutsideDays
                    />
                </div>
            ) : null}
        </div>
    );
}

function dateFromInput(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

function dateToInput(value: Date) {
    return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
}

function Section({ icon: Icon, title, hint, children }: { icon: LucideIcon; title: string; hint: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
            <header className="mb-5 flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
                    <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
                </div>
            </header>
            {children}
        </section>
    );
}

function SummaryRow({ icon: Icon, label, value, badge, ok }: { icon?: LucideIcon; label: string; value: string; badge?: string; ok?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
                {label}
            </dt>
            <dd className="flex min-w-0 items-center gap-2 text-right">
                {badge ? (
                    <span
                        className={ok ? 'rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success-foreground' : 'rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground'}>
                        {badge}
                    </span>
                ) : null}
                <span className="font-mono text-sm font-medium">{value}</span>
            </dd>
        </div>
    );
}
