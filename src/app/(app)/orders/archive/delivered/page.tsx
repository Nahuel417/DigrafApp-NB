import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DeliveredArchiveList } from "@/features/orders/components/order-archive-list";
import { ARCHIVE_PAGE_SIZE, getArchivedDeliveredOrders } from "@/features/orders/archive-queries";
import { canArchiveDeliveredOrder } from "@/lib/auth/permissions";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function DeliveredArchivePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await requireActiveProfile();
  if (!canArchiveDeliveredOrder(profile.role)) redirect("/orders");

  const { page: rawPage } = await searchParams;
  const result = await getArchivedDeliveredOrders(Number(rawPage));
  if (!result) redirect("/orders");

  if (rawPage !== undefined && rawPage !== String(result.page)) {
    redirect(`/orders/archive/delivered?page=${result.page}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <Button asChild variant="ghost"><Link href="/orders/archive"><ArrowLeft data-icon="inline-start" />Volver al Archivo</Link></Button>
        <p className="mt-3 text-sm text-muted-foreground">Pedidos</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Archivo de entregados</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Consulta histórica separada para pedidos entregados. Archivar es reversible y no elimina datos.</p>
      </header>
      <DeliveredArchiveList
        basePath="/orders/archive/delivered"
        orders={result.orders}
        page={result.page}
        pageSize={ARCHIVE_PAGE_SIZE}
        total={result.total}
        totalPages={result.totalPages}
      />
    </main>
  );
}
