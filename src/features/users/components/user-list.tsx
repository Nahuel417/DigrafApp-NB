import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { ManagedUser } from "../queries";
import { roleLabel, type AppRole } from "../schemas";
import { UserActions } from "./user-actions";

export function UserList({ users, currentRole }: { users: ManagedUser[]; currentRole: AppRole }) {
  if (users.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No hay usuarios administrables.
      </p>
    );
  }

  return (
    <section className="user-directory overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold" id="user-directory-title">Directorio interno</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {users.length} {users.length === 1 ? "perfil visible" : "perfiles visibles"}
          </p>
        </div>
      </div>

      <Table aria-labelledby="user-directory-title" className="user-table">
        <TableHeader>
          <TableRow className="bg-muted/70">
            <TableHead className="px-4" scope="col">Usuario</TableHead>
            <TableHead scope="col">Rol</TableHead>
            <TableHead scope="col">Estado</TableHead>
            <TableHead className="px-4" scope="col">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="min-w-0 px-4 py-3" data-label="Usuario">
                <p className="break-words font-medium">{user.displayName}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{user.email}</p>
              </TableCell>
              <TableCell data-label="Rol">
                <Badge className="font-mono font-medium" variant="secondary">{roleLabel(user.role)}</Badge>
              </TableCell>
              <TableCell data-label="Estado">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={user.isActive ? "active" : "inactive"}>
                    {user.isActive ? "Activo" : "Inactivo"}
                  </Badge>
                  {user.mustChangePassword ? <Badge aria-label="Cambio de contraseña pendiente" variant="pending">Cambio pendiente</Badge> : null}
                </div>
              </TableCell>
              <TableCell className="px-4 py-3" data-label="Acciones">
                <UserActions currentRole={currentRole} user={user} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
