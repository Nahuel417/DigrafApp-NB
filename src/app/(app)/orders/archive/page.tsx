import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OrderArchiveList } from "@/features/orders/components/order-archive-list";
import { getOrderArchive } from "@/features/orders/archive-queries";
import { canManageOrderLifecycle } from "@/lib/auth/permissions";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function OrderArchivePage() {
  const profile = await requireActiveProfile();
  if (!canManageOrderLifecycle(profile.role)) redirect("/orders");

  const orders = await getOrderArchive();
  if (!orders) redirect("/orders");

  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <Button asChild variant="ghost"><Link href="/orders"><ArrowLeft data-icon="inline-start" />Volver al tablero</Link></Button>
        <p className="mt-3 text-sm text-muted-foreground">Pedidos</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Archivo de pedidos</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Historial de pedidos anulados. Consultar el Archivo no crea movimientos ni cambia su estado.</p>
      </header>
      <OrderArchiveList orders={orders} />
    </main>
  );
}
