import { logoutAction } from "@/features/auth/actions";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireActiveProfile();

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-6 py-8 sm:px-10">
      <header className="flex items-center justify-between border-b border-[var(--border)] pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--accent)]">
            Digraf interno
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">{profile.role.replace("_", " ")}</p>
        </div>
        <form action={logoutAction}>
          <button
            className="border border-[var(--foreground)] px-3 py-2 text-sm font-bold uppercase tracking-[0.12em] transition hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            type="submit"
          >
            Salir
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
