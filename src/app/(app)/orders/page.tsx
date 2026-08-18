import Link from "next/link";
import { OrderBoard } from "@/features/board/components/order-board";
import { getOrderBoard } from "@/features/board/queries";
import { requireActiveProfile } from "@/lib/auth/guards";
import { canConfirmPayment, canCreateManualOrder } from "@/lib/auth/permissions";
import { Input } from "@/components/ui/input";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const profile = await requireActiveProfile();
  const { search = "" } = await searchParams;
  const board = await getOrderBoard(profile.role, search);

  return (
    <main className="mx-auto flex w-full max-w-[100rem] flex-col gap-6 overflow-x-hidden px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <p className="text-sm text-muted-foreground">Pedidos</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Tablero de pedidos</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Mové cada pedido entre etapas. Todos los cambios quedan registrados.</p>
      </header>
       <form className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end" method="get">
         <label className="flex-1 text-sm font-medium" htmlFor="order-board-search">Buscar por cliente, equipo o teléfono<Input defaultValue={search} id="order-board-search" name="search" placeholder="Ej.: Club Belgrano o 3515550000" /></label>
         <button className="min-h-11 rounded-md border border-input px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" type="submit">Buscar</button>
          {search ? <Link className="min-h-11 px-2 py-3 text-sm text-muted-foreground underline" href="/orders">Limpiar</Link> : null}
       </form>
       <OrderBoard canConfirmPayment={canConfirmPayment(profile.role)} canCreateOrders={canCreateManualOrder(profile.role)} initialColumns={board.columns} />
    </main>
  );
}
