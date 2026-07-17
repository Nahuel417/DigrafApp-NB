"use client";

import { useActionState } from "react";

import { loginAction } from "../actions";
import { AuthSubmitButton } from "./auth-submit-button";

const initialState: { error?: string } = {};

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-bold" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="email"
          className="border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          id="email"
          name="email"
          required
          type="email"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-bold" htmlFor="password">
          Contraseña
        </label>
        <input
          autoComplete="current-password"
          className="border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>
      {state.error ? (
        <p aria-live="polite" className="border-l-4 border-[var(--accent)] bg-[var(--background)] px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}
      <AuthSubmitButton idleLabel="Ingresar" pendingLabel="Ingresando" />
    </form>
  );
}
