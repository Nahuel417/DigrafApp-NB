import { Skeleton } from "@/components/ui/skeleton";

export default function CatalogsLoading() {
  return (
    <main aria-busy="true" aria-label="Cargando catálogos" className="mx-auto w-full max-w-6xl px-6 py-10 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>
        <Skeleton className="h-8 w-28 rounded-full" />
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="h-fit rounded-2xl border border-border bg-card p-2 shadow-xs">
          <div className="flex gap-1 overflow-hidden lg:flex-col">
            {Array.from({ length: 9 }, (_, index) => <Skeleton className="h-11 w-36 shrink-0 rounded-xl lg:w-full" key={index} />)}
          </div>
        </div>
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
          <div className="grid-paper flex items-center gap-3 border-b border-border px-6 py-5">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <div className="border-b border-border px-6 py-5">
            <Skeleton className="h-4 w-full max-w-xl" />
            <div className="mt-4 grid gap-4 md:grid-cols-2"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></div>
            <Skeleton className="mt-4 h-10 w-32 rounded-xl" />
          </div>
          <div className="px-6 py-5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-4 w-28" />
            <div className="mt-4 flex flex-col gap-2"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /></div>
          </div>
        </section>
      </div>
    </main>
  );
}
