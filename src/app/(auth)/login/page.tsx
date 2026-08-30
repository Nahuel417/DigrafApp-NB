import { CheckCircle2 } from "lucide-react";
import { redirect } from "next/navigation";

import { MutationNotice } from "@/components/mutation-notice";
import { AuthBrandPanel } from "@/features/auth/components/auth-brand-panel";
import { LoginForm } from "@/features/auth/components/login-form";
import { getCurrentProfile } from "@/lib/auth/current-profile";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const profile = await getCurrentProfile();
  const { notice } = await searchParams;

  if (profile) {
    redirect(profile.mustChangePassword ? "/change-password" : "/dashboard");
  }

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
            <h1 className="text-3xl font-semibold tracking-display text-foreground">Ingresar</h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Usá las credenciales asignadas por la administración para acceder al panel de operaciones.
            </p>
          </div>

          <div className="mt-8">
            <LoginForm />
          </div>

          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-xs">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success">
              <CheckCircle2 aria-hidden="true" className="size-[18px]" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">Sistema operativo</p>
              <p className="font-mono text-[11px] leading-4 text-muted-foreground">Versión estable · v1.4.0</p>
            </div>
          </div>
        </div>
      </section>
      <AuthBrandPanel />
    </main>
  );
}
