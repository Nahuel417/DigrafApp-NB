export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-16 sm:px-10">
      <section className="grid w-full gap-10 border-y border-[var(--border)] py-12 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.28em] text-[var(--accent)]">
            Gráfica textil
          </p>
          <h1 className="max-w-4xl text-6xl font-black uppercase leading-[0.85] tracking-[-0.07em] sm:text-8xl md:text-9xl">
            Digraf
          </h1>
          <p className="mt-8 max-w-xl text-base leading-7 text-[var(--muted)] sm:text-lg">
            Base técnica inicial para el flujo interno de producción.
          </p>
        </div>
        <div className="border-l-4 border-[var(--accent)] pl-4 md:mb-2">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
            Estado
          </p>
          <p className="mt-2 font-semibold">Scaffold operativo</p>
        </div>
      </section>
    </main>
  );
}
