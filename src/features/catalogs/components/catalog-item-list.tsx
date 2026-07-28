"use client";

import { AlertCircle, CircleCheck } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";

import { SubmitButton } from "@/components/submit-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useMutationToast } from "@/hooks/use-mutation-toast";

import {
  renameCatalogItemAction,
  deleteCatalogItemAction,
  type CatalogActionState,
} from "../actions";
import {
  catalogItemKindLabel,
  garmentLayerLabels,
  type CatalogItemKind,
} from "../schemas";
import type { CatalogItem } from "../queries";

const initialState: CatalogActionState = {};

function errorsFor(state: CatalogActionState, field: string) {
  return state.fieldErrors?.[field]?.map((message) => ({ message }));
}

function RenameCatalogItemForm({ item }: { item: CatalogItem }) {
  const [state, formAction] = useActionState(renameCatalogItemAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useMutationToast(state);
  const nameId = `rename-catalog-item-${item.id}`;
  const errors = errorsFor(state, "name");

  useEffect(() => {
    if (!state.toastId) return;
    if (state.status === "error") {
      window.requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
    }
  }, [state.status, state.toastId]);

  return (
    <form action={formAction} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end" noValidate ref={formRef}>
      <input name="itemId" type="hidden" value={item.id} readOnly />
      <Field className="min-w-0 flex-1" data-invalid={Boolean(errors?.length)}>
        <FieldLabel className="sr-only" htmlFor={nameId}>Nombre de {item.name}</FieldLabel>
        <Input
          aria-describedby={errors?.length ? `${nameId}-error` : undefined}
          aria-invalid={Boolean(errors?.length)}
          defaultValue={item.name}
          id={nameId}
          name="name"
        />
        <FieldError errors={errors} id={`${nameId}-error`} />
      </Field>
      <SubmitButton className="min-h-11 shrink-0 md:min-h-10" pendingLabel="Guardando" variant="outline">
        Renombrar
      </SubmitButton>
      {state.status === "error" && !state.fieldErrors ? (
        <Alert className="sm:max-w-xs" variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "success" ? (
        <Alert className="sm:max-w-xs" variant="success">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

function DeleteCatalogItemAction({ item }: { item: CatalogItem }) {
  const [state, formAction] = useActionState(deleteCatalogItemAction, initialState);
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  useMutationToast(state);

  useEffect(() => {
    if (!state.toastId || state.status !== "success") return;
    window.requestAnimationFrame(() => {
      setOpen(false);
      triggerRef.current?.focus();
    });
  }, [state.status, state.toastId]);

  return (
    <>
      <form action={formAction} className="hidden" id={formId} ref={formRef}>
        <input name="itemId" type="hidden" value={item.id} readOnly />
      </form>
      <AlertDialog onOpenChange={(nextOpen) => { if (!isPending) setOpen(nextOpen); }} open={open}>
        <AlertDialogTrigger asChild>
          <Button
            aria-label={`Borrar ${item.name}`}
            className="min-h-11 md:min-h-10"
            ref={triggerRef}
            type="button"
            variant="outline"
          >
            Borrar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Borrar ítem de catálogo</AlertDialogTitle>
            <AlertDialogDescription>
              {`El ítem ${item.name} se eliminará de los catálogos. Los pedidos existentes conservarán su especificación histórica.`}
            </AlertDialogDescription>
            {state.status === "error" ? (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!formRef.current || isPending) return;
                const data = new FormData(formRef.current);
                startTransition(() => formAction(data));
              }}
              type="button"
              variant="destructive"
            >
              {isPending ? "Borrando" : "Confirmar borrado"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CatalogItemList({ items, kind }: { items: CatalogItem[]; kind: CatalogItemKind }) {
  const filteredItems = items.filter((item) => item.kind === kind);

  if (filteredItems.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Todavía no hay opciones en {catalogItemKindLabel(kind).toLowerCase()}.
      </p>
    );
  }

  return (
    <ul aria-label={catalogItemKindLabel(kind)} className="flex flex-col gap-3">
      {filteredItems.map((item) => (
        <li className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4" key={item.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words font-medium">{item.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.kind === "garment" && item.garment_layer ? garmentLayerLabels[item.garment_layer] : catalogItemKindLabel(item.kind)}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-3 lg:flex-row lg:items-end lg:justify-between">
            <RenameCatalogItemForm item={item} />
            <DeleteCatalogItemAction item={item} />
          </div>
        </li>
      ))}
    </ul>
  );
}
