import { CircleCheck, Users } from "lucide-react";
import Link from "next/link";

import { MutationNotice } from "@/components/mutation-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { roleLabel } from "@/features/users/schemas";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const profile = await requireActiveProfile();
  const { notice } = await searchParams;
  const canManageUsers = profile.role === "super_admin" || profile.role === "admin";

  return (
    <main className="mx-auto flex w-full max-w-[72rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <MutationNotice notice={notice} />
      <header>
        <p className="text-sm text-muted-foreground">Vista general</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Panel general</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Acceso interno de Digraf. Los módulos operativos se incorporan por etapas del MVP.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Estado de la sesión</h2>
            <p className="mt-1 text-sm text-muted-foreground">Perfil validado y acceso habilitado.</p>
          </div>
          <Badge variant="active">
            <CircleCheck aria-hidden="true" data-icon="inline-start" />
            Sesión activa
          </Badge>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <article className="rounded-lg border border-border p-4">
            <p className="text-xs font-medium uppercase tracking-label text-muted-foreground">Perfil actual</p>
            <p className="mt-3 break-words text-lg font-semibold">{profile.displayName}</p>
            <p className="mt-1 text-sm text-muted-foreground">{roleLabel(profile.role)}</p>
          </article>

          <article className="flex flex-col rounded-lg border border-border p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Users aria-hidden="true" className="size-4" />
              </span>
              <div>
                <h2 className="font-semibold">Gestión del equipo</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  {canManageUsers
                    ? "Administrá perfiles internos según los permisos de tu rol."
                    : "Tu perfil no administra cuentas internas."}
                </p>
              </div>
            </div>
            {canManageUsers ? (
              <Button asChild className="mt-5 w-fit" size="sm" variant="outline">
                <Link href="/users">Gestionar usuarios</Link>
              </Button>
            ) : null}
          </article>
        </div>
      </section>
    </main>
  );
}
