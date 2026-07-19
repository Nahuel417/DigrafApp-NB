import { Skeleton } from "@/components/ui/skeleton";

export default function UsersLoading() {
  return (
    <main aria-busy="true" aria-label="Cargando usuarios" className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </header>
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full" />
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-16" key={index} />)}
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-2 h-4 w-24" />
        </div>
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 3 }, (_, index) => <Skeleton className="h-24" key={index} />)}
        </div>
      </section>
    </main>
  );
}
