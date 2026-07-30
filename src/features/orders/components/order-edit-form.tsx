"use client";

import { AlertCircle, CircleCheck } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMutationToast } from "@/hooks/use-mutation-toast";
import { compareMoney, normalizeMoney } from "@/lib/money/decimal";

import type { OrderDetail, OrderDetailCatalogs, OrderFinancials, OrderSelection } from "../detail-queries";
import { selectionsForEdit } from "../detail-format";
import { updateOrderAction, type UpdateOrderActionState } from "../detail-actions";

const initialState: UpdateOrderActionState = {};

type OrderType = "set" | "individual";
type IndividualLayer = "upper" | "lower";

type OrderSelectOption = {
  id: string;
  name: string;
  garmentLayer?: "upper" | "lower";
};

function safeMoney(value: number | string) {
  const text = typeof value === "number" ? value.toFixed(2) : value;
  if (!text.trim()) return null;
  try {
    return normalizeMoney(text);
  } catch {
    return null;
  }
}

function errorsFor(state: UpdateOrderActionState, field: string) {
  return state.fieldErrors?.[field]?.map((message) => ({ message }));
}

function OrderSelectField({
  disabled,
  errors,
  id,
  label,
  name,
  onValueChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  errors?: Array<{ message?: string }>;
  id: string;
  label: string;
  name: string;
  onValueChange: (value: string) => void;
  options: OrderSelectOption[];
  placeholder: string;
  value: string;
}) {
  const errorId = `${id}-error`;
  return (
    <Field data-invalid={Boolean(errors?.length)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select disabled={disabled || options.length === 0} name={name} onValueChange={onValueChange} value={value}>
        <SelectTrigger aria-describedby={errors?.length ? errorId : undefined} aria-invalid={Boolean(errors?.length)} id={id}>
          <SelectValue placeholder={options.length === 0 ? "Sin opciones disponibles" : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {options.length === 0 ? <FieldDescription>No hay opciones activas para seleccionar.</FieldDescription> : null}
      <FieldError errors={errors} id={errorId} />
    </Field>
  );
}

function FinancialSummary({ totalAmount, depositAmount, depositPaid }: { totalAmount: string; depositAmount: string; depositPaid: boolean }) {
  const total = safeMoney(totalAmount);
  const deposit = safeMoney(depositAmount);
  let balance: string | null = null;
  if (total && deposit && compareMoney(deposit, total) <= 0) {
    const balanceCents = moneyToCents(total) - moneyToCents(deposit);
    if (depositPaid) {
      balance = `${balanceCents / BigInt(100)}.${(balanceCents % BigInt(100)).toString().padStart(2, "0")}`;
    } else {
      balance = total;
    }
  }

  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <dt className="text-xs text-muted-foreground">Seña</dt>
        <dd className="mt-1 font-mono text-sm font-semibold">{deposit ? formatArs(deposit) : "Sin definir"}</dd>
        <p className="mt-1 text-xs text-muted-foreground">{depositPaid ? "Pagada" : "No pagada"}</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <dt className="text-xs text-muted-foreground">Total del pedido</dt>
        <dd className="mt-1 font-mono text-sm font-semibold">{total ? formatArs(total) : "Sin definir"}</dd>
      </div>
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <dt className="text-xs text-muted-foreground">Saldo visible</dt>
        <dd className="mt-1 font-mono text-sm font-semibold">{balance ? formatArs(balance) : "Se calcula al completar importes"}</dd>
      </div>
    </dl>
  );
}

function moneyToCents(value: string) {
  const normalized = normalizeMoney(value);
  const [integerPart, fractionPart] = normalized.split(".");
  return BigInt(integerPart) * BigInt(100) + BigInt(fractionPart);
}

function formatArs(value: string) {
  const [integerPart, fractionPart] = normalizeMoney(value).split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$ ${groupedInteger},${fractionPart}`;
}

export function OrderEditForm({
  action,
  catalogs,
  financials,
  order,
  selections,
}: {
  action: typeof updateOrderAction;
  catalogs: OrderDetailCatalogs;
  financials: OrderFinancials | null;
  order: OrderDetail;
  selections: OrderSelection[];
}) {
  const [state, formAction] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyInputRef = useRef<HTMLInputElement>(null);
  const initialSelection = selectionsForEdit(selections, catalogs);
  const [orderType, setOrderType] = useState<OrderType>(order.orderType);
  const [individualLayer, setIndividualLayer] = useState<IndividualLayer | "">(initialSelection.individualLayer);
  const [garmentUpperId, setGarmentUpperId] = useState(initialSelection.garmentUpperId);
  const [garmentLowerId, setGarmentLowerId] = useState(initialSelection.garmentLowerId);
  const [necklineId, setNecklineId] = useState(initialSelection.necklineId);
  const [upperPatternId, setUpperPatternId] = useState(initialSelection.upperPatternId);
  const [lowerPatternId, setLowerPatternId] = useState(initialSelection.lowerPatternId);
  const [fabricId, setFabricId] = useState(initialSelection.fabricId);
  const [extraIds, setExtraIds] = useState<string[]>(initialSelection.extraIds);
  const [totalAmount, setTotalAmount] = useState(() => financials?.totalAmount.toFixed(2) ?? "");
  const [depositAmount, setDepositAmount] = useState(() => financials?.depositAmount.toFixed(2) ?? "");
  const [depositPaid, setDepositPaid] = useState(() => financials?.depositPaid ?? false);
  useMutationToast(state);

  useEffect(() => {
    if (!state.toastId) return;
    if (state.status === "success") {
      if (idempotencyInputRef.current) {
        idempotencyInputRef.current.value = crypto.randomUUID();
      }
      return;
    }
    window.requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }, [state.status, state.toastId]);

  const hasUpperGarment = catalogs.garments.some((item) => item.garmentLayer === "upper");
  const hasLowerGarment = catalogs.garments.some((item) => item.garmentLayer === "lower");
  const requiredCatalogsReady = catalogs.fabrics.length > 0
    && (orderType === "set" ? hasUpperGarment && hasLowerGarment : individualLayer === "upper" ? hasUpperGarment : hasLowerGarment);
  const conditionalCatalogsReady = orderType === "set"
    ? catalogs.necklines.length > 0 && catalogs.upperPatterns.length > 0 && catalogs.lowerPatterns.length > 0
    : individualLayer === "upper"
      ? catalogs.necklines.length > 0 && catalogs.upperPatterns.length > 0
      : catalogs.lowerPatterns.length > 0;
  const canSubmit = requiredCatalogsReady && conditionalCatalogsReady;

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate ref={formRef}>
      <input name="orderId" type="hidden" value={order.id} />
      <input defaultValue={crypto.randomUUID()} name="idempotencyKey" ref={idempotencyInputRef} type="hidden" />
      <input name="expectedUpdatedAt" type="hidden" value={order.updatedAt} />
      <input name="orderDate" type="hidden" value={order.orderDate} />
      <input name="individualLayer" type="hidden" value={individualLayer === "" ? "" : individualLayer} />

      {!requiredCatalogsReady || !conditionalCatalogsReady ? (
        <Alert variant="default">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>
            Faltan opciones activas para completar este tipo de pedido. Un Admin o Super admin debe configurarlas desde Catálogos antes de continuar.
          </AlertDescription>
        </Alert>
      ) : null}

      <FieldSet>
        <FieldLegend>Datos generales</FieldLegend>
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field className="md:col-span-2" data-invalid={Boolean(errorsFor(state, "customerName")?.length)}>
            <FieldLabel htmlFor="edit-customer-name">Cliente o equipo</FieldLabel>
            <Input defaultValue={order.customerName} id="edit-customer-name" name="customerName" required />
            <FieldError errors={errorsFor(state, "customerName")} id="edit-customer-name-error" />
          </Field>
          <Field data-invalid={Boolean(errorsFor(state, "quantity")?.length)}>
            <FieldLabel htmlFor="edit-quantity">Cantidad total de unidades</FieldLabel>
            <Input defaultValue={order.quantity} id="edit-quantity" inputMode="numeric" min={1} name="quantity" required type="number" />
            <FieldError errors={errorsFor(state, "quantity")} id="edit-quantity-error" />
          </Field>
          <Field data-invalid={Boolean(errorsFor(state, "orderType")?.length)}>
            <FieldLabel htmlFor="edit-order-type">Tipo de pedido</FieldLabel>
            <Select name="orderType" onValueChange={(value) => { setOrderType(value as OrderType); setGarmentUpperId(""); setGarmentLowerId(""); setNecklineId(""); setUpperPatternId(""); setLowerPatternId(""); }} value={orderType}>
              <SelectTrigger id="edit-order-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="set">Conjunto</SelectItem>
                <SelectItem value="individual">Prenda individual</SelectItem>
              </SelectContent>
            </Select>
            <FieldError errors={errorsFor(state, "orderType")} id="edit-order-type-error" />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Fechas</FieldLegend>
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field data-invalid={Boolean(errorsFor(state, "promisedDeliveryDate")?.length)}>
            <FieldLabel htmlFor="edit-promised-date">Fecha prometida de entrega</FieldLabel>
            <Input defaultValue={order.promisedDeliveryDate} id="edit-promised-date" name="promisedDeliveryDate" required type="date" />
            <FieldError errors={errorsFor(state, "promisedDeliveryDate")} id="edit-promised-date-error" />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Especificaciones</FieldLegend>
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          {orderType === "individual" ? (
            <Field data-invalid={Boolean(errorsFor(state, "individualLayer")?.length)}>
              <FieldLabel htmlFor="edit-individual-layer">Tipo de prenda</FieldLabel>
              <Select name="individualLayer" onValueChange={(value) => { const layer = value as IndividualLayer; setIndividualLayer(layer); setGarmentUpperId(""); setGarmentLowerId(""); setNecklineId(""); setUpperPatternId(""); setLowerPatternId(""); }} value={individualLayer}>
                <SelectTrigger id="edit-individual-layer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="upper">Prenda superior</SelectItem>
                  <SelectItem value="lower">Prenda inferior</SelectItem>
                </SelectContent>
              </Select>
              <FieldError errors={errorsFor(state, "individualLayer")} id="edit-individual-layer-error" />
            </Field>
          ) : null}

          {orderType === "set" || individualLayer === "upper" ? (
            <OrderSelectField
              errors={errorsFor(state, "garmentUpperId")}
              id="edit-garment-upper"
              label="Prenda superior"
              name="garmentUpperId"
              onValueChange={setGarmentUpperId}
              options={catalogs.garments.filter((item) => item.garmentLayer === "upper")}
              placeholder="Elegí una prenda"
              value={garmentUpperId}
            />
          ) : null}
          {orderType === "set" || individualLayer === "lower" ? (
            <OrderSelectField
              errors={errorsFor(state, "garmentLowerId")}
              id="edit-garment-lower"
              label="Prenda inferior"
              name="garmentLowerId"
              onValueChange={setGarmentLowerId}
              options={catalogs.garments.filter((item) => item.garmentLayer === "lower")}
              placeholder="Elegí una prenda"
              value={garmentLowerId}
            />
          ) : null}
          {orderType === "set" || individualLayer === "upper" ? (
            <OrderSelectField
              errors={errorsFor(state, "necklineId")}
              id="edit-neckline"
              label="Cuello"
              name="necklineId"
              onValueChange={setNecklineId}
              options={catalogs.necklines}
              placeholder="Elegí un cuello"
              value={necklineId}
            />
          ) : null}
          {orderType === "set" || individualLayer === "upper" ? (
            <OrderSelectField
              errors={errorsFor(state, "upperPatternId")}
              id="edit-upper-pattern"
              label="Molde superior"
              name="upperPatternId"
              onValueChange={setUpperPatternId}
              options={catalogs.upperPatterns}
              placeholder="Elegí un molde"
              value={upperPatternId}
            />
          ) : null}
          {orderType === "set" || individualLayer === "lower" ? (
            <OrderSelectField
              errors={errorsFor(state, "lowerPatternId")}
              id="edit-lower-pattern"
              label="Molde de short/pollera"
              name="lowerPatternId"
              onValueChange={setLowerPatternId}
              options={catalogs.lowerPatterns}
              placeholder="Elegí un molde"
              value={lowerPatternId}
            />
          ) : null}
          <OrderSelectField
            errors={errorsFor(state, "fabricId")}
            id="edit-fabric"
            label="Tela"
            name="fabricId"
            onValueChange={setFabricId}
            options={catalogs.fabrics}
            placeholder="Elegí una tela"
            value={fabricId}
          />
        </FieldGroup>

        <Field className="mt-5" data-slot="checkbox-group">
          <FieldLabel>Extras</FieldLabel>
          <FieldDescription>Podés seleccionar más de un extra.</FieldDescription>
          {catalogs.extras.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {catalogs.extras.map((extra) => {
                const checked = extraIds.includes(extra.id);
                const id = `edit-extra-${extra.id}`;
                return (
                  <Field className="rounded-md border border-border p-3" key={extra.id} orientation="horizontal">
                    <Checkbox checked={checked} id={id} name="extraIds" onCheckedChange={(value) => setExtraIds((current) => value === true ? [...new Set([...current, extra.id])] : current.filter((idValue) => idValue !== extra.id))} value={extra.id} />
                    <FieldContent><FieldLabel htmlFor={id}>{extra.name}</FieldLabel></FieldContent>
                  </Field>
                );
              })}
            </div>
          ) : <p className="text-sm text-muted-foreground">No hay extras activos. Podés continuar sin extras.</p>}
        </Field>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Descripción</FieldLegend>
        <Field>
          <FieldLabel htmlFor="edit-description">Detalles adicionales</FieldLabel>
          <Textarea defaultValue={order.description ?? ""} id="edit-description" name="description" rows={4} />
        </Field>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Importes</FieldLegend>
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field data-invalid={Boolean(errorsFor(state, "totalAmount")?.length)}>
            <FieldLabel htmlFor="edit-total-amount">Precio total del pedido</FieldLabel>
            <Input id="edit-total-amount" inputMode="decimal" name="totalAmount" onChange={(event) => setTotalAmount(event.target.value)} placeholder="0,00" required type="text" value={totalAmount} />
            <FieldDescription>ARS, con hasta dos decimales.</FieldDescription>
            <FieldError errors={errorsFor(state, "totalAmount")} id="edit-total-amount-error" />
          </Field>
          <Field data-invalid={Boolean(errorsFor(state, "depositAmount")?.length)}>
            <FieldLabel htmlFor="edit-deposit-amount">Monto de seña</FieldLabel>
            <Input id="edit-deposit-amount" inputMode="decimal" name="depositAmount" onChange={(event) => setDepositAmount(event.target.value)} placeholder="0,00" required type="text" value={depositAmount} />
            <FieldDescription>Puede ser 0 y no puede superar el total.</FieldDescription>
            <FieldError errors={errorsFor(state, "depositAmount")} id="edit-deposit-amount-error" />
          </Field>
        </FieldGroup>
        <Field className="mt-5" orientation="horizontal">
          <input name="depositPaid" type="hidden" value="false" />
          <Checkbox checked={depositPaid} id="edit-deposit-paid" name="depositPaid" onCheckedChange={(value) => setDepositPaid(value === true)} value="true" />
          <FieldContent>
            <FieldLabel htmlFor="edit-deposit-paid">Seña abonada</FieldLabel>
            <FieldDescription>Es un dato informativo. No genera un movimiento de caja.</FieldDescription>
          </FieldContent>
        </Field>
        <div className="mt-5 border-t border-border pt-5">
          <p className="mb-3 text-sm font-semibold">Resumen financiero</p>
          <FinancialSummary depositAmount={depositAmount} depositPaid={depositPaid} totalAmount={totalAmount} />
        </div>
      </FieldSet>

      {state.status === "error" && !state.fieldErrors ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>No se pudo actualizar el pedido</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "success" ? (
        <Alert variant="success">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-xs leading-5 text-muted-foreground">Los cambios quedan registrados y requieren una versión actualizada del pedido.</p>
        <SubmitButton className="min-h-11 shrink-0 md:min-h-10" disabled={!canSubmit} pendingLabel="Guardando...">
          Guardar cambios
        </SubmitButton>
      </div>
    </form>
  );
}

