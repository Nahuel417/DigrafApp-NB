import { redirect } from "next/navigation";

import { requireActiveProfile } from "@/lib/auth/guards";
import { canEditOrderDescription, canEditOrderSensitive, canReadOrderFinancials } from "@/lib/auth/permissions";
import { formatArsFromNumber, formatArsFromString, formatDate, formatOrderNumber, orderTypeLabel, selectionIsHistorical, selectionLabel, visibleBalanceString } from "@/features/orders/detail-format";
import { getOrderDetail, getOrderTimeline, getStageNames } from "@/features/orders/detail-queries";
import { updateOrderAction } from "@/features/orders/detail-actions";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CreateCommentForm, CommentList, Timeline, EditableDescription } from "@/features/orders/components/order-detail-panels";
import { OrderEditForm } from "@/features/orders/components/order-edit-form";

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const profile = await requireActiveProfile();
  const { orderId } = await params;

  const [data, timelineEvents, stageNames] = await Promise.all([
    getOrderDetail(orderId),
    getOrderTimeline(orderId),
    getStageNames(),
  ]);

  if (!data) {
    redirect("/orders");
  }

  const { order, financials, selections, catalogs } = data;
  const canReadFinances = canReadOrderFinancials(profile.role);
  const canEditSensitive = canEditOrderSensitive(profile.role);
  const canEditDescription = canEditOrderDescription(profile.role);
  const balance = canReadFinances ? visibleBalanceString(financials) : null;

  const timelineItems = timelineEvents.map((event) => ({
    id: event.id,
    type: event.type,
    actor: event.actorDisplayName,
    occurredAt: event.occurredAt,
    body: event.commentBody,
    fromStageName: event.fromStageId ? stageNames[event.fromStageId] ?? undefined : undefined,
    toStageName: event.toStageId ? stageNames[event.toStageId] ?? undefined : undefined,
    details: event.details,
  }));

  const comments = timelineItems.filter((item) => item.type === "commented");

  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <p className="text-sm text-muted-foreground">Pedidos</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-display sm:text-3xl">{formatOrderNumber(order.publicNumber)}</h1>
          <Badge variant="outline">{order.currentStage.name}</Badge>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {order.customerName} · {orderTypeLabel(order.orderType)} · {order.quantity} unidades
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="text-base font-semibold">Datos del pedido</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <dt className="text-xs text-muted-foreground">Cliente o equipo</dt>
                <dd className="mt-1 text-sm font-medium">{order.customerName}</dd>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <dt className="text-xs text-muted-foreground">Cantidad</dt>
                <dd className="mt-1 font-mono text-sm font-medium">{order.quantity}</dd>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <dt className="text-xs text-muted-foreground">Fecha del pedido</dt>
                <dd className="mt-1 font-mono text-sm font-medium">{formatDate(order.orderDate)}</dd>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <dt className="text-xs text-muted-foreground">Fecha prometida</dt>
                <dd className="mt-1 font-mono text-sm font-medium">{formatDate(order.promisedDeliveryDate)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="text-base font-semibold">Especificaciones</h2>
            <dl className="mt-4 flex flex-col gap-3">
              {selections.map((selection) => (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3" key={selection.id}>
                  <div>
                    <dt className="text-xs text-muted-foreground">{selectionLabel(selection)}</dt>
                    <dd className="mt-1 text-sm font-medium">{selection.itemName}</dd>
                  </div>
                  {selectionIsHistorical(selection) ? <Badge variant="inactive">Ya no disponible</Badge> : null}
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="text-base font-semibold">Descripción</h2>
            <div className="mt-4">
              <EditableDescription
                description={order.description ?? ""}
                key={order.updatedAt}
                orderId={order.id}
                readOnly={!canEditDescription}
                updatedAt={order.updatedAt}
              />
            </div>
          </section>

          {canEditSensitive ? (
            <section className="rounded-xl border border-border bg-card p-5 shadow-xs" id="edit-order">
              <h2 className="text-base font-semibold">Editar pedido</h2>
              <p className="mt-1 text-sm text-muted-foreground">Los cambios quedan auditados y requieren confirmación.</p>
              <div className="mt-4">
                <OrderEditForm action={updateOrderAction} catalogs={catalogs} financials={financials} order={order} selections={selections} />
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          {canReadFinances ? (
            <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
              <h2 className="text-base font-semibold">Importes</h2>
              <dl className="mt-4 flex flex-col gap-3">
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <dt className="text-xs text-muted-foreground">Total</dt>
                  <dd className="mt-1 font-mono text-sm font-semibold">{financials ? formatArsFromNumber(financials.totalAmount) : "—"}</dd>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <dt className="text-xs text-muted-foreground">Seña</dt>
                  <dd className="mt-1 font-mono text-sm font-semibold">
                    {financials ? `${formatArsFromNumber(financials.depositAmount)} · ${financials.depositPaid ? "Pagada" : "No pagada"}` : "—"}
                  </dd>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <dt className="text-xs text-muted-foreground">Saldo visible</dt>
                  <dd className="mt-1 font-mono text-sm font-semibold">{balance ? formatArsFromString(balance) : "—"}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="text-base font-semibold">Comentarios</h2>
            <div className="mt-4">
              <CreateCommentForm orderId={order.id} />
              <Separator className="my-5" />
              <CommentList comments={comments.map((comment) => ({ id: comment.id, actor: comment.actor, body: comment.body ?? "", occurredAt: comment.occurredAt }))} />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="text-base font-semibold">Historial</h2>
            <div className="mt-4">
              <Timeline events={timelineItems} stageNames={stageNames} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
