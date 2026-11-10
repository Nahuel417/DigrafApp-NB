"use client";

import { Archive, Boxes, Calculator, ChartNoAxesCombined, CirclePlus, ClipboardList, Layers, LayoutGrid, ListChecks, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type AppNavigationCapabilities = {
  canCreateOrders: boolean;
  canManageCatalogs: boolean;
  canManageStages: boolean;
  canManageUsers: boolean;
  canManageOrderLifecycle: boolean;
  canArchiveDeliveredOrder: boolean;
  canOperateCash: boolean;
  canManagePrices?: boolean;
  canViewMetrics?: boolean;
};

type AppNavigationProps = {
  ariaLabel?: string;
  capabilities: AppNavigationCapabilities;
  onNavigate?: () => void;
};

type Capability = keyof AppNavigationProps["capabilities"];

const navigationItems: Array<{
  capability?: Capability;
  href: string;
  icon: typeof LayoutGrid;
  label: string;
}> = [
  { href: "/dashboard", icon: LayoutGrid, label: "Panel" },
  { href: "/orders", icon: ClipboardList, label: "Pedidos" },
  { href: "/orders/archives", icon: Archive, label: "Archivo", capability: "canManageOrderLifecycle" },
  { href: "/cash", icon: Wallet, label: "Caja", capability: "canOperateCash" },
  { href: "/stock", icon: Boxes, label: "Stock" },
  { href: "/orders/new", icon: CirclePlus, label: "Nuevo pedido", capability: "canCreateOrders" },
  { href: "/catalogs", icon: Layers, label: "Catálogos", capability: "canManageCatalogs" },
  { href: "/commercial", icon: Calculator, label: "Cotizador", capability: "canManagePrices" },
  { href: "/metrics", icon: ChartNoAxesCombined, label: "Métricas", capability: "canViewMetrics" },
  { href: "/stages", icon: ListChecks, label: "Etapas", capability: "canManageStages" },
  { href: "/users", icon: Users, label: "Usuarios", capability: "canManageUsers" },
];

export function AppNavigation({ ariaLabel = "Navegación principal", capabilities, onNavigate }: AppNavigationProps) {
  const pathname = usePathname();
  const items = navigationItems.filter((item) => !item.capability || capabilities[item.capability]);
  const activeHref = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .toSorted((left, right) => right.href.length - left.href.length)[0]?.href;

  return (
    <nav
      aria-label={ariaLabel}
      className="flex flex-col gap-1"
      id={ariaLabel === "Navegación principal" ? "primary-navigation" : undefined}
    >
      {items.map((item) => {
        const active = item.href === activeHref;
        const Icon = item.icon;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "app-navigation-link group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
              active
                ? "bg-sidebar-accent font-medium text-primary"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary transition-all duration-150 motion-reduce:transition-none",
                active ? "opacity-100" : "scale-y-0 opacity-0",
              )}
            />
            <Icon
              aria-hidden="true"
              className={cn(
                "size-[1.125rem] shrink-0 transition-transform duration-150 group-hover:scale-110 group-focus-visible:scale-110 group-active:scale-95 motion-reduce:transform-none",
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
