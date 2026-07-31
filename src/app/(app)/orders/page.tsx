import { OrderBoard } from "@/features/board/components/order-board";
import { getOrderBoard } from "@/features/board/queries";
import { requireActiveProfile } from "@/lib/auth/guards";
import { canCreateManualOrder } from "@/lib/auth/permissions";

export default async function OrdersPage() {
  const profile = await requireActiveProfile();
  const board = await getOrderBoard(profile.role);

  return (
    <main className="mx-auto flex w-full max-w-[100rem] flex-col gap-6 overflow-x-hidden px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <p className="text-sm text-muted-foreground">Pedidos</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Tablero de pedidos</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Mové cada pedido entre etapas. Todos los cambios quedan registrados.</p>
      </header>
      <OrderBoard canCreateOrders={canCreateManualOrder(profile.role)} initialColumns={board.columns} />
    </main>
  );
}
