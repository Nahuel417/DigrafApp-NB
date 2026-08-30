"use client";

import { useActionState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

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
    <form action={formAction} className="flex flex-col gap-5 font-sans" noValidate>
      <FieldGroup className="gap-5">
        <Field className="gap-1.5" data-invalid={Boolean(passwordErrors?.length)}>
          <FieldLabel className="font-sans text-xs font-medium text-foreground" htmlFor="password">Nueva contraseña</FieldLabel>
          <div className="group relative rounded-xl border border-input bg-card transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background group-data-[invalid=true]/field:border-destructive">
            <KeyRound aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground transition-colors duration-150 group-focus-within:text-primary" />
            <Input
              aria-describedby={passwordErrors?.length ? "new-password-help new-password-error" : "new-password-help"}
              aria-invalid={Boolean(passwordErrors?.length)}
              autoComplete="new-password"
              className="h-10 rounded-xl border-0 bg-transparent pl-10 font-sans shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:h-10"
              id="password"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </div>
          <FieldDescription className="text-xs leading-5" id="new-password-help">Usá al menos 8 caracteres e incluí un número.</FieldDescription>
          <FieldError errors={passwordErrors} id="new-password-error" />
        </Field>
        <Field className="gap-1.5" data-invalid={Boolean(confirmationErrors?.length)}>
          <FieldLabel className="font-sans text-xs font-medium text-foreground" htmlFor="passwordConfirmation">Repetí la nueva contraseña</FieldLabel>
          <div className="group relative rounded-xl border border-input bg-card transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background group-data-[invalid=true]/field:border-destructive">
            <ShieldCheck aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground transition-colors duration-150 group-focus-within:text-primary" />
            <Input
              aria-describedby={confirmationErrors?.length ? "password-confirmation-error" : undefined}
              aria-invalid={Boolean(confirmationErrors?.length)}
              autoComplete="new-password"
              className="h-10 rounded-xl border-0 bg-transparent pl-10 font-sans shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:h-10"
              id="passwordConfirmation"
              minLength={8}
              name="passwordConfirmation"
              required
              type="password"
            />
          </div>
          <FieldError errors={confirmationErrors} id="password-confirmation-error" />
        </Field>
      </FieldGroup>
      {state.status === "error" && !state.fieldErrors ? (
        <Alert className="rounded-xl" variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <AuthSubmitButton idleLabel="Guardar contraseña" pendingLabel="Guardando" />
    </form>
  );
}
