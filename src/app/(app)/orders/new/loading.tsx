import { Skeleton } from "@/components/ui/skeleton";

export default function NewOrderLoading() {
  return (
    <main aria-busy="true" aria-label="Cargando alta de pedido" className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </header>
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="border-b border-border px-5 py-4"><Skeleton className="h-5 w-36" /><Skeleton className="mt-2 h-4 w-full max-w-xl" /></div>
        <div className="flex flex-col gap-7 p-5">
          {Array.from({ length: 5 }, (_, section) => (
            <div className="flex flex-col gap-4" key={section}>
              <Skeleton className="h-5 w-32" />
              <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
