import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArchiveRestore, ArrowLeft, Ban, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeliveredArchiveList, OrderArchiveList } from '@/features/orders/components/order-archive-list';
import { ARCHIVE_PAGE_SIZE, getArchivedDeliveredOrders, getOrderArchive, type ArchivedDeliveredOrder, type ArchivedOrder } from '@/features/orders/archive-queries';
import { canArchiveDeliveredOrder, canManageOrderLifecycle, canPurgeCancelledOrder } from '@/lib/auth/permissions';
import { requireActiveProfile } from '@/lib/auth/guards';
import { cn } from '@/lib/utils';

type ArchiveTab = 'delivered' | 'cancelled';
type SearchParams = { tab?: string; deliveredPage?: string; cancelledPage?: string };

function normalizeTab(raw: string | undefined): ArchiveTab {
    return raw === 'cancelled' ? 'cancelled' : 'delivered';
}

function tabHref(target: ArchiveTab, rawDeliveredPage: string | undefined, rawCancelledPage: string | undefined): string {
    const params = new URLSearchParams();
    params.set('tab', target);
    if (rawDeliveredPage !== undefined) params.set('deliveredPage', rawDeliveredPage);
    if (rawCancelledPage !== undefined) params.set('cancelledPage', rawCancelledPage);
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
    params.set('tab', tab);
    if (activePageInvalid) {
        if (tab === 'cancelled') params.set('cancelledPage', String(resolvedPage));
        else params.set('deliveredPage', String(resolvedPage));
    } else if (activeRawPage !== undefined) {
        if (tab === 'cancelled') params.set('cancelledPage', activeRawPage);
        else params.set('deliveredPage', activeRawPage);
    }
    if (tab === 'cancelled' && rawDeliveredPage !== undefined) params.set('deliveredPage', rawDeliveredPage);
    if (tab === 'delivered' && rawCancelledPage !== undefined) params.set('cancelledPage', rawCancelledPage);
    return `/orders/archives?${params.toString()}`;
}

function PageHeader({ tab, total, rawDeliveredPage, rawCancelledPage }: { tab: ArchiveTab; total: number; rawDeliveredPage: string | undefined; rawCancelledPage: string | undefined }) {
    const deliveredHref = tabHref('delivered', rawDeliveredPage, rawCancelledPage);
    const cancelledHref = tabHref('cancelled', rawDeliveredPage, rawCancelledPage);
    const linkClass = (active: boolean) =>
        cn(
            'inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
        );
    return (
        <header>
            <Button asChild className="group/archive-back -ml-3 h-auto px-3 py-2 text-[11px] uppercase tracking-label text-muted-foreground" variant="ghost">
                <Link href="/orders">
                    <ArrowLeft
                        aria-hidden="true"
                        className="transition-transform duration-150 group-hover/archive-back:-translate-x-0.5 motion-reduce:!translate-none"
                        data-icon="inline-start"
                    />
                    Volver al tablero
                </Link>
            </Button>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-[11px] font-medium uppercase tracking-label text-muted-foreground">Pedidos</p>
                    <h1 className="mt-2 text-2xl font-semibold tracking-display sm:text-3xl">Archivo de pedidos</h1>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Historial de pedidos. Consultar el Archivo no crea movimientos ni cambia su estado.</p>
                </div>
                <Badge className="font-sans" variant="active">
                    <ShieldCheck aria-hidden="true" data-icon="inline-start" />
                    Solo Admin y Super admin
                </Badge>
            </div>
            <nav aria-label="Pestañas del Archivo" className="mt-7 flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl border border-border bg-muted/55 p-1">
                <Link aria-current={tab === 'delivered' ? 'page' : undefined} className={linkClass(tab === 'delivered')} href={deliveredHref}>
                    <ArchiveRestore aria-hidden="true" className="size-4 text-primary" />
                    Entregados archivados
                    {tab === 'delivered' ? (
                        <Badge className="font-mono tabular-nums" variant="secondary">
                            {total}
                        </Badge>
                    ) : null}
                </Link>
                <Link aria-current={tab === 'cancelled' ? 'page' : undefined} className={linkClass(tab === 'cancelled')} href={cancelledHref}>
                    <Ban aria-hidden="true" className="size-4 text-red-400" />
                    Pedidos anulados
                    {tab === 'cancelled' ? (
                        <Badge className="font-mono tabular-nums" variant="secondary">
                            {total}
                        </Badge>
                    ) : null}
                </Link>
            </nav>
        </header>
    );
}

type Profile = Awaited<ReturnType<typeof requireActiveProfile>>;
type Props = { rawTab: string | undefined; rawDeliveredPage: string | undefined; rawCancelledPage: string | undefined; profile: Profile; tab: ArchiveTab };

async function renderCancelledTab({ rawTab, rawDeliveredPage, rawCancelledPage, profile, tab }: Props) {
    if (!canManageOrderLifecycle(profile.role)) redirect('/orders');
    const result = await getOrderArchive(Number(rawCancelledPage));
    if (!result) redirect('/orders');
    const canonical = canonicalize('cancelled', rawTab, rawCancelledPage, result.page, rawDeliveredPage, rawCancelledPage);
    if (canonical) redirect(canonical);
    return (
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
            <PageHeader rawCancelledPage={rawCancelledPage} rawDeliveredPage={rawDeliveredPage} tab={tab} total={result.total} />
            <OrderArchiveList
                basePath="/orders/archives"
                pageParam="cancelledPage"
                extraParams={rawDeliveredPage !== undefined ? { tab: 'cancelled', deliveredPage: rawDeliveredPage } : { tab: 'cancelled' }}
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
    if (!canArchiveDeliveredOrder(profile.role)) redirect('/orders');
    const result = await getArchivedDeliveredOrders(Number(rawDeliveredPage));
    if (!result) redirect('/orders');
    const canonical = canonicalize('delivered', rawTab, rawDeliveredPage, result.page, rawDeliveredPage, rawCancelledPage);
    if (canonical) redirect(canonical);
    return (
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
            <PageHeader rawCancelledPage={rawCancelledPage} rawDeliveredPage={rawDeliveredPage} tab={tab} total={result.total} />
            <DeliveredArchiveList
                basePath="/orders/archives"
                pageParam="deliveredPage"
                extraParams={rawCancelledPage !== undefined ? { tab: 'delivered', cancelledPage: rawCancelledPage } : { tab: 'delivered' }}
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
    if (tab === 'cancelled') return renderCancelledTab(props);
    return renderDeliveredTab(props);
}
