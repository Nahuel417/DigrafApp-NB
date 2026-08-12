import { Skeleton } from "@/components/ui/skeleton";

export default function StagesLoading() {
  return (
    <main aria-busy="true" aria-label="Cargando etapas" className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </header>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="border-b border-border px-5 py-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
          </div>
          <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-16" />
              <Skeleton className="h-11 w-36" />
            </div>
            <Skeleton className="h-px w-full" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-32" key={index} />)}
            </div>
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="border-b border-border px-5 py-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="mt-2 h-4 w-44" />
          </div>
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </section>
      </div>
    </main>
  );
}
