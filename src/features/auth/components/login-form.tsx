"use client";

import { useActionState } from "react";
import { Eye, LockKeyhole, Mail } from "lucide-react";

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
    <form action={formAction} className="flex flex-col gap-5 font-sans" noValidate>
      <FieldGroup className="gap-5">
        <Field className="gap-1.5" data-invalid={Boolean(emailErrors?.length)}>
          <FieldLabel className="font-sans text-xs font-medium text-foreground" htmlFor="email">Email</FieldLabel>
          <div className="group relative rounded-xl border border-input bg-card transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background group-data-[invalid=true]/field:border-destructive">
            <Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground transition-colors duration-150 group-focus-within:text-primary" />
            <Input
              aria-describedby={emailErrors?.length ? "email-error" : undefined}
              aria-invalid={Boolean(emailErrors?.length)}
              autoComplete="email"
              className="h-10 rounded-xl border-0 bg-transparent pl-10 font-sans shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:h-10"
              id="email"
              name="email"
              placeholder="tu@digraf.com"
              required
              type="email"
            />
          </div>
          <FieldError errors={emailErrors} id="email-error" />
        </Field>
        <Field className="gap-1.5" data-invalid={Boolean(passwordErrors?.length)}>
          <FieldLabel className="font-sans text-xs font-medium text-foreground" htmlFor="password">Contraseña</FieldLabel>
          <div className="group relative rounded-xl border border-input bg-card transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background group-data-[invalid=true]/field:border-destructive">
            <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground transition-colors duration-150 group-focus-within:text-primary" />
            <Input
              aria-describedby={passwordErrors?.length ? "password-error" : undefined}
              aria-invalid={Boolean(passwordErrors?.length)}
              autoComplete="current-password"
              className="h-10 rounded-xl border-0 bg-transparent pl-10 pr-10 font-sans shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:h-10"
              id="password"
              name="password"
              placeholder="••••••••"
              required
              type="password"
            />
            <Eye aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
          </div>
          <FieldError errors={passwordErrors} id="password-error" />
        </Field>
      </FieldGroup>
      <div aria-hidden="true" className="flex items-center justify-between font-sans text-xs">
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="size-4 rounded-[3px] border border-input bg-card" />
          Recordarme
        </span>
        <span className="font-medium text-primary">¿Olvidaste tu contraseña?</span>
      </div>
      {state.status === "error" && !state.fieldErrors ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <AuthSubmitButton idleLabel="Ingresar" pendingLabel="Ingresando" />
    </form>
  );
}
