import { roleLabel, type AppRole } from "../schemas";
import type { ManagedUser } from "../queries";
import { UserActions } from "./user-actions";

export function UserList({ users, currentRole }: { users: ManagedUser[]; currentRole: AppRole }) {
  if (users.length === 0) return <p className="border border-dashed border-[var(--border)] p-5 text-[var(--muted)]">No hay usuarios administrables.</p>;

  return (
    <div className="overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-[var(--border)] text-xs uppercase tracking-[0.1em] text-[var(--muted)]">
          <tr><th className="p-3">Usuario</th><th className="p-3">Rol</th><th className="p-3">Estado</th><th className="p-3">Acciones</th></tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr className="border-b border-[var(--border)] last:border-0" key={user.id}>
              <td className="p-3"><p className="font-bold">{user.displayName}</p><p className="text-[var(--muted)]">{user.email}</p></td>
              <td className="p-3">{roleLabel(user.role)}</td>
              <td className="p-3">{user.isActive ? "Activo" : "Inactivo"}{user.mustChangePassword ? " · debe cambiar contraseña" : ""}</td>
              <td className="p-3"><UserActions currentRole={currentRole} user={user} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
