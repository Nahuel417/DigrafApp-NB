"use client";

import { AlertCircle, CircleCheck } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutationToast } from "@/hooks/use-mutation-toast";

import { createCatalogItemAction, type CatalogActionState } from "../actions";
import { catalogItemKindLabel, type CatalogItemKind } from "../schemas";

const initialState: CatalogActionState = {};

function errorsFor(state: CatalogActionState, field: string) {
  return state.fieldErrors?.[field]?.map((message) => ({ message }));
}

export function CatalogItemForm({ kind }: { kind: CatalogItemKind }) {
  const [state, formAction] = useActionState(createCatalogItemAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useMutationToast(state);

  useEffect(() => {
    if (!state.toastId) return;

    if (state.status === "success") {
      formRef.current?.reset();
      return;
    }

    window.requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }, [state.status, state.toastId]);

  const nameErrors = errorsFor(state, "name");
  const layerErrors = errorsFor(state, "garmentLayer");
  const layerId = `catalog-layer-${kind}`;
  const nameId = `catalog-name-${kind}`;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate ref={formRef}>
      <input name="kind" type="hidden" value={kind} readOnly />
      <FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.45fr)]">
        <Field data-invalid={Boolean(nameErrors?.length)}>
          <FieldLabel htmlFor={nameId}>Nombre de {catalogItemKindLabel(kind).toLowerCase()}</FieldLabel>
          <Input
            aria-describedby={nameErrors?.length ? `${nameId}-error` : undefined}
            aria-invalid={Boolean(nameErrors?.length)}
            id={nameId}
            name="name"
            required
          />
          <FieldError errors={nameErrors} id={`${nameId}-error`} />
        </Field>

        {kind === "garment" ? (
          <Field data-invalid={Boolean(layerErrors?.length)}>
            <FieldLabel htmlFor={layerId}>Clasificación</FieldLabel>
            <Select defaultValue="" key={state.resetKey ?? "initial"} name="garmentLayer">
              <SelectTrigger
                aria-describedby={layerErrors?.length ? `${layerId}-error` : undefined}
                aria-invalid={Boolean(layerErrors?.length)}
                id={layerId}
              >
                <SelectValue placeholder="Elegí una clasificación" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="upper">Prenda superior</SelectItem>
                  <SelectItem value="lower">Prenda inferior</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldError errors={layerErrors} id={`${layerId}-error`} />
          </Field>
        ) : (
          <input name="garmentLayer" type="hidden" value="" readOnly />
        )}
      </FieldGroup>

      {state.status === "error" && !state.fieldErrors ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "success" ? (
        <Alert variant="success">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <SubmitButton className="self-start min-h-11 md:min-h-10" pendingLabel="Guardando ítem">
        Agregar ítem
      </SubmitButton>
    </form>
  );
}
