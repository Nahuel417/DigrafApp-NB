"use client";

import { ClipboardPlus, Kanban, LayoutDashboard, ListTree, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type AppNavigationProps = {
  capabilities: {
    canCreateOrders: boolean;
    canManageCatalogs: boolean;
    canManageUsers: boolean;
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
  { href: "/orders/new", icon: ClipboardPlus, label: "Nuevo pedido", capability: "canCreateOrders" },
  { href: "/catalogs", icon: ListTree, label: "Catálogos", capability: "canManageCatalogs" },
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
    >
      {items.map((item) => {
        const active = item.href === activeHref;
        const Icon = item.icon;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-sidebar-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
              compact && "min-h-11 justify-center text-center",
              active
                ? "border-l-2 border-sidebar-primary-foreground/70 bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
            href={item.href}
            key={item.href}
          >
            <Icon aria-hidden="true" className="size-[1.125rem]" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
