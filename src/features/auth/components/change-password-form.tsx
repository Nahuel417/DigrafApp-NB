"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useMutationToast } from "@/hooks/use-mutation-toast";
import type { MutationState } from "@/lib/action-state";

import { changePasswordAction } from "../actions";
import { AuthSubmitButton } from "./auth-submit-button";

const initialState: MutationState = {};

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initialState);
  useMutationToast(state);
  const passwordErrors = state.fieldErrors?.password?.map((message) => ({ message }));
  const confirmationErrors = state.fieldErrors?.passwordConfirmation?.map((message) => ({ message }));

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FieldGroup className="gap-5">
        <Field data-invalid={Boolean(passwordErrors?.length)}>
          <FieldLabel htmlFor="password">Nueva contraseña</FieldLabel>
          <Input
            aria-describedby={passwordErrors?.length ? "new-password-help new-password-error" : "new-password-help"}
            aria-invalid={Boolean(passwordErrors?.length)}
            autoComplete="new-password"
            id="password"
            minLength={8}
            name="password"
            required
            type="password"
          />
          <FieldDescription id="new-password-help">Usá al menos 8 caracteres e incluí un número.</FieldDescription>
          <FieldError errors={passwordErrors} id="new-password-error" />
        </Field>
        <Field data-invalid={Boolean(confirmationErrors?.length)}>
          <FieldLabel htmlFor="passwordConfirmation">Repetí la nueva contraseña</FieldLabel>
          <Input
            aria-describedby={confirmationErrors?.length ? "password-confirmation-error" : undefined}
            aria-invalid={Boolean(confirmationErrors?.length)}
            autoComplete="new-password"
            id="passwordConfirmation"
            minLength={8}
            name="passwordConfirmation"
            required
            type="password"
          />
          <FieldError errors={confirmationErrors} id="password-confirmation-error" />
        </Field>
      </FieldGroup>
      {state.status === "error" && !state.fieldErrors ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <AuthSubmitButton idleLabel="Guardar contraseña" pendingLabel="Guardando" />
    </form>
  );
}
