import Link from "next/link";
import { CalendarDays, Layers3, Plus, Search, Sparkles } from "lucide-react";
import { OrderBoard } from "@/features/board/components/order-board";
import { getOrderBoard } from "@/features/board/queries";
import { requireActiveProfile } from "@/lib/auth/guards";
import { canConfirmPayment, canCreateManualOrder, canDeliverPaidOrder } from "@/lib/auth/permissions";
import { Input } from "@/components/ui/input";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const profile = await requireActiveProfile();
  const { search = "" } = await searchParams;
  const board = await getOrderBoard(profile.role, search);

  return (
    <main className="mx-auto flex w-full max-w-[100rem] flex-col overflow-x-hidden px-4 py-6 sm:px-6 lg:h-dvh lg:min-h-0 lg:overflow-clip lg:[contain:layout_paint] lg:px-10 lg:py-8">
      <header className="flex shrink-0 flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-label text-muted-foreground"><Sparkles aria-hidden="true" className="size-3" /> Pedidos</p>
          <h1 aria-label="Tablero de pedidos" className="mt-2 text-2xl font-semibold tracking-display sm:text-3xl">Tablero de producción</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Arrastrá o mové cada pedido entre etapas. Todos los cambios quedan registrados.</p>
        </div>
        <div className="flex flex-col gap-2 xs:flex-row sm:items-center">
          <form className="flex min-w-0 items-center gap-2" method="get" role="search">
            <label className="relative min-w-0 flex-1 sm:w-56" htmlFor="order-board-search">
              <span className="sr-only">Buscar por cliente, equipo o teléfono</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-10 rounded-xl bg-card pl-9" defaultValue={search} id="order-board-search" name="search" placeholder="Buscar pedido..." />
            </label>
            <button className="sr-only" type="submit">Buscar</button>
            {search ? <Link className="shrink-0 rounded-lg px-2 py-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" href="/orders">Limpiar</Link> : null}
          </form>
          {canCreateManualOrder(profile.role) ? <Link className="group inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98] motion-reduce:transition-none" href="/orders/new"><Plus aria-hidden="true" className="size-4 transition-transform duration-150 group-hover:rotate-90 motion-reduce:transition-none" />Nuevo pedido</Link> : null}
        </div>
      </header>
      <div className="mt-5 flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5"><Layers3 aria-hidden="true" className="size-3.5 text-primary" />Seguimiento por etapas</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5"><CalendarDays aria-hidden="true" className="size-3.5 text-primary" />Día operativo actual</span>
      </div>
      <OrderBoard canConfirmPayment={canConfirmPayment(profile.role)} canDeliverPaidOrders={canDeliverPaidOrder(profile.role)} canCreateOrders={canCreateManualOrder(profile.role)} initialColumns={board.columns} />
    </main>
  );
}
