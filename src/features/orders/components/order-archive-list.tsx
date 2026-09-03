import Link from "next/link";
import { ArchiveRestore, Ban, CalendarDays, ClipboardList, PackageCheck, Shirt, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArchivePagination } from "@/components/ui/archive-pagination";

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
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
          <Ban className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-base font-semibold" id="cancelled-orders-title">Pedidos anulados</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Solo Admin y Super admin pueden consultar este historial.</p>
        </div>
      </div>
      {orders.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center shadow-xs">
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
            <Ban className="size-5" />
          </span>
          <p className="mt-4 text-sm font-medium text-foreground">No hay pedidos anulados en el Archivo.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <li className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs" key={order.id}>
              <div className="grid-paper flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
                <Button asChild className="h-auto max-w-full rounded-md p-0 font-mono text-sm font-semibold tabular-nums" variant="link">
                  <Link href={`/orders/${order.id}`}>{formatOrderNumber(order.publicNumber)}</Link>
                </Button>
                <Badge variant="inactive">Anulado</Badge>
              </div>
              <div className="p-5">
                <p className="break-words text-base font-semibold leading-5">{order.customerName}</p>
                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                  <div className="min-w-0"><dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-label text-muted-foreground"><ClipboardList aria-hidden="true" className="size-3.5" />Última etapa</dt><dd className="mt-1.5 break-words font-medium">{order.currentStageName}</dd></div>
                  <div className="min-w-0"><dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-label text-muted-foreground"><UserRound aria-hidden="true" className="size-3.5" />Anuló</dt><dd className="mt-1.5 break-words font-medium">{order.cancelledByDisplayName}</dd></div>
                  <div className="min-w-0"><dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-label text-muted-foreground"><CalendarDays aria-hidden="true" className="size-3.5" />Fecha de anulación</dt><dd className="mt-1.5 font-mono text-xs tabular-nums">{formatDateTime(order.cancelledAt)}</dd></div>
                  <div className="min-w-0 sm:col-span-3"><dt className="text-[10px] font-medium uppercase tracking-label text-muted-foreground">Motivo</dt><dd className="mt-1.5 whitespace-pre-wrap leading-6">{order.cancellationReason}</dd></div>
                </dl>
                <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-dashed border-border pt-4">
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
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
          <ArchiveRestore className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-base font-semibold" id="archived-delivered-orders-title">Entregados archivados</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Los pedidos entregados se conservan indefinidamente y solo Admin y Super admin pueden consultarlos.</p>
        </div>
      </div>
      {orders.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center shadow-xs">
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
            <ArchiveRestore className="size-5" />
          </span>
          <p className="mt-4 text-sm font-medium text-foreground">No hay pedidos entregados archivados.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <li className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs" key={order.id}>
              <div className="grid-paper flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
                <Button asChild className="h-auto max-w-full rounded-md p-0 font-mono text-sm font-semibold tabular-nums" variant="link">
                  <Link href={`/orders/${order.id}`}>{formatOrderNumber(order.publicNumber)}</Link>
                </Button>
                <Badge className="border-success-foreground/20 bg-success text-success-foreground" variant="outline">Entregado archivado</Badge>
              </div>
              <div className="p-5">
                <p className="break-words text-base font-semibold leading-5">{order.customerName}</p>
                <p className="mt-1 break-words text-sm text-muted-foreground">{order.teamName}</p>
                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className="min-w-0"><dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-label text-muted-foreground"><Shirt aria-hidden="true" className="size-3.5" />Cantidad</dt><dd className="mt-1.5 font-mono font-medium tabular-nums">{order.quantity}</dd></div>
                  <div className="min-w-0"><dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-label text-muted-foreground"><PackageCheck aria-hidden="true" className="size-3.5" />Etapa</dt><dd className="mt-1.5 break-words font-medium">{order.currentStageName}</dd></div>
                  <div className="min-w-0"><dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-label text-muted-foreground"><CalendarDays aria-hidden="true" className="size-3.5" />Fecha del pedido</dt><dd className="mt-1.5 font-mono text-xs tabular-nums">{formatDate(order.orderDate)}</dd></div>
                  <div className="min-w-0"><dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-label text-muted-foreground"><CalendarDays aria-hidden="true" className="size-3.5" />Entrega prometida</dt><dd className="mt-1.5 font-mono text-xs tabular-nums">{formatDate(order.promisedDeliveryDate)}</dd></div>
                </dl>
                <div className="mt-5 flex justify-end border-t border-dashed border-border pt-4">
                  <UnarchiveDeliveredOrderDialog customerName={order.customerName} expectedUpdatedAt={order.updatedAt} orderId={order.id} publicNumber={order.publicNumber} />
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
