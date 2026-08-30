"use client";

import { Search } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { ManagedUser } from "../queries";
import { roleLabel, type AppRole } from "../schemas";
import { UserActions } from "./user-actions";

function userInitials(displayName: string) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "DG";
}

export function UserList({ users, currentRole }: { users: ManagedUser[]; currentRole: AppRole }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleUsers = normalizedQuery
    ? users.filter((user) => user.displayName.toLowerCase().includes(normalizedQuery) || user.email.toLowerCase().includes(normalizedQuery))
    : users;

  if (users.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No hay usuarios administrables.
      </p>
    );
  }

  return (
    <section className="user-directory overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-5 sm:px-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight" id="user-directory-title">Directorio interno</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {visibleUsers.length} {visibleUsers.length === 1 ? "perfil visible" : "perfiles visibles"}
          </p>
        </div>
        <div className="relative w-full sm:w-56">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar usuario"
            className="h-10 rounded-xl bg-muted/30 pl-9 pr-3 text-sm shadow-none transition-all duration-200 focus-visible:bg-card"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar usuario..."
            value={query}
          />
        </div>
      </div>

      <Table aria-labelledby="user-directory-title" className="user-table">
        <TableHeader className="sr-only">
          <TableRow>
            <TableHead className="px-4" scope="col">Usuario</TableHead>
            <TableHead scope="col">Rol</TableHead>
            <TableHead scope="col">Estado</TableHead>
            <TableHead className="px-4" scope="col">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleUsers.map((user) => (
            <TableRow className="group hover:bg-muted/40" key={user.id}>
              <TableCell className="user-row-cell p-0" colSpan={4}>
                <div className="grid items-center gap-x-4 px-5 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:px-6">
                  <div className="flex min-w-0 items-center gap-4 py-4">
                    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground transition-transform duration-200 group-hover:scale-105">
                      {userInitials(user.displayName)}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">{user.displayName}</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="py-4 sm:py-0">
                    <Badge className="rounded-full border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground" variant="outline">
                      {roleLabel(user.role)}
                    </Badge>
                  </div>
                  <div className="py-4 sm:py-0">
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          user.isActive
                            ? "border-success-foreground/30 bg-success/20 text-success-foreground"
                            : "border-border bg-muted text-muted-foreground",
                        )}
                        variant={user.isActive ? "active" : "inactive"}
                      >
                        <span aria-hidden="true" className={cn("size-1.5 rounded-full", user.isActive ? "bg-success-foreground" : "bg-muted-foreground")} />
                        {user.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                      {user.mustChangePassword ? <Badge aria-label="Cambio de contraseña pendiente" className="rounded-full px-2.5 py-1 text-[11px] font-medium" variant="pending">Cambio pendiente</Badge> : null}
                    </div>
                  </div>
                  <UserActions currentRole={currentRole} user={user} />
                </div>
              </TableCell>
            </TableRow>
          ))}
          {visibleUsers.length === 0 ? (
            <TableRow>
              <TableCell className="px-5 py-12 text-center text-sm text-muted-foreground sm:px-6" colSpan={4}>
                No hay perfiles que coincidan con la búsqueda.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </section>
  );
}
