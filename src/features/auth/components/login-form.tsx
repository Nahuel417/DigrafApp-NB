"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useMutationToast } from "@/hooks/use-mutation-toast";
import type { MutationState } from "@/lib/action-state";

import { loginAction } from "../actions";
import { AuthSubmitButton } from "./auth-submit-button";

const initialState: MutationState = {};

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);
  useMutationToast(state);
  const emailErrors = state.fieldErrors?.email?.map((message) => ({ message }));
  const passwordErrors = state.fieldErrors?.password?.map((message) => ({ message }));

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FieldGroup className="gap-5">
        <Field data-invalid={Boolean(emailErrors?.length)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            aria-describedby={emailErrors?.length ? "email-error" : undefined}
            aria-invalid={Boolean(emailErrors?.length)}
            autoComplete="email"
            id="email"
            name="email"
            required
            type="email"
          />
          <FieldError errors={emailErrors} id="email-error" />
        </Field>
        <Field data-invalid={Boolean(passwordErrors?.length)}>
          <FieldLabel htmlFor="password">Contraseña</FieldLabel>
          <Input
            aria-describedby={passwordErrors?.length ? "password-error" : undefined}
            aria-invalid={Boolean(passwordErrors?.length)}
            autoComplete="current-password"
            id="password"
            name="password"
            required
            type="password"
          />
          <FieldError errors={passwordErrors} id="password-error" />
        </Field>
      </FieldGroup>
      {state.status === "error" && !state.fieldErrors ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <AuthSubmitButton idleLabel="Ingresar" pendingLabel="Ingresando" />
    </form>
  );
}
