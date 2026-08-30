import { ClipboardPlus, CircleCheck, Kanban, LayoutGrid, ListOrdered, ListTree, Users, WalletCards } from "lucide-react";
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
    { allowed: true, description: "Seguimiento del tablero de producción por etapas.", href: "/orders", icon: Kanban, label: "Pedidos" },
    { allowed: canOperateCash(profile), description: "Apertura, ingresos y egresos del día con trazabilidad.", href: "/cash", icon: WalletCards, label: "Caja diaria" },
    { allowed: canCreateManualOrder(profile.role), description: "Alta manual de pedidos con sus especificaciones.", href: "/orders/new", icon: ClipboardPlus, label: "Nuevo pedido" },
    { allowed: canManageCatalogs(profile.role), description: "Prendas, telas, cuellos y moldes disponibles.", href: "/catalogs", icon: ListTree, label: "Catálogos" },
    { allowed: canManageStages(profile.role), description: "Recorrido operativo configurable del tablero.", href: "/stages", icon: ListOrdered, label: "Etapas" },
    { allowed: canManageUsers(profile.role), description: "Perfiles internos, roles y accesos del equipo.", href: "/users", icon: Users, label: "Usuarios" },
  ].filter((item) => item.allowed);
  const moduleItems = accessItems.filter((item) => item.href !== "/orders/new");

  const initials = profile.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? "")
    .join("") || "DG";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-8 lg:py-8">
      <MutationNotice notice={notice} />
      <header>
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-label text-muted-foreground">
          <span className="inline-flex size-4 items-center justify-center text-foreground">
            <LayoutGrid aria-hidden="true" className="size-3" />
          </span>
          Vista general
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-display sm:text-3xl">Panel general</h1>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Acceso interno de Digraf. Los módulos operativos se incorporan por etapas del MVP.
          </p>
          <Badge className="font-sans" variant="active">
            <CircleCheck aria-hidden="true" data-icon="inline-start" />
            Sesión activa
          </Badge>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xs">
        <div className="dashboard-profile-strip flex flex-col gap-5 border-b border-border/60 px-5 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm"
            >
              {initials}
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-label text-muted-foreground">Perfil actual</p>
              <p className="mt-1 break-words text-base font-semibold leading-tight text-foreground">{profile.displayName}</p>
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CircleCheck aria-hidden="true" className="size-3 text-success" />
                Perfil validado y acceso habilitado
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 md:justify-self-end md:text-right">
            <div>
              <p className="text-xs font-medium uppercase tracking-label text-muted-foreground">Módulos</p>
              <p className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">{moduleItems.length}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-label text-muted-foreground">Rol</p>
              <p className="mt-1 text-base font-semibold text-foreground">{roleLabel(profile.role)}</p>
            </div>
          </div>
        </div>

        <div className="bg-card p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {moduleItems.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  className="group flex min-h-[124px] h-full flex-col items-start rounded-2xl border border-border/60 bg-background p-4 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none"
                  href={item.href}
                  key={item.href}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-primary transition-colors group-hover:bg-primary/10"
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 mt-3">
                    <span className="block text-sm font-semibold leading-5 text-foreground">{item.label}</span>
                    <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{item.description}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
