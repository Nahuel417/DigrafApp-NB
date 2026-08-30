"use client";

import { AlertCircle, Archive, ArrowDown, ArrowUp, Check, CircleCheck, ListChecks, Lock, Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useMutationToast } from "@/hooks/use-mutation-toast";

import {
  createWorkflowStageAction,
  renameWorkflowStageAction,
  reorderWorkflowStagesAction,
  retireWorkflowStageAction,
} from "../actions";
import type { WorkflowStage, WorkflowStageActionState } from "../types";

const initialState: WorkflowStageActionState = {};
const protectedStageCodes = new Set(["received", "paid", "delivered"]);

function moveStageIds(stageIds: string[], index: number, offset: -1 | 1) {
  const nextStageIds = [...stageIds];
  const [stageId] = nextStageIds.splice(index, 1);
  nextStageIds.splice(index + offset, 0, stageId!);
  return nextStageIds;
}

function errorsFor(state: WorkflowStageActionState, field: string) {
  return state.fieldErrors?.[field]?.map((message: string) => ({ message }));
}

function focusInvalidField(form: HTMLFormElement | null) {
  window.requestAnimationFrame(() => {
    form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  });
}

function CreateStageForm() {
  const [state, formAction] = useActionState(createWorkflowStageAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const nameId = "workflow-stage-name";
  const errors = errorsFor(state, "name");
  useMutationToast(state);

  useEffect(() => {
    if (!state.toastId) return;
    formRef.current?.querySelector<HTMLInputElement>('[name="idempotencyKey"]')?.setAttribute("value", crypto.randomUUID());
    if (state.status === "success") {
      formRef.current?.reset();
      router.refresh();
      window.requestAnimationFrame(() => document.getElementById(nameId)?.focus());
      return;
    }
    focusInvalidField(formRef.current);
  }, [router, state.status, state.toastId]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 border-b border-border px-6 py-5" key={state.resetKey ?? "initial"} noValidate ref={formRef}>
      <input defaultValue={crypto.randomUUID()} name="idempotencyKey" type="hidden" readOnly />
      <FieldGroup className="min-w-[220px] flex-1 gap-2">
        <Field className="gap-2" data-invalid={Boolean(errors?.length)}>
          <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={nameId}>Nombre de la etapa</FieldLabel>
          <Input
            aria-describedby={errors?.length ? `${nameId}-error` : `${nameId}-help`}
            aria-invalid={Boolean(errors?.length)}
            id={nameId}
            maxLength={80}
            name="name"
            required
          />
          <p className="sr-only" id={`${nameId}-help`}>Se creará activa y aparecerá al final del tablero.</p>
          <FieldError errors={errors} id={`${nameId}-error`} />
        </Field>
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

      <SubmitButton className="group min-h-11 shrink-0 rounded-xl px-4 shadow-soft transition-all duration-200 hover:shadow-lift active:scale-[0.98] md:min-h-10" pendingLabel="Creando etapa">
        <Plus aria-hidden="true" className="transition-transform duration-200 group-hover:rotate-90" />
        Crear etapa
      </SubmitButton>
    </form>
  );
}

function RenameStageForm({ stage }: { stage: WorkflowStage }) {
  const [state, formAction] = useActionState(renameWorkflowStageAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const nameId = `rename-stage-${stage.id}`;
  const errors = errorsFor(state, "name");
  useMutationToast(state);

  useEffect(() => {
    if (!state.toastId) return;
    formRef.current?.querySelector<HTMLInputElement>('[name="idempotencyKey"]')?.setAttribute("value", crypto.randomUUID());
    if (state.status === "success") router.refresh();
    if (state.status === "error") focusInvalidField(formRef.current);
  }, [router, state.status, state.toastId]);

  return (
    <div className="min-w-0">
      <form action={formAction} className="group/rename relative flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-end" noValidate ref={formRef}>
        <input name="stageId" type="hidden" value={stage.id} readOnly />
        <input name="expectedUpdatedAt" type="hidden" value={stage.updated_at} readOnly />
        <input defaultValue={crypto.randomUUID()} name="idempotencyKey" type="hidden" readOnly />
        <Field className="min-w-0 flex-1" data-invalid={Boolean(errors?.length)}>
          <FieldLabel className="sr-only" htmlFor={nameId}>Nombre de {stage.name}</FieldLabel>
          <Input
            aria-describedby={errors?.length ? `${nameId}-error` : undefined}
            aria-invalid={Boolean(errors?.length)}
            defaultValue={stage.name}
            id={nameId}
            maxLength={80}
            name="name"
            required
            className="h-9 rounded-lg border border-input bg-background px-2 pr-12 font-medium shadow-none transition-all duration-200 hover:border-primary/40 focus:border-ring focus:bg-card focus:ring-2 focus:ring-ring/20"
          />
          <FieldError errors={errors} id={`${nameId}-error`} />
        </Field>
        <SubmitButton
          aria-label="Renombrar"
          className="pointer-events-none absolute right-0 top-1/2 size-11 -translate-y-1/2 rounded-lg opacity-0 transition-opacity duration-150 group-focus-within/rename:pointer-events-auto group-focus-within/rename:opacity-100 md:size-10"
          pendingLabel="Renombrando"
          title="Renombrar etapa"
          variant="outline"
        >
          <Check aria-hidden="true" />
          <span className="sr-only">Renombrar</span>
        </SubmitButton>
      </form>
      {state.status === "error" && !state.fieldErrors ? (
        <Alert className="mt-2 w-full text-xs sm:max-w-md" variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "success" ? (
        <Alert className="mt-2 w-full text-xs sm:max-w-md" variant="success">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function MoveStageAction({ direction, disabled = false, expectedStageIds, stage, stageIds }: { direction: "up" | "down"; disabled?: boolean; expectedStageIds: string[]; stage: WorkflowStage; stageIds: string[] }) {
  const [state, formAction] = useActionState(reorderWorkflowStagesAction, initialState);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isUp = direction === "up";
  useMutationToast(state);

  useEffect(() => {
    if (!state.toastId) return;
    idempotencyKeyRef.current = crypto.randomUUID();
    if (state.status === "success") router.refresh();
  }, [router, state.status, state.toastId]);

  function moveStage() {
    if (isPending) return;
    const data = new FormData();
    data.set("stageIds", JSON.stringify(stageIds));
    data.set("expectedStageIds", JSON.stringify(expectedStageIds));
    data.set("idempotencyKey", idempotencyKeyRef.current);
    startTransition(() => formAction(data));
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        aria-busy={isPending}
        aria-label={`${isUp ? "Subir" : "Bajar"} ${stage.name}`}
        className="size-11 rounded-lg md:size-10"
        disabled={disabled || isPending}
        onClick={moveStage}
        size="icon"
        type="button"
        variant="outline"
      >
        {isUp ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
      </Button>
      {state.status === "error" ? (
        <p className="max-w-48 text-sm text-destructive">{state.message}</p>
      ) : null}
    </div>
  );
}

function RetireStageAction({ ordinaryStageCount, stage }: { ordinaryStageCount: number; stage: WorkflowStage }) {
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const [state, formAction] = useActionState(retireWorkflowStageAction, initialState);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  useMutationToast(state);
  const isLastOrdinary = ordinaryStageCount <= 1;

  function confirmRetire() {
    if (isPending || isLastOrdinary) return;
    const data = new FormData();
    data.set("stageId", stage.id);
    data.set("expectedUpdatedAt", stage.updated_at);
    data.set("idempotencyKey", idempotencyKeyRef.current);
    startTransition(() => formAction(data));
  }

  useEffect(() => {
    if (!state.toastId) return;
    idempotencyKeyRef.current = crypto.randomUUID();
    if (state.status !== "success") return;
    router.refresh();
    window.requestAnimationFrame(() => {
      setOpen(false);
      triggerRef.current?.focus();
    });
  }, [router, state.status, state.toastId]);

  if (isLastOrdinary) {
    return (
      <Button
        aria-label={`No se puede retirar ${stage.name}`}
        className="min-h-11 rounded-lg md:min-h-10"
        disabled
        title="Debe permanecer al menos una etapa ordinaria activa"
        type="button"
        variant="outline"
      >
        Última ordinaria
      </Button>
    );
  }

  return (
    <AlertDialog onOpenChange={(nextOpen) => { if (!isPending) setOpen(nextOpen); }} open={open}>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`Retirar ${stage.name}`}
          className="size-11 rounded-lg md:size-10"
          ref={triggerRef}
          type="button"
          variant="destructive-outline"
        >
          <Archive aria-hidden="true" />
          <span className="sr-only">Retirar</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retirar etapa</AlertDialogTitle>
          <AlertDialogDescription>
            {`Vas a retirar ${stage.name}. Dejará de aparecer en el tablero y en los formularios nuevos; los pedidos e historiales existentes conservarán su referencia.`}
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
              confirmRetire();
            }}
            type="button"
            variant="destructive"
          >
            {isPending ? "Retirando" : "Confirmar retiro"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ActiveStageList({ stages }: { stages: WorkflowStage[] }) {
  const ordinaryStageCount = stages.filter((stage) => !protectedStageCodes.has(stage.code)).length;
  const expectedStageIds = stages.map((stage) => stage.id);

  if (stages.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        No hay etapas activas para administrar.
      </p>
    );
  }

  return (
    <ol aria-label="Etapas activas" className="divide-y divide-border">
      {stages.map((stage, index) => {
        const isProtected = protectedStageCodes.has(stage.code);
        return (
          <li className="group grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-6 py-4 transition-colors duration-200 hover:bg-muted/60 sm:grid-cols-[2rem_minmax(0,1fr)_13rem] sm:gap-y-0" key={stage.id}>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-muted text-xs font-medium tabular-nums text-muted-foreground transition-colors duration-200 group-hover:border-primary/40 group-hover:text-primary sm:row-start-1">
              {String(index + 1).padStart(2, "0")}
            </span>

            <div className="min-w-0 sm:col-start-2 sm:row-start-1">
              <p aria-hidden="true" className="sr-only">{stage.name}</p>
              <RenameStageForm stage={stage} />
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {isProtected ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Lock aria-hidden="true" className="size-3" /> Etapa semántica protegida
                  </span>
                ) : "Etapa ordinaria"}
              </p>
            </div>

            <div aria-label={`Orden de ${stage.name}`} className="col-span-2 flex w-full flex-wrap items-center justify-start gap-1.5 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:w-auto sm:justify-end" role="group">
              <Badge
                className={isProtected
                  ? "rounded-full border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
                  : "rounded-full border-success-foreground/30 bg-success/20 px-2.5 py-1 text-[11px] font-medium text-success-foreground"}
                variant="outline"
              >
                {isProtected ? <Lock aria-hidden="true" /> : null}
                {isProtected ? "Protegida" : "Activa"}
              </Badge>
              <MoveStageAction
                direction="up"
                disabled={index === 0}
                expectedStageIds={expectedStageIds}
                stage={stage}
                stageIds={index > 0 ? moveStageIds(expectedStageIds, index, -1) : expectedStageIds}
              />
              <MoveStageAction
                direction="down"
                disabled={index === stages.length - 1}
                expectedStageIds={expectedStageIds}
                stage={stage}
                stageIds={index < stages.length - 1 ? moveStageIds(expectedStageIds, index, 1) : expectedStageIds}
              />
              {!isProtected ? <RetireStageAction ordinaryStageCount={ordinaryStageCount} stage={stage} /> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function RetiredStageList({ stages }: { stages: WorkflowStage[] }) {
  if (stages.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay etapas retiradas.</p>;
  }

  return (
    <ul aria-label="Etapas retiradas" className="flex flex-col gap-3">
      {stages.map((stage) => (
        <li className="rounded-xl border border-border bg-muted/60 p-4 transition-colors duration-200 hover:bg-muted" key={stage.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{stage.name}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">No aparece en el tablero ni en formularios nuevos.</p>
            </div>
            <Badge className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium" variant="inactive">Retirada</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function WorkflowStageManager({ stages }: { stages: WorkflowStage[] }) {
  const activeStages = stages.filter((stage) => stage.is_active);
  const retiredStages = stages.filter((stage) => !stage.is_active);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
        <div className="grid-paper flex items-center gap-3 border-b border-border px-6 py-5">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <ListChecks aria-hidden="true" className="size-[18px]" />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Etapas activas</h2>
            <p className="text-xs text-muted-foreground">
              Renombrá, reordená o retirá etapas sin cambiar los códigos que usa el negocio.
            </p>
          </div>
        </div>
        <CreateStageForm />
        <ActiveStageList stages={activeStages} />
      </section>

      <section className="self-start overflow-hidden rounded-2xl border border-border bg-card shadow-xs lg:sticky lg:top-6">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold tracking-tight">Etapas retiradas</h2>
          <p className="text-xs text-muted-foreground">Las referencias históricas se conservan.</p>
        </div>
        <div className="space-y-3 p-5">
          <RetiredStageList stages={retiredStages} />
        </div>
      </section>
    </div>
  );
}
