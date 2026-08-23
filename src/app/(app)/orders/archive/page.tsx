import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OrderArchiveList } from "@/features/orders/components/order-archive-list";
import { ARCHIVE_PAGE_SIZE, getOrderArchive } from "@/features/orders/archive-queries";
import { canManageOrderLifecycle, canPurgeCancelledOrder } from "@/lib/auth/permissions";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function OrderArchivePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await requireActiveProfile();
  if (!canManageOrderLifecycle(profile.role)) redirect("/orders");

  const { page: rawPage } = await searchParams;
  const result = await getOrderArchive(Number(rawPage));
  if (!result) redirect("/orders");

  if (rawPage !== undefined && rawPage !== String(result.page)) {
    redirect(`/orders/archive?page=${result.page}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost"><Link href="/orders"><ArrowLeft data-icon="inline-start" />Volver al tablero</Link></Button>
          <Button asChild variant="outline"><Link href="/orders/archive/delivered">Archivo de entregados</Link></Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Pedidos</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Archivo de pedidos</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Historial de pedidos anulados. Consultar el Archivo no crea movimientos ni cambia su estado.</p>
      </header>
      <OrderArchiveList
        basePath="/orders/archive"
        canPurge={canPurgeCancelledOrder(profile.role)}
        orders={result.orders}
        page={result.page}
        pageSize={ARCHIVE_PAGE_SIZE}
        total={result.total}
        totalPages={result.totalPages}
      />
    </main>
  );
}
