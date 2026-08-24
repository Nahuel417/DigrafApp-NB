import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { ArchivedDeliveredOrder, ArchivedOrder } from "../archive-queries";
import { formatDate, formatOrderNumber } from "../detail-format";
import { PurgeCancelledOrderDialog, RestoreOrderDialog, UnarchiveDeliveredOrderDialog } from "./order-lifecycle-dialogs";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date(value));
}

type ArchivePaginationProps = {
  basePath: string;
  pageParam?: string;
  extraParams?: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function buildArchiveHref(basePath: string, pageParam: string, page: number, extraParams: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  if (extraParams.tab !== undefined) params.set("tab", extraParams.tab);
  params.set(pageParam, String(page));
  for (const [key, value] of Object.entries(extraParams)) {
    if (key === "tab") continue;
    if (value !== undefined) params.set(key, value);
  }
  return `${basePath}?${params.toString()}`;
}

function ArchivePagination({ basePath, pageParam = "page", extraParams = {}, page, pageSize, total, totalPages }: ArchivePaginationProps) {
  if (total <= pageSize) return null;
  const isFirst = page <= 1;
  const isLast = page >= totalPages;
  const prevHref = buildArchiveHref(basePath, pageParam, page - 1, extraParams);
  const nextHref = buildArchiveHref(basePath, pageParam, page + 1, extraParams);
  return (
    <nav aria-label="Paginación del Archivo" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">Página {page} de {totalPages} · Total {total} registros</p>
      <div className="flex gap-2">
        {isFirst ? (
          <Button aria-label="Anterior" disabled variant="outline">Anterior</Button>
        ) : (
          <Button asChild variant="outline"><Link aria-label="Anterior" href={prevHref}>Anterior</Link></Button>
        )}
        {isLast ? (
          <Button aria-label="Siguiente" disabled variant="outline">Siguiente</Button>
        ) : (
          <Button asChild variant="outline"><Link aria-label="Siguiente" href={nextHref}>Siguiente</Link></Button>
        )}
      </div>
    </nav>
  );
}

export function OrderArchiveList({
  canPurge = false,
  orders,
  page,
  pageSize,
  total,
  totalPages,
  basePath,
  pageParam,
  extraParams,
}: {
  canPurge?: boolean;
  orders: ArchivedOrder[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  basePath: string;
  pageParam?: string;
  extraParams?: Record<string, string | undefined>;
}) {
  return (
    <section aria-labelledby="cancelled-orders-title" className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold" id="cancelled-orders-title">Pedidos anulados</h2>
        <p className="mt-1 text-sm text-muted-foreground">Solo Admin y Super admin pueden consultar este historial.</p>
      </div>
      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No hay pedidos anulados en el Archivo.</p>
        </div>
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {orders.map((order) => (
            <li className="rounded-xl border border-border bg-card p-5 shadow-xs" key={order.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Button asChild className="h-auto p-0 font-mono text-sm font-semibold" variant="link">
                    <Link href={`/orders/${order.id}`}>{formatOrderNumber(order.publicNumber)}</Link>
                  </Button>
                  <p className="mt-1 text-base font-semibold">{order.customerName}</p>
                </div>
                <Badge variant="inactive">Anulado</Badge>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Última etapa</dt><dd className="mt-1 font-medium">{order.currentStageName}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Anuló</dt><dd className="mt-1 font-medium">{order.cancelledByDisplayName}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Fecha de anulación</dt><dd className="mt-1 font-mono text-xs">{formatDateTime(order.cancelledAt)}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Motivo</dt><dd className="mt-1 whitespace-pre-wrap leading-6">{order.cancellationReason}</dd></div>
              </dl>
              <div className="mt-5 flex justify-end">
                <div className="flex flex-wrap justify-end gap-2">
                  <RestoreOrderDialog customerName={order.customerName} expectedUpdatedAt={order.updatedAt} orderId={order.id} publicNumber={order.publicNumber} />
                  {canPurge ? <PurgeCancelledOrderDialog customerName={order.customerName} expectedUpdatedAt={order.updatedAt} orderId={order.id} publicNumber={order.publicNumber} /> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ArchivePagination basePath={basePath} pageParam={pageParam} extraParams={extraParams} page={page} pageSize={pageSize} total={total} totalPages={totalPages} />
    </section>
  );
}

export function DeliveredArchiveList({
  orders,
  page,
  pageSize,
  total,
  totalPages,
  basePath,
  pageParam,
  extraParams,
}: {
  orders: ArchivedDeliveredOrder[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  basePath: string;
  pageParam?: string;
  extraParams?: Record<string, string | undefined>;
}) {
  return (
    <section aria-labelledby="archived-delivered-orders-title" className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold" id="archived-delivered-orders-title">Entregados archivados</h2>
        <p className="mt-1 text-sm text-muted-foreground">Los pedidos entregados se conservan indefinidamente y solo Admin y Super admin pueden consultarlos.</p>
      </div>
      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No hay pedidos entregados archivados.</p>
        </div>
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {orders.map((order) => (
            <li className="rounded-xl border border-border bg-card p-5 shadow-xs" key={order.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Button asChild className="h-auto p-0 font-mono text-sm font-semibold" variant="link">
                    <Link href={`/orders/${order.id}`}>{formatOrderNumber(order.publicNumber)}</Link>
                  </Button>
                  <p className="mt-1 text-base font-semibold">{order.customerName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{order.teamName}</p>
                </div>
                <Badge variant="outline">Entregado archivado</Badge>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Cantidad</dt><dd className="mt-1 font-mono font-medium">{order.quantity}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Etapa</dt><dd className="mt-1 font-medium">{order.currentStageName}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Fecha del pedido</dt><dd className="mt-1 font-mono text-xs">{formatDate(order.orderDate)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Entrega prometida</dt><dd className="mt-1 font-mono text-xs">{formatDate(order.promisedDeliveryDate)}</dd></div>
              </dl>
              <div className="mt-5 flex justify-end">
                <UnarchiveDeliveredOrderDialog customerName={order.customerName} expectedUpdatedAt={order.updatedAt} orderId={order.id} publicNumber={order.publicNumber} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <ArchivePagination basePath={basePath} pageParam={pageParam} extraParams={extraParams} page={page} pageSize={pageSize} total={total} totalPages={totalPages} />
    </section>
  );
}
