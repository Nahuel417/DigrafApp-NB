"use client";

import { useActionState } from "react";

import { resetPasswordAction, updateUserAction, type UserActionState } from "../actions";
import { appRoles, roleLabel, type AppRole } from "../schemas";

const initialState: UserActionState = {};

type UserActionsProps = {
  currentRole: AppRole;
  user: { id: string; role: AppRole; isActive: boolean };
};

export function UserActions({ currentRole, user }: UserActionsProps) {
  const [updateState, updateAction] = useActionState(updateUserAction, initialState);
  const [resetState, resetAction] = useActionState(resetPasswordAction, initialState);
  const allowedRoles = currentRole === "admin" ? appRoles.filter((role) => role === "attention" || role === "employee") : appRoles;
  const canReset = currentRole === "super_admin";
  const canActivate = currentRole === "super_admin";

  return (
    <div className="flex flex-col gap-2">
      <form action={updateAction} className="flex flex-wrap items-end gap-2">
        <input name="userId" type="hidden" value={user.id} />
        <label className="flex flex-col gap-1 text-xs font-bold">Rol
          <select className="border border-[var(--border)] bg-white px-2 py-1 text-sm font-normal" defaultValue={user.role} name="role">
            {allowedRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
          </select>
        </label>
        <input name="isActive" type="hidden" value={String(user.isActive)} />
        <button className="border border-[var(--foreground)] px-2 py-1 text-xs font-bold" type="submit">
          Guardar rol
        </button>
      </form>
      {user.isActive || canActivate ? (
        <form action={updateAction} className="flex gap-2">
          <input name="userId" type="hidden" value={user.id} />
          <input name="role" type="hidden" value={user.role} />
          <input name="isActive" type="hidden" value={String(!user.isActive)} />
          <button className="border border-[var(--accent)] px-2 py-1 text-xs font-bold text-[var(--accent)]" type="submit">
            {user.isActive ? "Desactivar" : "Activar"}
          </button>
        </form>
      ) : null}
      {updateState.error ? <p className="text-xs text-[var(--accent)]">{updateState.error}</p> : null}
      {updateState.success ? <p className="text-xs">{updateState.success}</p> : null}
      {canReset ? (
        <form action={resetAction} className="flex flex-wrap items-end gap-2">
          <input name="userId" type="hidden" value={user.id} />
          <label className="flex flex-col gap-1 text-xs font-bold">Nueva temporal
            <input className="border border-[var(--border)] bg-white px-2 py-1 text-sm font-normal" minLength={8} name="password" required type="password" />
          </label>
          <button className="border border-[var(--foreground)] px-2 py-1 text-xs font-bold" type="submit">Restablecer</button>
        </form>
      ) : null}
      {resetState.error ? <p className="text-xs text-[var(--accent)]">{resetState.error}</p> : null}
      {resetState.success ? <p className="text-xs">{resetState.success}</p> : null}
    </div>
  );
}
