import { redirect } from "next/navigation";

import { MutationNotice } from "@/components/mutation-notice";
import { LoginForm } from "@/features/auth/components/login-form";
import { getCurrentProfile } from "@/lib/auth/current-profile";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const profile = await getCurrentProfile();
  const { notice } = await searchParams;

  if (profile) {
    redirect(profile.mustChangePassword ? "/change-password" : "/dashboard");
  }

  return (
    <main className="flex min-h-dvh items-start justify-center bg-background px-4 py-8 sm:items-center sm:px-6 sm:py-10">
      <MutationNotice notice={notice} />
      <section className="w-full max-w-[26rem] rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
          <p className="text-sm font-semibold">Digraf</p>
        </div>
        <h1 className="mt-7 text-2xl font-semibold tracking-display">Ingresar</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Usá las credenciales asignadas por la administración.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
