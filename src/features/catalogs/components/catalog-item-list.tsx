"use client";

import { AlertCircle, CircleCheck, Pencil, Trash2 } from "lucide-react";
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
        <div className="relative">
          <Input
            aria-describedby={errors?.length ? `${nameId}-error` : undefined}
            aria-invalid={Boolean(errors?.length)}
            defaultValue={item.name}
            id={nameId}
            name="name"
            className="h-9 rounded-full border-border bg-muted/40 px-4 pr-10 text-xs shadow-none transition-colors duration-200 focus-visible:border-primary/40 focus-visible:bg-card focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:ring-offset-0 md:h-9"
          />
          {state.status === "success" ? (
            <span
              aria-label={state.message ?? "Guardado correctamente"}
              aria-live="polite"
              className="pointer-events-none absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-success text-success-foreground"
              role="status"
              title={state.message ?? "Guardado correctamente"}
            >
              <CircleCheck aria-hidden="true" className="size-3" />
            </span>
          ) : null}
        </div>
        <FieldError errors={errors} id={`${nameId}-error`} />
      </Field>
      <SubmitButton className="group min-h-11 shrink-0 rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs md:min-h-10" pendingLabel="Guardando" variant="outline">
        <Pencil aria-hidden="true" data-icon="inline-start" />
        Renombrar
      </SubmitButton>
      {state.status === "error" && !state.fieldErrors ? (
        <Alert className="min-w-0 flex-1 rounded-xl px-4 py-3 text-xs leading-5 sm:max-w-xs [&>svg]:size-4" variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription className="text-xs">{state.message}</AlertDescription>
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
            className="min-h-11 shrink-0 rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs md:min-h-10"
            ref={triggerRef}
            type="button"
            variant="destructive-outline"
          >
            <Trash2 aria-hidden="true" data-icon="inline-start" />
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
      <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-10 text-center text-xs text-muted-foreground">
        Todavía no hay opciones en {catalogItemKindLabel(kind).toLowerCase()}.
      </p>
    );
  }

  return (
    <ul aria-label={catalogItemKindLabel(kind)} className="flex flex-col gap-3">
      {filteredItems.map((item) => (
        <li className="group flex flex-col gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 transition-colors duration-200 hover:bg-muted md:flex-row md:items-center" key={item.id}>
          <RenameCatalogItemForm item={item} />
          <DeleteCatalogItemAction item={item} />
        </li>
      ))}
    </ul>
  );
}
