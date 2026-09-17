"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { LogoutForm } from "@/features/auth/components/logout-form";

import { AppNavigation, type AppNavigationCapabilities } from "./app-navigation";
import { BrandLockup } from "./brand-lockup";

type MobileNavigationProps = {
  capabilities: AppNavigationCapabilities;
  displayName: string;
  initials: string;
  roleName: string;
};

export function MobileNavigation({ capabilities, displayName, initials, roleName }: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      wasOpenRef.current = true;
      if (!dialog.open) dialog.showModal();
      const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }

    if (dialog.open) dialog.close();
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const frame = window.requestAnimationFrame(() => triggerRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-sidebar-border bg-sidebar/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <BrandLockup className="min-w-0 gap-2" compact tagline="Operaciones internas" />
          <Button
            aria-controls="mobile-navigation-dialog"
            aria-expanded={open}
            aria-label={open ? "Cerrar navegación" : "Abrir navegación"}
            className="size-11 shrink-0"
            onClick={() => setOpen((current) => !current)}
            ref={triggerRef}
            size="icon"
            type="button"
            variant="outline"
          >
            <Menu aria-hidden="true" />
          </Button>
        </div>
      </header>

      <dialog
        aria-labelledby="mobile-navigation-title"
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 shadow-none backdrop:bg-transparent"
        id="mobile-navigation-dialog"
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        ref={dialogRef}
      >
        <div
          className="flex h-full w-full bg-foreground/20 backdrop-blur-[2px]"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <aside className="flex h-full w-[min(20rem,calc(100vw-2rem))] max-w-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sidebar-border px-4 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-label text-muted-foreground">Menú</p>
                <h2 className="mt-1 text-base font-semibold tracking-tight" id="mobile-navigation-title">Navegación</h2>
              </div>
              <Button aria-label="Cerrar navegación" className="size-11 shrink-0" onClick={() => setOpen(false)} ref={closeButtonRef} size="icon" type="button" variant="ghost">
                <X aria-hidden="true" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
              <AppNavigation ariaLabel="Navegación principal móvil" capabilities={capabilities} onNavigate={() => setOpen(false)} />
            </div>

            <div className="shrink-0 border-t border-sidebar-border p-3">
              <div className="flex items-center gap-3 rounded-2xl border border-sidebar-border bg-muted p-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">{initials}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{displayName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{roleName}</p>
                </div>
                <LogoutForm buttonClassName="size-11 shrink-0 p-0 text-[0px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive" size="icon" />
              </div>
            </div>
          </aside>
        </div>
      </dialog>
    </>
  );
}
