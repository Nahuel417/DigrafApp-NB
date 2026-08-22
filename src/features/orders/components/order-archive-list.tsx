import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { ArchivedOrder } from "../archive-queries";
import { formatOrderNumber } from "../detail-format";
import { RestoreOrderDialog } from "./order-lifecycle-dialogs";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date(value));
}

export function OrderArchiveList({ orders }: { orders: ArchivedOrder[] }) {
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
                <RestoreOrderDialog customerName={order.customerName} expectedUpdatedAt={order.updatedAt} orderId={order.id} publicNumber={order.publicNumber} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
