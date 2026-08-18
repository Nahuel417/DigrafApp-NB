import { PanelLeftClose } from "lucide-react";

import { AppNavigation } from "@/components/app-navigation";
import { LogoutForm } from "@/features/auth/components/logout-form";
import { roleLabel } from "@/features/users/schemas";
import { requireActiveProfile } from "@/lib/auth/guards";
import { canCreateManualOrder, canManageCatalogs, canManageStages, canManageUsers, canOperateCash } from "@/lib/auth/permissions";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireActiveProfile();
  const capabilities = {
    canCreateOrders: canCreateManualOrder(profile.role),
    canManageCatalogs: canManageCatalogs(profile.role),
    canManageStages: canManageStages(profile.role),
    canManageUsers: canManageUsers(profile.role),
    canOperateCash: canOperateCash(profile),
  };
  const initials = profile.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="app-shell min-h-dvh bg-background lg:h-dvh lg:min-h-0 lg:overflow-hidden lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-md transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        href="#main-content"
      >
        Saltar al contenido
      </a>
      <aside className="app-sidebar fixed inset-y-0 left-0 z-40 hidden h-dvh w-64 min-h-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="sidebar-header flex h-[4.5rem] shrink-0 items-center justify-between gap-3 border-b border-sidebar-border px-5">
          <div className="sidebar-brand flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
            <div className="sidebar-label">
              <p className="text-base font-semibold leading-none">Digraf</p>
              <p className="mt-1 text-xs text-muted-foreground">Operaciones internas</p>
            </div>
          </div>
          <input
            aria-controls="primary-navigation"
            aria-label="Mostrar u ocultar navegación lateral"
            className="peer sr-only"
            id="sidebar-toggle"
            type="checkbox"
          />
          <label
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-sidebar-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-sidebar"
            htmlFor="sidebar-toggle"
            title="Mostrar u ocultar navegación lateral"
          >
            <PanelLeftClose aria-hidden="true" className="size-[1.125rem]" />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
          <p className="sidebar-label mb-2 px-3 text-[0.6875rem] font-semibold uppercase tracking-label text-muted-foreground">
            Navegación
          </p>
          <AppNavigation capabilities={capabilities} />
        </div>

        <div className="shrink-0 border-t border-sidebar-border p-3">
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-xs font-semibold text-foreground shadow-xs">
                {initials}
              </span>
              <div className="sidebar-label min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{profile.displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{roleLabel(profile.role)}</p>
              </div>
            </div>
            <LogoutForm buttonClassName="sidebar-logout-button w-full justify-start" className="sidebar-logout mt-2" />
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:col-start-2 lg:min-h-0">
        <header className="sticky top-0 z-40 border-b border-sidebar-border bg-sidebar/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-primary" />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-none">Digraf</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{profile.displayName}</p>
              </div>
            </div>
            <LogoutForm buttonClassName="h-11" />
          </div>
          <div className="mt-3">
             <AppNavigation capabilities={capabilities} compact />
          </div>
        </header>

        <div className="lg:min-h-0" id="main-content" tabIndex={-1}>{children}</div>
      </div>
    </div>
  );
}
