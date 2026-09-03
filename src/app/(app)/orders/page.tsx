import Link from "next/link";
import { CalendarDays, Layers3, Plus, Sparkles } from "lucide-react";
import { OrderBoard } from "@/features/board/components/order-board";
import { getOrderBoard } from "@/features/board/queries";
import { requireActiveProfile } from "@/lib/auth/guards";
import { canConfirmPayment, canCreateManualOrder, canDeliverPaidOrder } from "@/lib/auth/permissions";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const profile = await requireActiveProfile();
  const { search = "" } = await searchParams;
  const board = await getOrderBoard(profile.role, search);

  return (
    <main className="mx-auto flex w-full max-w-[100rem] flex-col overflow-x-hidden px-4 py-6 sm:px-6 lg:h-dvh lg:min-h-0 lg:overflow-clip lg:[contain:layout_paint] lg:px-10 lg:py-8">
      <header className="flex shrink-0 items-start justify-between gap-5">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-label text-muted-foreground"><Sparkles aria-hidden="true" className="size-3" /> Pedidos</p>
          <h1 aria-label="Tablero de pedidos" className="mt-2 text-2xl font-semibold tracking-display sm:text-3xl">Tablero de producción</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Arrastrá o mové cada pedido entre etapas y consultá sus datos desde la vista rápida.</p>
        </div>
        {canCreateManualOrder(profile.role) ? <Link className="group inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98] motion-reduce:transition-none" href="/orders/new"><Plus aria-hidden="true" className="size-4 transition-transform duration-150 group-hover:rotate-90 motion-reduce:transition-none" />Nuevo pedido</Link> : null}
      </header>
      <div className="mt-5 flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5"><Layers3 aria-hidden="true" className="size-3.5 text-primary" />Seguimiento por etapas</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5"><CalendarDays aria-hidden="true" className="size-3.5 text-primary" />Día operativo actual</span>
      </div>
      <OrderBoard canConfirmPayment={canConfirmPayment(profile.role)} canDeliverPaidOrders={canDeliverPaidOrder(profile.role)} canCreateOrders={canCreateManualOrder(profile.role)} initialColumns={board.columns} initialSearch={search} />
    </main>
  );
}
