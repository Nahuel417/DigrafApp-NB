import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireActiveProfile } from "@/lib/auth/guards";
import { canEditOrderDescription, canEditOrderSensitive, canReadOrderFinancials } from "@/lib/auth/permissions";
import { formatArsFromNumber, formatArsFromString, formatDate, formatOrderNumber, selectionIsHistorical, selectionLabel, timelineStageName, visibleBalanceString } from "@/features/orders/detail-format";
import { getOrderDetail, getOrderTimeline, getStageNames } from "@/features/orders/detail-queries";
import { updateOrderAction } from "@/features/orders/detail-actions";
import { getOrderDesignImagesReadUrls } from "@/features/orders/image-queries";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CreateCommentForm, CommentList, Timeline, EditableDescription } from "@/features/orders/components/order-detail-panels";
import { OrderEditForm } from "@/features/orders/components/order-edit-form";
import { OrderDesignImagePanel } from "@/features/orders/components/order-design-image-panel";

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const profile = await requireActiveProfile();
  const { orderId } = await params;

  const [data, timelineEvents, stageNames, designImagesResult] = await Promise.all([
    getOrderDetail(orderId),
    getOrderTimeline(orderId),
    getStageNames(),
    getOrderDesignImagesReadUrls(orderId)
      .then((images) => ({ error: null, images }))
      .catch(() => ({ error: "No se pudo cargar la vista temporal del diseño.", images: [] })),
  ]);

  if (!data) {
    redirect("/orders");
  }

  const { order, financials, selections, catalogs } = data;
  const canReadFinances = canReadOrderFinancials(profile.role);
  const canEditSensitive = canEditOrderSensitive(profile.role);
  const canEditDescription = canEditOrderDescription(profile.role);
  const canManageDesignImage = profile.role === "super_admin" || profile.role === "admin" || profile.role === "attention";
  const balance = canReadFinances ? visibleBalanceString(financials) : null;

  const timelineItems = timelineEvents.map((event) => ({
    id: event.id,
    type: event.type,
    actor: event.actorDisplayName,
    occurredAt: event.occurredAt,
    body: event.commentBody,
    changeNote: event.changeNote,
    fromStageName: timelineStageName(event.fromStageName, event.fromStageId ? stageNames[event.fromStageId] : undefined),
    toStageName: timelineStageName(event.toStageName, event.toStageId ? stageNames[event.toStageId] : undefined),
    details: event.details,
  }));

  const comments = timelineItems.filter((item) => item.type === "commented");

  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <Button asChild variant="ghost"><Link href="/orders"><ArrowLeft data-icon="inline-start" />Volver al tablero</Link></Button>
        <p className="mt-3 text-sm text-muted-foreground">Pedidos</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-display sm:text-3xl">{formatOrderNumber(order.publicNumber)}</h1>
          <Badge variant="outline">{order.currentStage.name}</Badge>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
           {order.clientName ?? order.customerName ?? "Cliente histórico"} · {order.teamName ?? "Equipo histórico"} · {order.quantity} unidades
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="text-base font-semibold">Datos del pedido</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/40 p-3"><dt className="text-xs text-muted-foreground">Cliente</dt><dd className="mt-1 text-sm font-medium">{order.clientName ?? order.customerName ?? "Sin completar"}</dd></div>
              <div className="rounded-lg border border-border bg-muted/40 p-3"><dt className="text-xs text-muted-foreground">Equipo</dt><dd className="mt-1 text-sm font-medium">{order.teamName ?? "Sin completar"}</dd></div>
              <div className="rounded-lg border border-border bg-muted/40 p-3"><dt className="text-xs text-muted-foreground">Teléfono</dt><dd className="mt-1 text-sm font-medium">{order.phone ?? "Sin completar"}</dd></div>
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
              {order.lines.map((line) => (
                <div className="rounded-lg border border-border bg-muted/40 p-3" key={line.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">{line.lineType}</p><p className="mt-1 font-medium">{line.productName}</p></div><span className="font-mono text-sm">{line.quantity} unidades</span></div>{line.color ? <p className="mt-2 text-sm text-muted-foreground">Color: {line.color}</p> : null}{line.shieldNames.length ? <p className="mt-2 text-sm text-muted-foreground">Escudos: {line.shieldNames.join(", ")}</p> : null}<pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs text-muted-foreground">{JSON.stringify(line.configurationSnapshot, null, 2)}</pre></div>
              ))}
              {order.lines.length === 0 ? selections.map((selection) => (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3" key={selection.id}>
                  <div>
                    <dt className="text-xs text-muted-foreground">{selectionLabel(selection)}</dt>
                    <dd className="mt-1 text-sm font-medium">{selection.itemName}</dd>
                  </div>
                  {selectionIsHistorical(selection) ? <Badge variant="inactive">Ya no disponible</Badge> : null}
                </div>
              )) : null}
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
               <OrderEditForm action={updateOrderAction} catalogs={catalogs} financials={financials} order={order} />
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <OrderDesignImagePanel
            canManage={canManageDesignImage}
            initialError={designImagesResult.error}
            initialImages={designImagesResult.images.map((image) => ({
              expiresAt: image.expiresAt,
              id: image.id,
              isPrimary: image.isPrimary,
              signedUrl: image.signedUrl,
              updatedAt: image.updatedAt,
            }))}
            orderId={order.id}
          />
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
              <Timeline events={timelineItems} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
