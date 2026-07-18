"use client";

import { useActionState } from "react";

import { createUserAction, type UserActionState } from "../actions";
import { appRoles, roleLabel } from "../schemas";

const initialState: UserActionState = {};

export function CreateUserForm() {
  const [state, formAction] = useActionState(createUserAction, initialState);

  return (
    <form action={formAction} className="grid gap-4 border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2">
        <h2 className="text-lg font-black uppercase tracking-[-0.03em]">Nuevo usuario</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">La contraseña temporal se comunica fuera de Digraf.</p>
      </div>
      <label className="flex flex-col gap-2 text-sm font-bold">
        Nombre descriptivo
        <input className="border border-[var(--border)] bg-white px-3 py-2 font-normal" name="displayName" required />
      </label>
      <label className="flex flex-col gap-2 text-sm font-bold">
        Email
        <input className="border border-[var(--border)] bg-white px-3 py-2 font-normal" name="email" required type="email" />
      </label>
      <label className="flex flex-col gap-2 text-sm font-bold">
        Rol
        <select className="border border-[var(--border)] bg-white px-3 py-2 font-normal" defaultValue="employee" name="role">
          {appRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm font-bold">
        Contraseña temporal
        <input className="border border-[var(--border)] bg-white px-3 py-2 font-normal" minLength={8} name="password" required type="password" />
      </label>
      {state.error ? <p className="sm:col-span-2 text-sm text-[var(--accent)]">{state.error}</p> : null}
      {state.success ? <p className="sm:col-span-2 text-sm text-[var(--foreground)]">{state.success}</p> : null}
      <button className="w-fit border border-[var(--foreground)] bg-[var(--foreground)] px-4 py-2 text-sm font-bold uppercase tracking-[0.1em] text-white" type="submit">Crear usuario</button>
    </form>
  );
}
