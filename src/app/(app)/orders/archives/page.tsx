import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DeliveredArchiveList, OrderArchiveList } from "@/features/orders/components/order-archive-list";
import {
  ARCHIVE_PAGE_SIZE,
  getArchivedDeliveredOrders,
  getOrderArchive,
  type ArchivedDeliveredOrder,
  type ArchivedOrder,
} from "@/features/orders/archive-queries";
import { canArchiveDeliveredOrder, canManageOrderLifecycle, canPurgeCancelledOrder } from "@/lib/auth/permissions";
import { requireActiveProfile } from "@/lib/auth/guards";
import { cn } from "@/lib/utils";

type ArchiveTab = "delivered" | "cancelled";
type SearchParams = { tab?: string; deliveredPage?: string; cancelledPage?: string };

function normalizeTab(raw: string | undefined): ArchiveTab {
  return raw === "cancelled" ? "cancelled" : "delivered";
}

function tabHref(target: ArchiveTab, rawDeliveredPage: string | undefined, rawCancelledPage: string | undefined): string {
  const params = new URLSearchParams();
  params.set("tab", target);
  if (rawDeliveredPage !== undefined) params.set("deliveredPage", rawDeliveredPage);
  if (rawCancelledPage !== undefined) params.set("cancelledPage", rawCancelledPage);
  return `/orders/archives?${params.toString()}`;
}

function canonicalize(
  tab: ArchiveTab,
  rawTab: string | undefined,
  activeRawPage: string | undefined,
  resolvedPage: number,
  rawDeliveredPage: string | undefined,
  rawCancelledPage: string | undefined,
): string | null {
  const tabInvalid = rawTab !== undefined && rawTab !== tab;
  const activePageInvalid = activeRawPage !== undefined && activeRawPage !== String(resolvedPage);
  if (!tabInvalid && !activePageInvalid) return null;
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (activePageInvalid) {
    if (tab === "cancelled") params.set("cancelledPage", String(resolvedPage));
    else params.set("deliveredPage", String(resolvedPage));
  } else if (activeRawPage !== undefined) {
    if (tab === "cancelled") params.set("cancelledPage", activeRawPage);
    else params.set("deliveredPage", activeRawPage);
  }
  if (tab === "cancelled" && rawDeliveredPage !== undefined) params.set("deliveredPage", rawDeliveredPage);
  if (tab === "delivered" && rawCancelledPage !== undefined) params.set("cancelledPage", rawCancelledPage);
  return `/orders/archives?${params.toString()}`;
}

function PageHeader({ tab, rawDeliveredPage, rawCancelledPage }: { tab: ArchiveTab; rawDeliveredPage: string | undefined; rawCancelledPage: string | undefined }) {
  const deliveredHref = tabHref("delivered", rawDeliveredPage, rawCancelledPage);
  const cancelledHref = tabHref("cancelled", rawDeliveredPage, rawCancelledPage);
  const linkClass = (active: boolean) => cn(
    "inline-flex min-h-10 items-center rounded-t-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
    active ? "border-b-2 border-sidebar-primary text-foreground" : "text-muted-foreground hover:text-foreground",
  );
  return (
    <header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost"><Link href="/orders">Volver al tablero</Link></Button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Pedidos</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Archivo de pedidos</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Historial de pedidos. Consultar el Archivo no crea movimientos ni cambia su estado.</p>
      <nav aria-label="Pestañas del Archivo" className="mt-4 flex gap-2 border-b border-border">
        <Link aria-current={tab === "delivered" ? "page" : undefined} className={linkClass(tab === "delivered")} href={deliveredHref}>Entregados archivados</Link>
        <Link aria-current={tab === "cancelled" ? "page" : undefined} className={linkClass(tab === "cancelled")} href={cancelledHref}>Pedidos anulados</Link>
      </nav>
    </header>
  );
}

type Profile = Awaited<ReturnType<typeof requireActiveProfile>>;
type Props = { rawTab: string | undefined; rawDeliveredPage: string | undefined; rawCancelledPage: string | undefined; profile: Profile; tab: ArchiveTab };

async function renderCancelledTab({ rawTab, rawDeliveredPage, rawCancelledPage, profile, tab }: Props) {
  if (!canManageOrderLifecycle(profile.role)) redirect("/orders");
  const result = await getOrderArchive(Number(rawCancelledPage));
  if (!result) redirect("/orders");
  const canonical = canonicalize("cancelled", rawTab, rawCancelledPage, result.page, rawDeliveredPage, rawCancelledPage);
  if (canonical) redirect(canonical);
  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <PageHeader rawCancelledPage={rawCancelledPage} rawDeliveredPage={rawDeliveredPage} tab={tab} />
      <OrderArchiveList
        basePath="/orders/archives"
        pageParam="cancelledPage"
        extraParams={rawDeliveredPage !== undefined ? { tab: "cancelled", deliveredPage: rawDeliveredPage } : { tab: "cancelled" }}
        canPurge={canPurgeCancelledOrder(profile.role)}
        orders={result.orders satisfies ArchivedOrder[]}
        page={result.page}
        pageSize={ARCHIVE_PAGE_SIZE}
        total={result.total}
        totalPages={result.totalPages}
      />
    </main>
  );
}

async function renderDeliveredTab({ rawTab, rawDeliveredPage, rawCancelledPage, profile, tab }: Props) {
  if (!canArchiveDeliveredOrder(profile.role)) redirect("/orders");
  const result = await getArchivedDeliveredOrders(Number(rawDeliveredPage));
  if (!result) redirect("/orders");
  const canonical = canonicalize("delivered", rawTab, rawDeliveredPage, result.page, rawDeliveredPage, rawCancelledPage);
  if (canonical) redirect(canonical);
  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <PageHeader rawCancelledPage={rawCancelledPage} rawDeliveredPage={rawDeliveredPage} tab={tab} />
      <DeliveredArchiveList
        basePath="/orders/archives"
        pageParam="deliveredPage"
        extraParams={rawCancelledPage !== undefined ? { tab: "delivered", cancelledPage: rawCancelledPage } : { tab: "delivered" }}
        orders={result.orders satisfies ArchivedDeliveredOrder[]}
        page={result.page}
        pageSize={ARCHIVE_PAGE_SIZE}
        total={result.total}
        totalPages={result.totalPages}
      />
    </main>
  );
}

export default async function OrdersArchivesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await requireActiveProfile();
  const { tab: rawTab, deliveredPage: rawDeliveredPage, cancelledPage: rawCancelledPage } = await searchParams;
  const tab = normalizeTab(rawTab);
  const props: Props = { profile, rawCancelledPage, rawDeliveredPage, rawTab, tab };
  if (tab === "cancelled") return renderCancelledTab(props);
  return renderDeliveredTab(props);
}
