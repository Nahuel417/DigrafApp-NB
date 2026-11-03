"use client";

import { useActionState, useEffect, useRef, useState, type ClipboardEventHandler, type DragEventHandler, type FormEvent, type FormEventHandler, type KeyboardEventHandler } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMutationToast } from "@/hooks/use-mutation-toast";
import { canInsertCashAmount, formatArs, normalizeMoney } from "@/lib/money/decimal";

import { executeStockOperationAction, type StockActionState } from "../actions";
import { canInsertStockQuantity, stockQuantityInputPattern, type StockOperation } from "../schemas";

type StockOperationKind = StockOperation["action"];

type StockOperationFormProps = {
  action: StockOperationKind;
  active?: boolean;
  allowMovementSelection?: boolean;
  availableQuantity?: number;
  initialDate: string;
  initialKey: string;
  itemId?: string;
  itemName?: string;
  movementId?: string;
  movementLabel?: string;
};

const initialState: StockActionState = {};

function fieldErrors(state: StockActionState, field: string) {
  return state.fieldErrors?.[field]?.map((message) => ({ message }));
}

function InputField({
  describedBy,
  defaultValue,
  id,
  inputMode,
  label,
  max,
  name,
  pattern,
  required = true,
  type = "text",
  errorMessage,
  className,
  min,
  onChange,
  onKeyDown,
  onPaste,
  onDrop,
  onBeforeInput,
  value,
}: {
  describedBy?: string;
  defaultValue?: string;
  id: string;
  inputMode?: "decimal" | "text";
  label: string;
  max?: string;
  min?: string;
  name: string;
  pattern?: string;
  required?: boolean;
  type?: "date" | "text";
  errorMessage?: string;
  className?: string;
  onChange?: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onPaste?: ClipboardEventHandler<HTMLInputElement>;
  onDrop?: DragEventHandler<HTMLInputElement>;
  onBeforeInput?: FormEventHandler<HTMLInputElement>;
  value?: string;
}) {
  if (type === "date") {
    return (
      <Field data-invalid={Boolean(errorMessage)}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <DatePickerField
          className={className}
          defaultValue={defaultValue}
          errorId={describedBy}
          id={id}
          invalid={Boolean(errorMessage)}
          label={label}
          max={max}
          min={min}
          name={name}
          onChange={onChange}
          required={required}
          triggerLabel={`Abrir calendario para ${label}`}
          value={value}
        />
        <FieldError errors={errorMessage ? [{ message: errorMessage }] : undefined} id={describedBy} />
      </Field>
    );
  }

  return (
    <Field data-invalid={Boolean(errorMessage)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        aria-describedby={errorMessage ? describedBy : undefined}
        aria-invalid={Boolean(errorMessage)}
        className={className}
        defaultValue={defaultValue}
        id={id}
        inputMode={inputMode}
        max={max}
        name={name}
        onBeforeInput={onBeforeInput}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        onDrop={onDrop}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        pattern={pattern}
        required={required}
        type={type}
        value={value}
      />
      <FieldError errors={errorMessage ? [{ message: errorMessage }] : undefined} id={describedBy} />
    </Field>
  );
}

function operationLabel(action: StockOperationKind, active?: boolean) {
  switch (action) {
    case "create": return "Agregar material";
    case "purchase": return "Registrar compra";
    case "consumption": return "Registrar salida";
    case "cancel": return "Anular movimiento";
    case "rename": return "Guardar nombre";
    case "activate": return active ? "Reactivar tela" : "Desactivar tela";
  }
}

function pendingLabel(action: StockOperationKind) {
  switch (action) {
    case "create": return "Agregando material";
    case "purchase": return "Registrando compra";
    case "consumption": return "Registrando salida";
    case "cancel": return "Anulando movimiento";
    case "rename": return "Guardando nombre";
    case "activate": return "Actualizando estado";
  }
}

function confirmation(action: StockOperationKind, form: HTMLFormElement, itemName?: string, movementLabel?: string) {
  const data = new FormData(form);
  const name = String(data.get("name") ?? itemName ?? "la tela");
  const quantity = String(data.get("quantity") ?? "");
  const date = String(data.get("date") ?? "").split("-").reverse().join("/");
  switch (action) {
    case "create": {
      let price = String(data.get("price") ?? "");
      try { price = formatArs(normalizeMoney(price)); } catch { /* The server reports invalid values after confirmation. */ }
      return `Agregarás ${name} con una cantidad de ${quantity} rollos al ${date} y un precio de ${price} por rollo.`;
    }
    case "purchase": {
      let price = String(data.get("price") ?? "");
      try { price = formatArs(normalizeMoney(price)); } catch { /* The server reports invalid values after confirmation. */ }
      return `Sumarás ${quantity} rollos de ${itemName} con fecha ${date} y un precio de ${price} por rollo. La compra no modifica Caja.`;
    }
    case "consumption":
      return `Registrarás la salida de ${quantity} rollos de ${itemName} con fecha ${date}. La salida no modifica Caja ni pedidos.`;
    case "cancel":
      return `Anularás ${movementLabel ?? "este movimiento"} de ${itemName}. El saldo se revertirá solo si no queda negativo; el motivo se conservará en el historial.`;
    case "rename":
      return `Cambiarás el nombre de ${itemName} a ${name}. El historial se conserva.`;
    case "activate":
      return activeText(data.get("active") === "true", itemName);
  }
}

function activeText(active: boolean, itemName?: string) {
  return active ? `Reactivarás ${itemName}.` : `Desactivarás ${itemName}; el saldo debe ser cero.`;
}

export function StockOperationForm({
  action,
  active = false,
  allowMovementSelection = false,
  availableQuantity = 0,
  initialDate,
  initialKey,
  itemId,
  itemName,
  movementId,
  movementLabel,
}: StockOperationFormProps) {
  const [state, formAction, isPending] = useActionState(executeStockOperationAction, initialState);
  const [selectedAction, setSelectedAction] = useState<"purchase" | "consumption">(action === "consumption" ? "consumption" : "purchase");
  const [quantityValue, setQuantityValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef(false);
  const queuedRef = useRef(false);
  useMutationToast(state);

  useEffect(() => {
    if (state.status !== "error" || !state.toastId) return;
    window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.status, state.toastId]);

  const adaptiveMovement = allowMovementSelection && (action === "purchase" || action === "consumption");
  const operation = adaptiveMovement ? selectedAction : action;
  const prefix = `stock-${operation}-${itemId ?? "new"}-${movementId ?? ""}`;
  const errors = (field: string) => fieldErrors(state, field);
  const error = (field: string) => errors(field)?.[0]?.message;
  const submitLabel = operationLabel(operation, active);
  const destructive = operation === "cancel" || (operation === "activate" && !active);
  const parsedQuantity = /^[0-9]{1,12}(?:[.,](?:0|5))?$/.test(quantityValue) ? Number(quantityValue.replace(",", ".")) : null;
  const quantityLabel = operation === "purchase" ? "Cantidad comprada (rollos)" : "Cantidad consumida (rollos)";
  const balanceEffect = parsedQuantity === null ? null : (operation === "purchase" ? parsedQuantity : -parsedQuantity);
  const resultingBalance = balanceEffect === null ? null : availableQuantity + balanceEffect;

  function validatePriceInsertion(input: HTMLInputElement, inserted: string, event: { preventDefault: () => void }) {
    if (!canInsertCashAmount(input.value, inserted, input.selectionStart, input.selectionEnd)) event.preventDefault();
  }

  function priceKeyDown(event: Parameters<KeyboardEventHandler<HTMLInputElement>>[0]) {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    validatePriceInsertion(event.currentTarget, event.key, event);
  }

  function pricePaste(event: Parameters<ClipboardEventHandler<HTMLInputElement>>[0]) {
    validatePriceInsertion(event.currentTarget, event.clipboardData.getData("text"), event);
  }

  function priceDrop(event: Parameters<DragEventHandler<HTMLInputElement>>[0]) {
    validatePriceInsertion(event.currentTarget, event.dataTransfer.getData("text"), event);
  }

  function priceBeforeInput(event: FormEvent<HTMLInputElement>) {
    const inputEvent = event.nativeEvent as InputEvent;
    if (inputEvent.inputType?.startsWith("delete")) return;
    if (inputEvent.data) validatePriceInsertion(event.currentTarget, inputEvent.data, event);
  }

  function validateQuantityInsertion(input: HTMLInputElement, inserted: string, event: { preventDefault: () => void }) {
    if (!canInsertStockQuantity(input.value, inserted, input.selectionStart, input.selectionEnd)) event.preventDefault();
  }

  function quantityKeyDown(event: Parameters<KeyboardEventHandler<HTMLInputElement>>[0]) {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    validateQuantityInsertion(event.currentTarget, event.key, event);
  }

  function quantityPaste(event: Parameters<ClipboardEventHandler<HTMLInputElement>>[0]) {
    validateQuantityInsertion(event.currentTarget, event.clipboardData.getData("text"), event);
  }

  function quantityDrop(event: Parameters<DragEventHandler<HTMLInputElement>>[0]) {
    validateQuantityInsertion(event.currentTarget, event.dataTransfer.getData("text"), event);
  }

  function quantityBeforeInput(event: FormEvent<HTMLInputElement>) {
    const inputEvent = event.nativeEvent as InputEvent;
    if (inputEvent.inputType?.startsWith("delete")) return;
    if (inputEvent.data) validateQuantityInsertion(event.currentTarget, inputEvent.data, event);
  }

  function requestConfirmation(event: FormEvent<HTMLFormElement>) {
    if (confirmedRef.current) {
      confirmedRef.current = false;
      return;
    }
    event.preventDefault();
    setConfirmationText(confirmation(operation, event.currentTarget, itemName, movementLabel));
    setIsOpen(true);
  }

  function confirmOperation() {
    if (queuedRef.current) return;
    queuedRef.current = true;
    confirmedRef.current = true;
    setIsOpen(false);
    window.requestAnimationFrame(() => {
      formRef.current?.requestSubmit();
      queuedRef.current = false;
    });
  }

  return (
    <>
      <form
        action={formAction}
        aria-busy={isPending}
        className="flex flex-col gap-4"
        key={state.resetKey ?? initialKey}
        noValidate
        onSubmit={requestConfirmation}
        ref={formRef}
      >
        <input name="action" type="hidden" value={operation} readOnly />
        <input name="idempotencyKey" type="hidden" value={state.resetKey ?? initialKey} readOnly />
        {itemId ? <input name="itemId" type="hidden" value={itemId} readOnly /> : null}
        {movementId ? <input name="movementId" type="hidden" value={movementId} readOnly /> : null}
        {operation === "create" ? (
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <InputField describedBy={`${prefix}-name-error`} errorMessage={error("name")} id={`${prefix}-name`} label="Nombre del material" name="name" />
            <InputField describedBy={`${prefix}-quantity-error`} defaultValue="0" errorMessage={error("quantity")} id={`${prefix}-quantity`} inputMode="decimal" label="Cantidad (rollos)" name="quantity" onBeforeInput={quantityBeforeInput} onDrop={quantityDrop} onKeyDown={quantityKeyDown} onPaste={quantityPaste} pattern={stockQuantityInputPattern} />
            <InputField describedBy={`${prefix}-price-error`} errorMessage={error("price")} id={`${prefix}-price`} inputMode="decimal" label="Precio por rollo (ARS)" name="price" onBeforeInput={priceBeforeInput} onDrop={priceDrop} onKeyDown={priceKeyDown} onPaste={pricePaste} pattern="[0-9]{1,12}([.,][0-9]{1,2})?" />
            <InputField describedBy={`${prefix}-date-error`} defaultValue={initialDate} errorMessage={error("date")} id={`${prefix}-date`} label="Fecha" max={initialDate} name="date" type="date" />
          </FieldGroup>
        ) : null}
        {operation === "purchase" || operation === "consumption" ? (
          <>
          {adaptiveMovement ? (
            <Field className="max-w-sm">
              <FieldLabel htmlFor={`${prefix}-kind`}>Tipo de movimiento</FieldLabel>
              <Select onValueChange={(value) => setSelectedAction(value as "purchase" | "consumption")} value={operation}>
                <SelectTrigger id={`${prefix}-kind`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Compra</SelectItem>
                  <SelectItem value="consumption">Consumo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <FieldGroup className={operation === "purchase" ? "grid gap-4 sm:grid-cols-3" : "grid gap-4 sm:grid-cols-2"}>
            <InputField describedBy={`${prefix}-quantity-error`} errorMessage={error("quantity")} id={`${prefix}-quantity`} inputMode="decimal" label={quantityLabel} name="quantity" onBeforeInput={quantityBeforeInput} onChange={setQuantityValue} onDrop={quantityDrop} onKeyDown={quantityKeyDown} onPaste={quantityPaste} pattern={stockQuantityInputPattern} value={quantityValue} />
            <InputField describedBy={`${prefix}-date-error`} defaultValue={initialDate} errorMessage={error("date")} id={`${prefix}-date`} label={operation === "purchase" ? "Fecha de compra" : "Fecha de salida"} max={initialDate} name="date" type="date" />
            {operation === "purchase" ? <InputField describedBy={`${prefix}-price-error`} errorMessage={error("price")} id={`${prefix}-price`} inputMode="decimal" label="Precio por rollo (ARS)" name="price" onBeforeInput={priceBeforeInput} onDrop={priceDrop} onKeyDown={priceKeyDown} onPaste={pricePaste} pattern="[0-9]{1,12}([.,][0-9]{1,2})?" /> : null}
          </FieldGroup>
          {adaptiveMovement ? (
            <div aria-live="polite" className="text-sm text-muted-foreground">
              <p>Saldo disponible: {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(availableQuantity)} rollos</p>
              {balanceEffect === null ? <p>Ingresá una cantidad válida para ver el efecto en saldo.</p> : (
                <p>Efecto en saldo: {balanceEffect > 0 ? "+" : "−"}{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(Math.abs(balanceEffect))} rollos · saldo resultante: {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(resultingBalance)} rollos</p>
              )}
              {resultingBalance !== null && resultingBalance < 0 ? <p className="text-destructive">El saldo no puede quedar negativo; no se registrará la salida.</p> : null}
            </div>
          ) : null}
          </>
        ) : null}
        {operation === "rename" ? (
          <InputField describedBy={`${prefix}-name-error`} defaultValue={itemName} errorMessage={error("name")} id={`${prefix}-name`} label="Nombre del material" name="name" />
        ) : null}
        {operation === "cancel" ? (
          <Field data-invalid={Boolean(error("reason"))}>
            <FieldLabel htmlFor={`${prefix}-reason`}>Motivo de anulación</FieldLabel>
            <Textarea aria-describedby={`${prefix}-reason-error`} aria-invalid={Boolean(error("reason"))} id={`${prefix}-reason`} name="reason" required />
            <FieldError errors={errors("reason")} id={`${prefix}-reason-error`} />
          </Field>
        ) : null}
        {operation === "activate" ? <input name="active" type="hidden" value={active ? "true" : "false"} readOnly /> : null}
        <Button className="min-h-11 self-start md:min-h-10" disabled={isPending} type="submit" variant={destructive ? "destructive" : "default"}>
          {isPending ? pendingLabel(operation) : submitLabel}
        </Button>
      </form>

      <AlertDialog onOpenChange={setIsOpen} open={isOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{submitLabel}</AlertDialogTitle>
            <AlertDialogDescription>{confirmationText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={confirmOperation} variant={destructive ? "destructive" : "default"}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
