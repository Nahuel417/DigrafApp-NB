import { ShieldCheck } from "lucide-react";

import { MutationNotice } from "@/components/mutation-notice";
import { AuthBrandPanel } from "@/features/auth/components/auth-brand-panel";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { LogoutForm } from "@/features/auth/components/logout-form";
import { requireMandatoryPasswordChange } from "@/lib/auth/guards";

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireMandatoryPasswordChange();
  const { notice } = await searchParams;

  return (
    <main className="flex min-h-screen bg-background font-sans">
      <MutationNotice notice={notice} />
      <section className="relative flex w-full shrink-0 flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-success to-primary/40" />
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center gap-3">
            <div className="relative grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <span className="text-base font-semibold">D</span>
              <span aria-hidden="true" className="absolute -right-1 -top-1 size-3 rounded-full bg-success ring-2 ring-background" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">Digraf</p>
              <p className="text-[11px] text-muted-foreground">Impresión textil · Operaciones internas</p>
            </div>
          </div>

          <div className="mt-10">
            <p className="text-xs font-medium uppercase tracking-label text-primary">Primer ingreso</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-display text-foreground">Cambiá tu contraseña</h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Por seguridad, necesitás reemplazar la contraseña temporal antes de continuar.
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-xs">
            <ChangePasswordForm />
          </div>

          <LogoutForm
            buttonClassName="w-full rounded-xl border-border bg-transparent text-muted-foreground shadow-none hover:bg-accent hover:text-foreground"
            className="mt-5"
            label="Cerrar sesión"
            showIcon={false}
            size="default"
            variant="outline"
          />

          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-xs">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success">
              <ShieldCheck aria-hidden="true" className="size-[18px]" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">Cuenta protegida</p>
              <p className="text-[11px] leading-4 text-muted-foreground">Después de guardar, vas a poder continuar al panel.</p>
            </div>
          </div>
        </div>
      </section>
      <AuthBrandPanel />
    </main>
  );
}
