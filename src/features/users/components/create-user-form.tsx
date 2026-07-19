"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

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
      className="overflow-hidden rounded-xl border border-border bg-card shadow-xs"
      id={formId}
      noValidate
      ref={formRef}
    >
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold">Nuevo usuario</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          La contraseña temporal se comunica fuera de Digraf.
        </p>
      </div>

      <div className="p-5">
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field data-invalid={Boolean(displayNameErrors?.length)}>
            <FieldLabel htmlFor="displayName">Nombre descriptivo</FieldLabel>
            <Input
              aria-describedby={displayNameErrors?.length ? "display-name-error" : undefined}
              aria-invalid={Boolean(displayNameErrors?.length)}
              id="displayName"
              name="displayName"
              required
            />
            <FieldError errors={displayNameErrors} id="display-name-error" />
          </Field>
          <Field data-invalid={Boolean(emailErrors?.length)}>
            <FieldLabel htmlFor="new-user-email">Email</FieldLabel>
            <Input
              aria-describedby={emailErrors?.length ? "new-user-email-error" : undefined}
              aria-invalid={Boolean(emailErrors?.length)}
              autoComplete="off"
              id="new-user-email"
              name="email"
              required
              type="email"
            />
            <FieldError errors={emailErrors} id="new-user-email-error" />
          </Field>
          <Field data-invalid={Boolean(roleErrors?.length)}>
            <FieldLabel htmlFor="new-user-role">Rol</FieldLabel>
            <Select defaultValue="employee" key={state.resetKey ?? "initial"} name="role">
              <SelectTrigger
                aria-describedby={roleErrors?.length ? "new-user-role-error" : undefined}
                aria-invalid={Boolean(roleErrors?.length)}
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
            <FieldLabel htmlFor="temporary-password">Contraseña temporal</FieldLabel>
            <Input
              aria-describedby={passwordErrors?.length ? "temporary-password-error" : undefined}
              aria-invalid={Boolean(passwordErrors?.length)}
              autoComplete="new-password"
              id="temporary-password"
              minLength={8}
              name="password"
              required
              type="password"
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
              className="mt-5 min-h-11 md:min-h-10"
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
