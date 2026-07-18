import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { logoutAction } from "@/features/auth/actions";
import { requireMandatoryPasswordChange } from "@/lib/auth/guards";

export default async function ChangePasswordPage() {
  await requireMandatoryPasswordChange();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
      <section className="w-full border-y border-[var(--border)] bg-[var(--surface)] px-6 py-10 shadow-[8px_8px_0_var(--border)] sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--accent)]">
          Primer ingreso
        </p>
        <h1 className="mt-4 text-4xl font-black uppercase leading-[0.9] tracking-[-0.06em]">
          Cambiá tu contraseña
        </h1>
        <p className="mt-5 text-[var(--muted)]">
          Por seguridad, necesitás reemplazar la contraseña temporal antes de continuar.
        </p>
        <div className="mt-8">
          <ChangePasswordForm />
        </div>
        <form action={logoutAction} className="mt-5">
          <button
            className="text-sm font-semibold underline decoration-[var(--accent)] underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            type="submit"
          >
            Cerrar sesión
          </button>
        </form>
      </section>
    </main>
  );
}
