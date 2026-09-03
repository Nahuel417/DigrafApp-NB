import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { AppNavigation } from "@/components/app-navigation";
import { BrandLockup } from "@/components/brand-lockup";
import { LogoutForm } from "@/features/auth/components/logout-form";
import { roleLabel } from "@/features/users/schemas";
import { requireActiveProfile } from "@/lib/auth/guards";
import { canArchiveDeliveredOrder, canCreateManualOrder, canManageCatalogs, canManageOrderLifecycle, canManageStages, canManageUsers, canOperateCash } from "@/lib/auth/permissions";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireActiveProfile();
  const capabilities = {
    canCreateOrders: canCreateManualOrder(profile.role),
    canManageCatalogs: canManageCatalogs(profile.role),
    canManageStages: canManageStages(profile.role),
    canManageUsers: canManageUsers(profile.role),
    canManageOrderLifecycle: canManageOrderLifecycle(profile.role),
    canArchiveDeliveredOrder: canArchiveDeliveredOrder(profile.role),
    canOperateCash: canOperateCash(profile),
  };
  const initials = profile.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="app-shell min-h-dvh bg-background lg:fixed lg:inset-0 lg:h-dvh lg:min-h-0 lg:w-full lg:overflow-hidden lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <a
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-md transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        href="#main-content"
      >
        Saltar al contenido
      </a>
      <aside className="app-sidebar fixed inset-y-0 left-0 z-40 hidden h-dvh w-[15.5rem] min-h-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="sidebar-header flex shrink-0 items-center gap-3 px-4 py-4">
          <BrandLockup className="sidebar-brand" textClassName="sidebar-label" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
          <p className="sidebar-label mb-2 px-3 text-[0.6875rem] font-semibold uppercase tracking-label text-muted-foreground">
            Navegación
          </p>
          <AppNavigation capabilities={capabilities} />
        </div>

        <div className="shrink-0 px-3 pb-3">
          <input
            aria-controls="primary-navigation"
            aria-label="Mostrar u ocultar navegación lateral"
            className="peer sr-only"
            id="sidebar-toggle"
            type="checkbox"
          />
          <label
            className="sidebar-collapse mb-3 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-sidebar-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-sidebar"
            htmlFor="sidebar-toggle"
            title="Mostrar u ocultar navegación lateral"
          >
            <PanelLeftClose aria-hidden="true" className="sidebar-collapse-expanded size-[18px]" />
            <PanelLeftOpen aria-hidden="true" className="sidebar-collapse-collapsed size-[18px]" />
            <span className="sidebar-label">Contraer</span>
          </label>

          <div className="sidebar-profile flex items-center gap-3 rounded-2xl border border-sidebar-border bg-muted p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
              {initials}
            </span>
            <div className="sidebar-label min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{profile.displayName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{roleLabel(profile.role)}</p>
            </div>
            <LogoutForm
              buttonClassName="sidebar-logout-button size-9 p-0 text-[0px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              className="sidebar-logout shrink-0"
            />
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:col-start-2 lg:min-h-0 lg:overflow-y-auto">
        <header className="sticky top-0 z-40 border-b border-sidebar-border bg-sidebar/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <BrandLockup className="min-w-0 gap-2" compact tagline={profile.displayName} />
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
