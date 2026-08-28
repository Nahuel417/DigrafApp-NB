"use client";

import { Archive, ClipboardPlus, Kanban, LayoutDashboard, ListOrdered, ListTree, Users, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type AppNavigationProps = {
  capabilities: {
    canCreateOrders: boolean;
    canManageCatalogs: boolean;
    canManageStages: boolean;
    canManageUsers: boolean;
    canManageOrderLifecycle: boolean;
    canArchiveDeliveredOrder: boolean;
    canOperateCash: boolean;
  };
  compact?: boolean;
};

type Capability = keyof AppNavigationProps["capabilities"];

const navigationItems: Array<{
  capability?: Capability;
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
}> = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Panel" },
  { href: "/orders", icon: Kanban, label: "Pedidos" },
  { href: "/orders/archives", icon: Archive, label: "Archivo", capability: "canManageOrderLifecycle" },
  { href: "/cash", icon: WalletCards, label: "Caja", capability: "canOperateCash" },
  { href: "/orders/new", icon: ClipboardPlus, label: "Nuevo pedido", capability: "canCreateOrders" },
  { href: "/catalogs", icon: ListTree, label: "Catálogos", capability: "canManageCatalogs" },
  { href: "/stages", icon: ListOrdered, label: "Etapas", capability: "canManageStages" },
  { href: "/users", icon: Users, label: "Usuarios", capability: "canManageUsers" },
];

export function AppNavigation({ capabilities, compact = false }: AppNavigationProps) {
  const pathname = usePathname();
  const items = navigationItems.filter((item) => !item.capability || capabilities[item.capability]);
  const activeHref = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .toSorted((left, right) => right.href.length - left.href.length)[0]?.href;

  return (
    <nav
      aria-label={compact ? "Navegación principal móvil" : "Navegación principal"}
      className={cn(compact ? "grid grid-cols-2 gap-1" : "flex flex-col gap-1")}
      id={compact ? undefined : "primary-navigation"}
    >
      {items.map((item) => {
        const active = item.href === activeHref;
        const Icon = item.icon;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "app-navigation-link group relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
              compact && "min-h-11 justify-center text-center",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
            href={item.href}
            key={item.href}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary transition-all duration-200",
                active ? "opacity-100" : "scale-y-0 opacity-0",
              )}
            />
            <Icon
              aria-hidden="true"
              className={cn(
                "size-[1.125rem] shrink-0 transition-transform duration-200 group-hover:scale-110",
                active && "text-primary",
              )}
            />
            <span className="sidebar-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
