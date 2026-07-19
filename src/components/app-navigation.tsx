"use client";

import { LayoutDashboard, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type AppNavigationProps = {
  canManageUsers: boolean;
  compact?: boolean;
};

const navigationItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Panel" },
  { href: "/users", icon: Users, label: "Usuarios", requiresManagement: true },
];

export function AppNavigation({ canManageUsers, compact = false }: AppNavigationProps) {
  const pathname = usePathname();
  const items = navigationItems.filter((item) => !item.requiresManagement || canManageUsers);

  return (
    <nav
      aria-label={compact ? "Navegación principal móvil" : "Navegación principal"}
      className={cn(compact ? "flex gap-1" : "flex flex-col gap-1")}
    >
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-sidebar-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
              compact && "min-h-11 flex-1 justify-center",
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
