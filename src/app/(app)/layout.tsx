import { AppNavigation } from "@/components/app-navigation";
import { LogoutForm } from "@/features/auth/components/logout-form";
import { roleLabel } from "@/features/users/schemas";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireActiveProfile();
  const canManageUsers = profile.role === "super_admin" || profile.role === "admin";
  const initials = profile.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-md transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        href="#main-content"
      >
        Saltar al contenido
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-[4.5rem] shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
          <div>
            <p className="text-base font-semibold leading-none">Digraf</p>
            <p className="mt-1 text-xs text-muted-foreground">Operaciones internas</p>
          </div>
        </div>

        <div className="flex-1 px-3 py-5">
          <p className="mb-2 px-3 text-[0.6875rem] font-semibold uppercase tracking-label text-muted-foreground">
            Navegación
          </p>
          <AppNavigation canManageUsers={canManageUsers} />
        </div>

        <div className="border-t border-sidebar-border p-3">
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-xs font-semibold text-foreground shadow-xs">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{profile.displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{roleLabel(profile.role)}</p>
              </div>
            </div>
            <LogoutForm buttonClassName="w-full justify-start" className="mt-2" />
          </div>
        </div>
      </aside>

      <div className="min-w-0">
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
            <AppNavigation canManageUsers={canManageUsers} compact />
          </div>
        </header>

        <div id="main-content" tabIndex={-1}>{children}</div>
      </div>
    </div>
  );
}
