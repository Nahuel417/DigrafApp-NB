"use client";

import { AlertCircle, CircleCheck, Info } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState, type RefObject } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { compareMoney, formatArs, normalizeMoney, visibleBalance } from "@/lib/money/decimal";

import { createOrderAction, type OrderActionState } from "../actions";
import type { OrderCatalogOption, OrderFormCatalogs } from "../queries";

const initialState: OrderActionState = {};

type OrderType = "set" | "individual";
type IndividualLayer = "upper" | "lower";

function errorsFor(state: OrderActionState, field: string) {
  return state.fieldErrors?.[field]?.map((message) => ({ message }));
}

function optionLabel(item: OrderCatalogOption) {
  return item.name;
}

function safeMoney(value: string) {
  if (!value.trim()) return null;
  try {
    return normalizeMoney(value);
  } catch {
    return null;
  }
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
  options: OrderCatalogOption[];
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
            <SelectItem key={option.id} value={option.id}>{optionLabel(option)}</SelectItem>
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
  const balance = total && deposit && compareMoney(deposit, total) <= 0 ? visibleBalance(total, deposit, depositPaid) : null;

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

function CreatedOrderSummary({ order, resultRef }: {
  order: NonNullable<OrderActionState["createdOrder"]>;
  resultRef: RefObject<HTMLDivElement | null>;
}) {
  const total = order.totalAmount;
  const deposit = order.depositAmount;
  const balance = visibleBalance(total, deposit, order.depositPaid);
  const orderNumber = `PED-${String(order.publicNumber).padStart(6, "0")}`;

  return (
    <div aria-live="polite" className="rounded-xl border border-primary/30 bg-success p-5 text-success-foreground" ref={resultRef} tabIndex={-1}>
      <div className="flex items-start gap-3">
        <CircleCheck aria-hidden="true" className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <h2 className="font-semibold">{orderNumber} creado</h2>
          <p className="mt-1 text-sm">El pedido quedó en la etapa Pedido recibido.</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 border-t border-success-foreground/20 pt-4 sm:grid-cols-4">
        <div><dt className="text-xs opacity-80">Seña</dt><dd className="mt-1 font-mono text-sm font-semibold">{order.depositPaid ? "Pagada" : "No pagada"}</dd></div>
        <div><dt className="text-xs opacity-80">Monto de seña</dt><dd className="mt-1 font-mono text-sm font-semibold">{formatArs(deposit)}</dd></div>
        <div><dt className="text-xs opacity-80">Total</dt><dd className="mt-1 font-mono text-sm font-semibold">{formatArs(total)}</dd></div>
        <div><dt className="text-xs opacity-80">Saldo visible</dt><dd className="mt-1 font-mono text-sm font-semibold">{formatArs(balance)}</dd></div>
      </dl>
      <p className="mt-4 text-xs opacity-80">La seña no genera un movimiento de caja. Al confirmar Pagado, caja registrará el total completo.</p>
    </div>
  );
}

export function CreateOrderForm({ catalogs, initialOrderDate }: { catalogs: OrderFormCatalogs; initialOrderDate: string }) {
  const [state, formAction] = useActionState(createOrderAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [orderType, setOrderType] = useState<OrderType>("set");
  const [individualLayer, setIndividualLayer] = useState<IndividualLayer>("upper");
  const [garmentUpperId, setGarmentUpperId] = useState("");
  const [garmentLowerId, setGarmentLowerId] = useState("");
  const [necklineId, setNecklineId] = useState("");
  const [upperPatternId, setUpperPatternId] = useState("");
  const [lowerPatternId, setLowerPatternId] = useState("");
  const [fabricId, setFabricId] = useState("");
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [totalAmount, setTotalAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPaid, setDepositPaid] = useState(false);
  useMutationToast(state);

  useEffect(() => {
    if (!state.toastId) return;

    if (state.status === "success") {
      formRef.current?.reset();
      startTransition(() => {
        setIdempotencyKey(crypto.randomUUID());
        setOrderType("set");
        setIndividualLayer("upper");
        setGarmentUpperId("");
        setGarmentLowerId("");
        setNecklineId("");
        setUpperPatternId("");
        setLowerPatternId("");
        setFabricId("");
        setExtraIds([]);
        setTotalAmount("");
        setDepositAmount("");
        setDepositPaid(false);
      });
      window.requestAnimationFrame(() => resultRef.current?.focus());
      return;
    }

    window.requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }, [state.status, state.toastId]);

  const hasUpperGarment = catalogs.garments.some((item) => item.garment_layer === "upper");
  const hasLowerGarment = catalogs.garments.some((item) => item.garment_layer === "lower");
  const requiredCatalogsReady = catalogs.fabrics.length > 0
    && (orderType === "set" ? hasUpperGarment && hasLowerGarment : individualLayer === "upper" ? hasUpperGarment : hasLowerGarment);
  const conditionalCatalogsReady = orderType === "set"
    ? catalogs.necklines.length > 0 && catalogs.upperPatterns.length > 0 && catalogs.lowerPatterns.length > 0
    : individualLayer === "upper"
      ? catalogs.necklines.length > 0 && catalogs.upperPatterns.length > 0
      : catalogs.lowerPatterns.length > 0;
  const canSubmit = requiredCatalogsReady && conditionalCatalogsReady;
  const customerErrors = errorsFor(state, "customerName");
  const quantityErrors = errorsFor(state, "quantity");
  const orderTypeErrors = errorsFor(state, "orderType");
  const orderDateErrors = errorsFor(state, "orderDate");
  const promisedDateErrors = errorsFor(state, "promisedDeliveryDate");
  const individualLayerErrors = errorsFor(state, "individualLayer");
  const totalErrors = errorsFor(state, "totalAmount");
  const depositErrors = errorsFor(state, "depositAmount");

  return (
    <>
      {state.createdOrder ? (
        <CreatedOrderSummary order={state.createdOrder} resultRef={resultRef} />
      ) : null}

      {!requiredCatalogsReady || !conditionalCatalogsReady ? (
        <Alert variant="default">
          <Info aria-hidden="true" />
          <AlertDescription>
            Faltan opciones activas para completar este tipo de pedido. Un Admin o Super admin debe configurarlas desde Catálogos antes de continuar.
          </AlertDescription>
        </Alert>
      ) : null}

      <form
        action={formAction}
        className="overflow-hidden rounded-xl border border-border bg-card shadow-xs"
        noValidate
        ref={formRef}
      >
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} readOnly />
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">Datos del pedido</h2>
          <p className="mt-1 text-sm text-muted-foreground">Completá la información operativa que ingresa a producción.</p>
        </div>

        <div className="flex flex-col gap-7 p-5">
          <FieldSet>
            <FieldLegend>Datos generales</FieldLegend>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field className="md:col-span-2" data-invalid={Boolean(customerErrors?.length)}>
                <FieldLabel htmlFor="order-customer-name">Cliente o equipo</FieldLabel>
                <Input aria-describedby={customerErrors?.length ? "order-customer-name-error" : undefined} aria-invalid={Boolean(customerErrors?.length)} id="order-customer-name" name="customerName" required />
                <FieldError errors={customerErrors} id="order-customer-name-error" />
              </Field>
              <Field data-invalid={Boolean(quantityErrors?.length)}>
                <FieldLabel htmlFor="order-quantity">Cantidad total de unidades</FieldLabel>
                <Input aria-describedby={quantityErrors?.length ? "order-quantity-error" : undefined} aria-invalid={Boolean(quantityErrors?.length)} id="order-quantity" inputMode="numeric" min={1} name="quantity" required type="number" />
                <FieldError errors={quantityErrors} id="order-quantity-error" />
              </Field>
              <Field data-invalid={Boolean(orderTypeErrors?.length)}>
                <FieldLabel htmlFor="order-type">Tipo de pedido</FieldLabel>
                <Select name="orderType" onValueChange={(value) => { setOrderType(value as OrderType); setGarmentUpperId(""); setGarmentLowerId(""); setNecklineId(""); setUpperPatternId(""); setLowerPatternId(""); }} value={orderType}>
                  <SelectTrigger aria-describedby={orderTypeErrors?.length ? "order-type-error" : undefined} aria-invalid={Boolean(orderTypeErrors?.length)} id="order-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="set">Conjunto</SelectItem>
                    <SelectItem value="individual">Prenda individual</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError errors={orderTypeErrors} id="order-type-error" />
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Fechas</FieldLegend>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={Boolean(orderDateErrors?.length)}>
                <FieldLabel htmlFor="order-date">Fecha del pedido</FieldLabel>
                <Input aria-describedby={orderDateErrors?.length ? "order-date-error" : undefined} aria-invalid={Boolean(orderDateErrors?.length)} defaultValue={initialOrderDate} id="order-date" name="orderDate" required type="date" />
                <FieldError errors={orderDateErrors} id="order-date-error" />
              </Field>
              <Field data-invalid={Boolean(promisedDateErrors?.length)}>
                <FieldLabel htmlFor="order-promised-date">Fecha prometida de entrega</FieldLabel>
                <Input aria-describedby={promisedDateErrors?.length ? "order-promised-date-error" : undefined} aria-invalid={Boolean(promisedDateErrors?.length)} id="order-promised-date" name="promisedDeliveryDate" required type="date" />
                <FieldError errors={promisedDateErrors} id="order-promised-date-error" />
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Especificaciones</FieldLegend>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              {orderType === "individual" ? (
                <Field data-invalid={Boolean(individualLayerErrors?.length)}>
                  <FieldLabel htmlFor="order-individual-layer">Tipo de prenda</FieldLabel>
                  <Select name="individualLayer" onValueChange={(value) => { const layer = value as IndividualLayer; setIndividualLayer(layer); setGarmentUpperId(""); setGarmentLowerId(""); setNecklineId(""); setUpperPatternId(""); setLowerPatternId(""); }} value={individualLayer}>
                    <SelectTrigger aria-describedby={individualLayerErrors?.length ? "order-individual-layer-error" : undefined} aria-invalid={Boolean(individualLayerErrors?.length)} id="order-individual-layer"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="upper">Prenda superior</SelectItem><SelectItem value="lower">Prenda inferior</SelectItem></SelectContent>
                  </Select>
                  <FieldError errors={individualLayerErrors} id="order-individual-layer-error" />
                </Field>
              ) : null}

              {orderType === "set" || individualLayer === "upper" ? (
                <OrderSelectField errors={errorsFor(state, "garmentUpperId")} id="order-garment-upper" label="Prenda superior" name="garmentUpperId" onValueChange={setGarmentUpperId} options={catalogs.garments.filter((item) => item.garment_layer === "upper")} placeholder="Elegí una prenda" value={garmentUpperId} />
              ) : null}
              {orderType === "set" || individualLayer === "lower" ? (
                <OrderSelectField errors={errorsFor(state, "garmentLowerId")} id="order-garment-lower" label="Prenda inferior" name="garmentLowerId" onValueChange={setGarmentLowerId} options={catalogs.garments.filter((item) => item.garment_layer === "lower")} placeholder="Elegí una prenda" value={garmentLowerId} />
              ) : null}
              {orderType === "set" || individualLayer === "upper" ? (
                <OrderSelectField errors={errorsFor(state, "necklineId")} id="order-neckline" label="Cuello" name="necklineId" onValueChange={setNecklineId} options={catalogs.necklines} placeholder="Elegí un cuello" value={necklineId} />
              ) : null}
              {orderType === "set" || individualLayer === "upper" ? (
                <OrderSelectField errors={errorsFor(state, "upperPatternId")} id="order-upper-pattern" label="Molde superior" name="upperPatternId" onValueChange={setUpperPatternId} options={catalogs.upperPatterns} placeholder="Elegí un molde" value={upperPatternId} />
              ) : null}
              {orderType === "set" || individualLayer === "lower" ? (
                <OrderSelectField errors={errorsFor(state, "lowerPatternId")} id="order-lower-pattern" label="Molde de short/pollera" name="lowerPatternId" onValueChange={setLowerPatternId} options={catalogs.lowerPatterns} placeholder="Elegí un molde" value={lowerPatternId} />
              ) : null}
              <OrderSelectField errors={errorsFor(state, "fabricId")} id="order-fabric" label="Tela" name="fabricId" onValueChange={setFabricId} options={catalogs.fabrics} placeholder="Elegí una tela" value={fabricId} />
            </FieldGroup>

            <Field className="mt-5" data-slot="checkbox-group">
              <FieldLabel>Extras</FieldLabel>
              <FieldDescription>Podés seleccionar más de un extra.</FieldDescription>
              {catalogs.extras.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {catalogs.extras.map((extra) => {
                    const checked = extraIds.includes(extra.id);
                    const id = `order-extra-${extra.id}`;
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
              <FieldLabel htmlFor="order-description">Detalles adicionales</FieldLabel>
              <Textarea id="order-description" name="description" placeholder="Anotá indicaciones que no estén en las especificaciones." rows={5} />
              <FieldDescription>Esta descripción no reemplaza los datos estructurados del pedido.</FieldDescription>
            </Field>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Importes</FieldLegend>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={Boolean(totalErrors?.length)}>
                <FieldLabel htmlFor="order-total-amount">Precio total del pedido</FieldLabel>
                <Input aria-describedby={totalErrors?.length ? "order-total-amount-error" : undefined} aria-invalid={Boolean(totalErrors?.length)} id="order-total-amount" inputMode="decimal" name="totalAmount" onChange={(event) => setTotalAmount(event.target.value)} placeholder="0,00" required type="text" value={totalAmount} />
                <FieldDescription>ARS, con hasta dos decimales.</FieldDescription>
                <FieldError errors={totalErrors} id="order-total-amount-error" />
              </Field>
              <Field data-invalid={Boolean(depositErrors?.length)}>
                <FieldLabel htmlFor="order-deposit-amount">Monto de seña</FieldLabel>
                <Input aria-describedby={depositErrors?.length ? "order-deposit-amount-error" : undefined} aria-invalid={Boolean(depositErrors?.length)} id="order-deposit-amount" inputMode="decimal" name="depositAmount" onChange={(event) => setDepositAmount(event.target.value)} placeholder="0,00" required type="text" value={depositAmount} />
                <FieldDescription>Puede ser 0 y no puede superar el total.</FieldDescription>
                <FieldError errors={depositErrors} id="order-deposit-amount-error" />
              </Field>
            </FieldGroup>
            <Field className="mt-5" orientation="horizontal">
              <Checkbox checked={depositPaid} id="order-deposit-paid" name="depositPaid" onCheckedChange={(value) => setDepositPaid(value === true)} value="true" />
              <FieldContent>
                <FieldLabel htmlFor="order-deposit-paid">Seña abonada</FieldLabel>
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
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          {state.status === "success" && !state.createdOrder ? (
            <Alert variant="success">
              <CircleCheck aria-hidden="true" />
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-xs leading-5 text-muted-foreground">El pedido se crea directamente en Pedido recibido. Los datos sensibles se validan nuevamente en el servidor.</p>
            <SubmitButton className="min-h-11 shrink-0 md:min-h-10" disabled={!canSubmit} pendingLabel="Creando pedido">
              Crear pedido
            </SubmitButton>
          </div>
        </div>
      </form>
    </>
  );
}
