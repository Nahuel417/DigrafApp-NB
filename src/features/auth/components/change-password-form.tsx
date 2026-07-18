"use client";

import { useActionState } from "react";

import { changePasswordAction } from "../actions";
import { AuthSubmitButton } from "./auth-submit-button";

const initialState: { error?: string } = {};

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-bold" htmlFor="password">
          Nueva contraseña
        </label>
        <input
          autoComplete="new-password"
          className="border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
        <p className="text-sm text-[var(--muted)]">
          Usá al menos 8 caracteres e incluí un número.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-bold" htmlFor="passwordConfirmation">
          Repetí la nueva contraseña
        </label>
        <input
          autoComplete="new-password"
          className="border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          id="passwordConfirmation"
          minLength={8}
          name="passwordConfirmation"
          required
          type="password"
        />
      </div>
      {state.error ? (
        <p aria-live="polite" className="border-l-4 border-[var(--accent)] bg-[var(--background)] px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}
      <AuthSubmitButton idleLabel="Guardar contraseña" pendingLabel="Guardando" />
    </form>
  );
}
