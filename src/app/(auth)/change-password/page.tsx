import { MutationNotice } from "@/components/mutation-notice";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { LogoutForm } from "@/features/auth/components/logout-form";
import { requireMandatoryPasswordChange } from "@/lib/auth/guards";

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireMandatoryPasswordChange();
  const { notice } = await searchParams;

  return (
    <main className="flex min-h-dvh items-start justify-center bg-background px-4 py-8 sm:items-center sm:px-6 sm:py-10">
      <MutationNotice notice={notice} />
      <section className="w-full max-w-[28rem] rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
          <p className="text-sm font-semibold">Digraf</p>
        </div>
        <p className="mt-7 text-xs font-medium uppercase tracking-label text-primary">Primer ingreso</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-display">Cambiá tu contraseña</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Por seguridad, necesitás reemplazar la contraseña temporal antes de continuar.
        </p>
        <div className="mt-6">
          <ChangePasswordForm />
        </div>
        <LogoutForm buttonClassName="w-full" className="mt-5" label="Cerrar sesión" showIcon={false} size="default" />
      </section>
    </main>
  );
}
