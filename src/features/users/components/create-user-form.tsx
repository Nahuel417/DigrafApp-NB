"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { KeyRound, Mail, UserPlus } from "lucide-react";

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

import { createUserAction, type UserActionState } from "../actions";
import { appRoles, roleLabel, type AppRole } from "../schemas";

const initialState: UserActionState = {};

function errorsFor(state: UserActionState, field: string) {
  return state.fieldErrors?.[field]?.map((message) => ({ message }));
}

export function CreateUserForm() {
  const [state, formAction] = useActionState(createUserAction, initialState);
  const [confirmationRole, setConfirmationRole] = useState<AppRole>("employee");
  const [confirmationEntity, setConfirmationEntity] = useState("el usuario ingresado");
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useMutationToast(state);

  useEffect(() => {
    if (!state.toastId) return;
    if (state.status === "success") formRef.current?.reset();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [state.status, state.toastId]);

  const displayNameErrors = errorsFor(state, "displayName");
  const emailErrors = errorsFor(state, "email");
  const roleErrors = errorsFor(state, "role");
  const passwordErrors = errorsFor(state, "password");

  return (
    <form
      action={formAction}
      className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xs"
      id={formId}
      noValidate
      ref={formRef}
    >
      <div className="grid-paper flex items-center gap-3 border-b border-border/60 px-5 py-5 sm:px-6">
        <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <UserPlus className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Nuevo usuario</h2>
          <p className="text-xs text-muted-foreground">
            La contraseña temporal se comunica fuera de Digraf.
          </p>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(displayNameErrors?.length)}>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="displayName">
              Nombre descriptivo
            </FieldLabel>
            <Input
              aria-describedby={displayNameErrors?.length ? "display-name-error" : undefined}
              aria-invalid={Boolean(displayNameErrors?.length)}
              id="displayName"
              name="displayName"
              placeholder="Ej. Taller · Estampado"
              required
              className="rounded-xl bg-muted/30 shadow-none transition-all duration-200 focus-visible:bg-card"
            />
            <FieldError errors={displayNameErrors} id="display-name-error" />
          </Field>
          <Field data-invalid={Boolean(emailErrors?.length)}>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="new-user-email">
              <Mail aria-hidden="true" className="size-3.5" data-icon="inline-start" />
              Email
            </FieldLabel>
            <Input
              aria-describedby={emailErrors?.length ? "new-user-email-error" : undefined}
              aria-invalid={Boolean(emailErrors?.length)}
              autoComplete="off"
              id="new-user-email"
              name="email"
              placeholder="nombre@digraf.local"
              required
              type="email"
              className="rounded-xl bg-muted/30 shadow-none transition-all duration-200 focus-visible:bg-card"
            />
            <FieldError errors={emailErrors} id="new-user-email-error" />
          </Field>
          <Field data-invalid={Boolean(roleErrors?.length)}>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="new-user-role">
              Rol
            </FieldLabel>
            <Select defaultValue="employee" key={state.resetKey ?? "initial"} name="role">
              <SelectTrigger
                aria-describedby={roleErrors?.length ? "new-user-role-error" : undefined}
                aria-invalid={Boolean(roleErrors?.length)}
                className="h-11 rounded-xl bg-muted/30 shadow-none transition-all duration-200 focus:bg-card md:h-10"
                id="new-user-role"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {appRoles.map((availableRole) => (
                    <SelectItem key={availableRole} value={availableRole}>{roleLabel(availableRole)}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldError errors={roleErrors} id="new-user-role-error" />
          </Field>
          <Field data-invalid={Boolean(passwordErrors?.length)}>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor="temporary-password">
              <KeyRound aria-hidden="true" className="size-3.5" data-icon="inline-start" />
              Contraseña temporal
            </FieldLabel>
            <Input
              aria-describedby={passwordErrors?.length ? "temporary-password-error" : undefined}
              aria-invalid={Boolean(passwordErrors?.length)}
              autoComplete="new-password"
              id="temporary-password"
              minLength={8}
              name="password"
              placeholder="••••••••"
              required
              type="password"
              className="rounded-xl bg-muted/30 shadow-none transition-all duration-200 focus-visible:bg-card"
            />
            <FieldError errors={passwordErrors} id="temporary-password-error" />
          </Field>
        </FieldGroup>

        {state.status === "error" && !state.fieldErrors ? (
          <Alert className="mt-4" variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}
        {state.status === "success" ? (
          <Alert className="mt-4" variant="success">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <SubmitButton
              className="group mt-5 min-h-11 rounded-xl shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98] md:min-h-10"
              onClick={(event) => {
                if (!formRef.current?.reportValidity()) {
                  event.preventDefault();
                  return;
                }
                const formData = new FormData(formRef.current);
                setConfirmationEntity(`${String(formData.get("displayName"))} (${String(formData.get("email"))})`);
                setConfirmationRole(String(formData.get("role")) as AppRole);
              }}
              pendingLabel="Creando usuario"
              ref={triggerRef}
              type="button"
            >
              <UserPlus aria-hidden="true" data-icon="inline-start" />
              Crear usuario
            </SubmitButton>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar creación de usuario</AlertDialogTitle>
              <AlertDialogDescription>
                Se creará la cuenta {confirmationEntity} activa con rol {roleLabel(confirmationRole)} y cambio obligatorio de contraseña. Podrás desactivarla o cambiar su rol más adelante; la contraseña temporal debe comunicarse por un canal seguro.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction form={formId} type="submit">Confirmar creación</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </form>
  );
}
