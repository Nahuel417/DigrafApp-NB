"use client";

import { AlertCircle, CircleCheck, Plus } from "lucide-react";
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
      <FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(14rem,0.55fr)]">
        <Field data-invalid={Boolean(nameErrors?.length)}>
          <FieldLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground" htmlFor={nameId}>
            Nombre de {catalogItemKindLabel(kind).toLowerCase()}
          </FieldLabel>
          <Input
            aria-describedby={nameErrors?.length ? `${nameId}-error` : undefined}
            aria-invalid={Boolean(nameErrors?.length)}
            id={nameId}
            name="name"
            placeholder={kind === "garment" ? "Ej. prenda" : undefined}
            required
            className="h-9 rounded-full border-border bg-muted/40 px-4 text-xs shadow-none transition-colors duration-200 focus-visible:border-primary/40 focus-visible:bg-card focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:ring-offset-0 md:h-9"
          />
          <FieldError errors={nameErrors} id={`${nameId}-error`} />
        </Field>

        {kind === "garment" ? (
          <Field data-invalid={Boolean(layerErrors?.length)}>
            <FieldLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground" htmlFor={layerId}>
              Clasificación
            </FieldLabel>
            <Select defaultValue="" key={state.resetKey ?? "initial"} name="garmentLayer">
              <SelectTrigger
                aria-describedby={layerErrors?.length ? `${layerId}-error` : undefined}
                aria-invalid={Boolean(layerErrors?.length)}
                className="h-9 rounded-full border-border bg-muted/40 px-4 text-xs shadow-none transition-colors duration-200 focus-visible:border-primary/40 focus-visible:bg-card focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:ring-offset-0 md:h-9"
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
        <Alert className="rounded-xl" variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="group self-start min-h-11 rounded-xl px-4 shadow-xs transition-all duration-200 hover:shadow-md active:scale-[0.98] md:min-h-10" pendingLabel="Guardando ítem">
          <Plus aria-hidden="true" className="transition-transform duration-200 group-hover:rotate-90" data-icon="inline-start" />
          Agregar ítem
        </SubmitButton>
        {state.status === "success" ? (
          <span
            aria-label={state.message ?? "Guardado correctamente"}
            aria-live="polite"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground"
            role="status"
            title={state.message ?? "Guardado correctamente"}
          >
            <CircleCheck aria-hidden="true" className="size-4" />
          </span>
        ) : null}
      </div>
    </form>
  );
}
