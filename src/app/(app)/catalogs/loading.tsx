import { Skeleton } from "@/components/ui/skeleton";

export default function CatalogsLoading() {
  return (
    <main aria-busy="true" aria-label="Cargando catálogos" className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </header>
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
        </div>
        <div className="grid lg:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="flex gap-2 overflow-hidden border-b p-3 lg:flex-col lg:border-b-0 lg:border-r">
            {Array.from({ length: 6 }, (_, index) => <Skeleton className="h-11 w-36 shrink-0 lg:w-full" key={index} />)}
          </div>
          <div className="flex flex-col gap-5 p-5">
            <Skeleton className="h-5 w-28" />
            <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-5 w-32" />
            <div className="flex flex-col gap-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
          </div>
        </div>
      </section>
    </main>
  );
}
