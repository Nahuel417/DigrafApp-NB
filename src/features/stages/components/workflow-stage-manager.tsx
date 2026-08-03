"use client";

import { AlertCircle, ArrowDown, ArrowUp, CircleCheck } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
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
    <form action={formAction} className="flex flex-col gap-4" key={state.resetKey ?? "initial"} noValidate ref={formRef}>
      <input defaultValue={crypto.randomUUID()} name="idempotencyKey" type="hidden" readOnly />
      <FieldGroup>
        <Field data-invalid={Boolean(errors?.length)}>
          <FieldLabel htmlFor={nameId}>Nombre de la etapa</FieldLabel>
          <Input
            aria-describedby={errors?.length ? `${nameId}-error` : `${nameId}-help`}
            aria-invalid={Boolean(errors?.length)}
            id={nameId}
            maxLength={80}
            name="name"
            required
          />
          <p className="text-sm text-muted-foreground" id={`${nameId}-help`}>Se creará activa y aparecerá al final del tablero.</p>
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

      <SubmitButton className="min-h-11 self-start md:min-h-10" pendingLabel="Creando etapa">
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
    <form action={formAction} className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end" noValidate ref={formRef}>
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
        />
        <FieldError errors={errors} id={`${nameId}-error`} />
      </Field>
      <SubmitButton className="min-h-11 shrink-0 md:min-h-10" pendingLabel="Renombrando" variant="outline">
        Renombrar
      </SubmitButton>
      {state.status === "error" && !state.fieldErrors ? (
        <Alert className="sm:max-w-sm" variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "success" ? (
        <Alert className="sm:max-w-sm" variant="success">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

function MoveStageAction({ direction, expectedStageIds, stage, stageIds }: { direction: "up" | "down"; expectedStageIds: string[]; stage: WorkflowStage; stageIds: string[] }) {
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
        className="size-11 md:size-10"
        disabled={isPending}
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
        className="min-h-11 md:min-h-10"
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
          className="min-h-11 md:min-h-10"
          ref={triggerRef}
          type="button"
          variant="outline"
        >
          Retirar
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
    <ol aria-label="Etapas activas" className="flex flex-col gap-3">
      {stages.map((stage, index) => {
        const isProtected = protectedStageCodes.has(stage.code);
        return (
          <li className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4" key={stage.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-medium">{stage.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isProtected ? "Etapa semántica protegida" : "Etapa ordinaria"} · Posición {index + 1}
                </p>
              </div>
              <Badge variant={isProtected ? "secondary" : "active"}>{isProtected ? "Protegida" : "Activa"}</Badge>
            </div>
            <div className="flex flex-col gap-3 border-t border-border pt-3 xl:flex-row xl:items-end xl:justify-between">
              <RenameStageForm stage={stage} />
              <div aria-label={`Orden de ${stage.name}`} className="flex flex-wrap items-end gap-2" role="group">
                {index > 0 ? (
                  <MoveStageAction
                    direction="up"
                    expectedStageIds={expectedStageIds}
                    stage={stage}
                    stageIds={moveStageIds(expectedStageIds, index, -1)}
                  />
                ) : null}
                {index < stages.length - 1 ? (
                  <MoveStageAction
                    direction="down"
                    expectedStageIds={expectedStageIds}
                    stage={stage}
                    stageIds={moveStageIds(expectedStageIds, index, 1)}
                  />
                ) : null}
                {!isProtected ? <RetireStageAction ordinaryStageCount={ordinaryStageCount} stage={stage} /> : null}
              </div>
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
        <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-4" key={stage.id}>
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{stage.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">No aparece en el tablero ni en formularios nuevos.</p>
          </div>
          <Badge variant="inactive">Retirada</Badge>
        </li>
      ))}
    </ul>
  );
}

export function WorkflowStageManager({ stages }: { stages: WorkflowStage[] }) {
  const activeStages = stages.filter((stage) => stage.is_active);
  const retiredStages = stages.filter((stage) => !stage.is_active);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">Etapas activas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Renombrá, reordená o retirá etapas sin cambiar los códigos que usa el negocio.
          </p>
        </div>
        <div className="flex flex-col gap-5 p-5">
          <CreateStageForm />
          <Separator />
          <ActiveStageList stages={activeStages} />
        </div>
      </section>

      <section className="self-start overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">Etapas retiradas</h2>
          <p className="mt-1 text-sm text-muted-foreground">Las referencias históricas se conservan.</p>
        </div>
        <div className="p-5">
          <RetiredStageList stages={retiredStages} />
        </div>
      </section>
    </div>
  );
}
