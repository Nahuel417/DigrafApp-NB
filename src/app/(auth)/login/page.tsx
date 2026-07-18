import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/components/login-form";
import { getCurrentProfile } from "@/lib/auth/current-profile";

export default async function LoginPage() {
  const profile = await getCurrentProfile();

  if (profile) {
    redirect(profile.mustChangePassword ? "/change-password" : "/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
      <section className="w-full border-y border-[var(--border)] bg-[var(--surface)] px-6 py-10 shadow-[8px_8px_0_var(--border)] sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--accent)]">
          Digraf interno
        </p>
        <h1 className="mt-4 text-5xl font-black uppercase leading-[0.88] tracking-[-0.06em]">
          Ingresar
        </h1>
        <p className="mt-5 text-[var(--muted)]">
          Usá las credenciales asignadas por la administración.
        </p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
