import { requireActiveProfile } from "@/lib/auth/guards";
import Link from "next/link";

export default async function DashboardPage() {
  const profile = await requireActiveProfile();

  return (
    <main className="py-16">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--accent)]">
        Sesión activa
      </p>
      <h1 className="mt-4 text-6xl font-black uppercase leading-[0.85] tracking-[-0.07em] sm:text-8xl">
        Digraf
      </h1>
      <p className="mt-8 max-w-xl text-lg leading-8 text-[var(--muted)]">
        Accediste con un perfil activo de tipo {profile.role.replace("_", " ")}. Los módulos
        operativos se habilitarán en los próximos cortes del MVP.
      </p>
      {profile.role === "super_admin" || profile.role === "admin" ? (
        <Link className="mt-8 inline-block border border-[var(--foreground)] px-4 py-2 text-sm font-bold uppercase tracking-[0.1em]" href="/users">
          Gestionar usuarios
        </Link>
      ) : null}
    </main>
  );
}
