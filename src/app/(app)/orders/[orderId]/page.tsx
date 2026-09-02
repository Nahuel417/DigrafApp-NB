import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BadgeDollarSign, CalendarDays, CheckCircle2, ClipboardList, History, Info, Package, PencilLine, Phone, Scissors, Sparkles, UserRound, UsersRound, type LucideIcon } from "lucide-react";

import { requireActiveProfile } from "@/lib/auth/guards";
import { canArchiveDeliveredOrder, canEditOrderDescription, canEditOrderSensitive, canManageOrderDesignImages, canManageOrderLifecycle, canPurgeCancelledOrder, canReadOrderFinancials } from "@/lib/auth/permissions";
import { formatArsFromNumber, formatArsFromString, formatDate, formatDateTime, formatOrderNumber, orderTypeLabel, selectionIsHistorical, selectionLabel, timelineStageName, visibleBalanceString } from "@/features/orders/detail-format";
import { getOrderDetail, getOrderTimeline, getStageNames } from "@/features/orders/detail-queries";
import { updateOrderAction } from "@/features/orders/detail-actions";
import { getOrderDesignImagesReadUrls } from "@/features/orders/image-queries";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CreateCommentForm, CommentList, Timeline, EditableDescription } from "@/features/orders/components/order-detail-panels";
import { OrderEditForm } from "@/features/orders/components/order-edit-form";
import { OrderDetailTabList, OrderDetailTabPanel, OrderDetailTabs } from "@/features/orders/components/order-detail-tabs";
import { OrderDesignImagePanel } from "@/features/orders/components/order-design-image-panel";
import { OrderSpecifications } from "@/features/orders/components/order-specifications";
import { ArchiveDeliveredOrderDialog, CancelOrderDialog, PurgeCancelledOrderDialog, RestoreOrderDialog, UnarchiveDeliveredOrderDialog } from "@/features/orders/components/order-lifecycle-dialogs";

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<{ view?: string }> }) {
  const profile = await requireActiveProfile();
  const { orderId } = await params;
  const { view } = await searchParams;

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
  const isCancelled = order.lifecycleState === "cancelled";
  const isArchivedDelivered = order.lifecycleState === "archived_delivered";
  const isReadOnly = isCancelled || isArchivedDelivered;
  const canManageDesignImage = !isReadOnly && canManageOrderDesignImages(profile.role);
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
  const historyItems = timelineItems.filter((item) => item.type !== "commented");

  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Button asChild className="group h-auto w-fit rounded-full px-0 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:bg-transparent hover:text-foreground" variant="ghost">
              <Link href={isCancelled ? "/orders/archive" : isArchivedDelivered ? "/orders/archive/delivered" : "/orders"}>
                <ArrowLeft className="transition-transform duration-200 group-hover:-translate-x-0.5" data-icon="inline-start" />
                {isCancelled || isArchivedDelivered ? "Volver al Archivo" : "Volver al tablero"}
              </Link>
            </Button>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="min-w-0 text-3xl font-semibold tracking-display sm:text-4xl">{order.clientName ?? order.customerName ?? "Cliente histórico"}</h1>
              <Badge className="font-mono text-[11px]" variant={isCancelled || isArchivedDelivered ? "inactive" : "outline"}>{formatOrderNumber(order.publicNumber)}</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {order.teamName ?? orderTypeLabel(order.orderType)} · {order.quantity} unidades · Entrega {formatDate(order.promisedDeliveryDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge className="gap-1.5 border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary" variant="outline">
              <Sparkles aria-hidden="true" className="size-3" />
              {isCancelled ? "Anulado" : isArchivedDelivered ? "Entregado archivado" : order.currentStage.name}
            </Badge>
            {canManageOrderLifecycle(profile.role) ? (
              isCancelled ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <RestoreOrderDialog customerName={order.customerName ?? "Cliente histórico"} expectedUpdatedAt={order.updatedAt} orderId={order.id} publicNumber={order.publicNumber} />
                  {canPurgeCancelledOrder(profile.role) ? <PurgeCancelledOrderDialog customerName={order.customerName ?? "Cliente histórico"} expectedUpdatedAt={order.updatedAt} orderId={order.id} publicNumber={order.publicNumber} /> : null}
                </div>
              ) : isArchivedDelivered ? (
                <UnarchiveDeliveredOrderDialog customerName={order.customerName ?? "Cliente histórico"} expectedUpdatedAt={order.updatedAt} orderId={order.id} publicNumber={order.publicNumber} />
              ) : canArchiveDeliveredOrder(profile.role) && order.currentStage.code === "delivered" ? (
                <ArchiveDeliveredOrderDialog customerName={order.customerName ?? "Cliente histórico"} expectedUpdatedAt={order.updatedAt} orderId={order.id} publicNumber={order.publicNumber} />
              ) : (
                <CancelOrderDialog customerName={order.customerName ?? "Cliente histórico"} expectedUpdatedAt={order.updatedAt} orderId={order.id} publicNumber={order.publicNumber} />
              )
            ) : null}
          </div>
        </div>
        {isCancelled ? (
          <p className="max-w-2xl rounded-xl border border-border bg-surface-muted p-3 text-sm leading-6">
            <span className="font-medium">Motivo de anulación:</span> {order.cancellationReason}
            {order.cancelledAt ? <time className="mt-1 block text-xs text-muted-foreground" dateTime={order.cancelledAt}>Anulado el {formatDateTime(order.cancelledAt)}</time> : null}
          </p>
        ) : null}
      </header>

      <OrderDetailTabs initialTab={canEditSensitive && !isReadOnly && view === "edit" ? "edit" : "details"}>
        <OrderDetailTabList showEdit={canEditSensitive && !isReadOnly} />

        <div className="mt-5 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
          <div className="min-w-0">
            <OrderDetailTabPanel className="flex min-w-0 flex-col gap-6" tab="details">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
                <DetailSectionHeader hint="Información operativa base." icon={ClipboardList} title="Datos generales" />
                <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
                  <DetailItem icon={UserRound} label="Cliente" value={order.clientName ?? order.customerName ?? "Sin completar"} />
                  <DetailItem icon={UsersRound} label="Equipo" value={order.teamName ?? "Sin completar"} />
                  <DetailItem icon={Phone} label="Teléfono" value={order.phone ?? "Sin completar"} />
                  <DetailItem icon={Package} label="Cantidad" mono value={`${order.quantity} unidades`} />
                  <DetailItem icon={CalendarDays} label="Fecha del pedido" mono value={formatDate(order.orderDate)} />
                  <DetailItem icon={CalendarDays} label="Entrega prometida" mono value={formatDate(order.promisedDeliveryDate)} />
                </dl>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
                <DetailSectionHeader hint="Piezas, materiales y opciones del trabajo." icon={Scissors} title="Especificaciones" />
                <dl className="mt-5 flex min-w-0 flex-col gap-3">
                  {order.lines.map((line) => (
                    <div className="min-w-0 rounded-xl border border-border bg-surface-muted/50 p-4" key={line.id}>
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] tracking-data text-muted-foreground">Renglón {line.position + 1}</p>
                          <p className="mt-1 break-words text-sm font-medium">{line.productName}</p>
                        </div>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{line.quantity} unidades</span>
                      </div>
                      <OrderSpecifications catalogs={catalogs} line={line} selections={selections} />
                    </div>
                  ))}
                  {order.lines.length === 0 ? selections.map((selection) => (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted/50 p-4" key={selection.id}>
                      <div className="min-w-0">
                        <dt className="text-[11px] uppercase tracking-label text-muted-foreground">{selectionLabel(selection)}</dt>
                        <dd className="mt-1 text-sm font-medium">{selection.itemName}</dd>
                      </div>
                      {selectionIsHistorical(selection) ? <Badge variant="inactive">Ya no disponible</Badge> : null}
                    </div>
                  )) : null}
                </dl>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
                <DetailSectionHeader hint="Indicaciones que no estén en las opciones." icon={Info} title="Descripción" />
                <div className="mt-5">
                  <EditableDescription
                    description={order.description ?? ""}
                    key={order.updatedAt}
                    orderId={order.id}
                    readOnly={isReadOnly || !canEditDescription}
                    updatedAt={order.updatedAt}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
                <DetailSectionHeader hint="Movimientos registrados." icon={History} title="Historial de etapas" />
                <div className="mt-5">
                  <Timeline events={historyItems} />
                </div>
              </section>
            </OrderDetailTabPanel>

            {canEditSensitive && !isReadOnly ? (
              <OrderDetailTabPanel className="min-w-0" id="edit-order" tab="edit">
                <div className="mb-5 flex items-start gap-3 rounded-2xl border border-border bg-surface-muted/60 p-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><PencilLine aria-hidden="true" className="size-4" /></span>
                  <div className="min-w-0 pt-0.5">
                    <h2 className="text-base font-semibold tracking-tight">Editar pedido</h2>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">Actualizá la información operativa. Antes de guardar vas a poder confirmar los cambios, que quedarán auditados.</p>
                  </div>
                </div>
                <OrderEditForm action={updateOrderAction} catalogs={catalogs} financials={financials} order={order} />
              </OrderDetailTabPanel>
            ) : null}
          </div>

          <aside className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-6">
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
              <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                <div className="grid-paper border-b border-border px-5 py-4">
                  <h2 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-label text-muted-foreground"><BadgeDollarSign aria-hidden="true" className="size-3.5 text-primary" />Importes</h2>
                </div>
                <dl className="divide-y divide-border">
                  <FinancialRow label="Total" value={financials ? formatArsFromNumber(financials.totalAmount) : "—"} />
                  <FinancialRow label="Seña" status={financials ? financials.depositPaid ? "Pagada" : "No pagada" : undefined} value={financials ? formatArsFromNumber(financials.depositAmount) : "—"} />
                  <FinancialRow label="Saldo pendiente" strong value={balance ? formatArsFromString(balance) : "—"} />
                </dl>
              </section>
            ) : null}

            <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <h2 className="text-sm font-semibold tracking-tight">Comentarios</h2>
              <div className="mt-4">
                {!isReadOnly ? <CreateCommentForm orderId={order.id} /> : <p className="text-sm leading-5 text-muted-foreground">El pedido está archivado o congelado; los comentarios históricos se conservan abajo.</p>}
                <Separator className="my-5" />
                <CommentList comments={comments.map((comment) => ({ id: comment.id, actor: comment.actor, body: comment.body ?? "", occurredAt: comment.occurredAt }))} />
              </div>
            </section>

          </aside>
        </div>
      </OrderDetailTabs>
    </main>
  );
}

function DetailSectionHeader({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <header className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon aria-hidden="true" className="size-4" /></span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
      </div>
    </header>
  );
}

function DetailItem({ icon: Icon, label, mono = false, value }: { icon: LucideIcon; label: string; mono?: boolean; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-label text-muted-foreground">{label}</dt>
        <dd className={mono ? "font-mono text-sm tabular-nums" : "truncate text-sm"}>{value}</dd>
      </div>
    </div>
  );
}

function FinancialRow({ label, status, strong = false, value }: { label: string; status?: string; strong?: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <dt className={strong ? "text-xs font-medium text-foreground" : "text-xs text-muted-foreground"}>{label}</dt>
      <div className="flex min-w-0 items-center justify-end gap-2">
        {status ? <span className={status === "Pagada" ? "inline-flex items-center gap-1 rounded-full border border-success-foreground/30 bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success-foreground" : "inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"}>{status === "Pagada" ? <CheckCircle2 aria-hidden="true" className="size-3" /> : null}{status}</span> : null}
        <dd className={strong ? "font-mono text-sm font-semibold text-primary" : "font-mono text-sm text-foreground"}>{value}</dd>
      </div>
    </div>
  );
}
