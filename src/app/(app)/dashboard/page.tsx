import { ClipboardPlus, CircleCheck, Kanban, ListOrdered, ListTree, Users, WalletCards } from "lucide-react";
import Link from "next/link";

import { MutationNotice } from "@/components/mutation-notice";
import { Badge } from "@/components/ui/badge";
import { roleLabel } from "@/features/users/schemas";
import { requireActiveProfile } from "@/lib/auth/guards";
import { canCreateManualOrder, canManageCatalogs, canManageStages, canManageUsers, canOperateCash } from "@/lib/auth/permissions";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const profile = await requireActiveProfile();
  const { notice } = await searchParams;
  const accessItems = [
    { allowed: true, description: "Consultá y actualizá el avance de los pedidos.", href: "/orders", icon: Kanban, label: "Pedidos" },
    { allowed: canOperateCash(profile), description: "Registrá y consultá los movimientos de caja.", href: "/cash", icon: WalletCards, label: "Caja" },
    { allowed: canCreateManualOrder(profile.role), description: "Cargá un pedido manual con sus especificaciones.", href: "/orders/new", icon: ClipboardPlus, label: "Nuevo pedido" },
    { allowed: canManageCatalogs(profile.role), description: "Administrá las opciones disponibles para los pedidos.", href: "/catalogs", icon: ListTree, label: "Catálogos" },
    { allowed: canManageStages(profile.role), description: "Configurá las etapas del flujo de trabajo.", href: "/stages", icon: ListOrdered, label: "Etapas" },
    { allowed: canManageUsers(profile.role), description: "Gestioná perfiles, roles y accesos internos.", href: "/users", icon: Users, label: "Usuarios" },
  ].filter((item) => item.allowed);

  return (
    <main className="mx-auto flex w-full max-w-[72rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <MutationNotice notice={notice} />
      <header>
        <p className="text-sm text-muted-foreground">Vista general</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Panel general</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Acceso interno de Digraf. Los módulos operativos se incorporan por etapas del MVP.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Estado de la sesión</h2>
            <p className="mt-1 text-sm text-muted-foreground">Perfil validado y acceso habilitado.</p>
          </div>
          <Badge variant="active">
            <CircleCheck aria-hidden="true" data-icon="inline-start" />
            Sesión activa
          </Badge>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <article className="rounded-lg border border-border p-4">
            <p className="text-xs font-medium uppercase tracking-label text-muted-foreground">Perfil actual</p>
            <p className="mt-3 break-words text-lg font-semibold">{profile.displayName}</p>
            <p className="mt-1 text-sm text-muted-foreground">{roleLabel(profile.role)}</p>
          </article>

          <article className="min-w-0 rounded-lg border border-border p-4">
            <h2 className="font-semibold">Accesos permitidos</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">Módulos disponibles para tu perfil activo.</p>
            <nav aria-label="Accesos permitidos" className="mt-3">
              <ul className="divide-y divide-border rounded-md border border-border">
                {accessItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <li key={item.href}>
                      <Link
                        className="flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        href={item.href}
                      >
                        <Icon aria-hidden="true" className="size-[1.125rem] shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{item.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </article>
        </div>
      </section>
    </main>
  );
}
