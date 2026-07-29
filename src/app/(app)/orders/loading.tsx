import { Skeleton } from "@/components/ui/skeleton";

export default function OrdersLoading() {
  return (
    <main aria-busy="true" aria-label="Cargando tablero de pedidos" className="mx-auto flex w-full max-w-[100rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-col gap-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-9 w-64" /><Skeleton className="h-5 w-full max-w-2xl" /></header>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 8 }, (_, index) => <section className="w-72 shrink-0 rounded-xl border border-border p-4" key={index}><Skeleton className="h-5 w-36" /><Skeleton className="mt-4 h-40" /></section>)}
      </div>
    </main>
  );
}
