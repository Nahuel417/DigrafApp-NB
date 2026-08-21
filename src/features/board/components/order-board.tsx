"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { AlertCircle, ArrowRight, CircleCheck, Eye, GripVertical, PackageOpen } from "lucide-react";
import Link from "next/link";
import { startTransition, useState, useTransition } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutationToast } from "@/hooks/use-mutation-toast";
import { formatArs } from "@/lib/money/decimal";

import { confirmOrderPaymentAction, getOrderQuickViewAction, moveOrderAction, reconcileOrderAction, type ConfirmOrderPaymentActionState, type MoveOrderActionState, type OrderQuickView } from "../actions";
import { moveBoardOrder, replaceBoardOrder } from "../board-state";
import type { BoardColumn, BoardOrder } from "../queries";
import { OrderDesignThumbnail } from "./order-design-thumbnail";
import { OrderQuickView as OrderQuickViewPanel } from "./order-quick-view";

type MoveSource = Pick<BoardOrder, "id" | "currentStageId" | "updatedAt">;
type MovementMethod = "selector" | "dnd";
type QuickViewData = OrderQuickView & Pick<BoardOrder, "primaryDesignImage">;
type PaymentRequest = { order: BoardOrder; source: MoveSource; method: MovementMethod };

const collisionDetectionStrategy: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
};

function orderId(publicNumber: number) {
  return `PED-${String(publicNumber).padStart(6, "0")}`;
}

function orderDetailPath(orderId: string) {
  return `/orders/${orderId}`;
}

function orderTypeLabel(orderType: BoardOrder["orderType"]) {
  if (orderType === null) return "Varios tipos";
  return orderType === "set" ? "Conjunto" : "Prenda individual";
}

function OrderSummary({ order, showThumbnail }: { order: BoardOrder; showThumbnail?: boolean }) {
  return (
    <>
      {showThumbnail ? (
        <OrderDesignThumbnail
          alt={`Diseño de ${order.customerName}`}
          className="mb-3 aspect-[3/2] w-full"
          imageUpdatedAt={order.primaryDesignImage?.updatedAt ?? null}
          key={order.primaryDesignImage?.updatedAt ?? "empty"}
          orderId={order.id}
        />
      ) : null}
      <p className="font-mono text-xs font-semibold tracking-data text-muted-foreground">{orderId(order.publicNumber)}</p>
      <h3 className="mt-2 break-words font-semibold">
        <a className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" href={orderDetailPath(order.id)} onPointerDown={(event) => event.stopPropagation()}>
           {order.customerName ?? "Cliente histórico"}
        </a>
      </h3>
      <p className="mt-1 break-words text-sm text-muted-foreground">{order.teamName ?? "Equipo sin completar"}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div><dt className="text-muted-foreground">Cantidad</dt><dd className="mt-0.5 font-mono font-medium">{order.quantity}</dd></div>
        <div><dt className="text-muted-foreground">Tipo</dt><dd className="mt-0.5">{orderTypeLabel(order.orderType)}</dd></div>
        <div className="col-span-2"><dt className="text-muted-foreground">Entrega prometida</dt><dd className="mt-0.5 font-mono font-medium">{order.promisedDeliveryDate}</dd></div>
      </dl>
    </>
  );
}

function MoveOrderSelector({
  canConfirmPayment,
  columns,
  isPending,
  onMove,
  order,
}: {
  canConfirmPayment: boolean;
  columns: BoardColumn[];
  isPending: boolean;
  onMove: (source: MoveSource, targetStageId: string, method: MovementMethod) => void;
  order: BoardOrder;
}) {
  const [destination, setDestination] = useState("");
  const selectId = `move-order-${order.id}`;
  const paidStageId = columns.find((column) => column.code === "paid")?.id;
  const movementLocked = order.currentStageId === paidStageId;
  const availableDestinations = columns.filter((column) => column.id !== order.currentStageId && (canConfirmPayment || column.code !== "paid"));

  if (movementLocked) {
    return <p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">Los movimientos desde Pagado se habilitarán al confirmar el cobro.</p>;
  }

  return (
    <form
      className="mt-4 border-t border-border pt-4"
      noValidate
      onPointerDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        if (!destination || isPending) return;
        onMove({ id: order.id, currentStageId: order.currentStageId, updatedAt: order.updatedAt }, destination, "selector");
      }}
    >
      <Field>
        <FieldLabel className="text-xs" htmlFor={selectId}>Mover {orderId(order.publicNumber)} a</FieldLabel>
        <Select disabled={isPending} name="toStageId" onValueChange={setDestination} value={destination}>
          <SelectTrigger data-move-selector={order.id} id={selectId}>
            <SelectValue placeholder="Elegí una etapa" />
          </SelectTrigger>
          <SelectContent>
            {availableDestinations.map((column) => <SelectItem key={column.id} value={column.id}>{column.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Button className="mt-3 w-full" disabled={!destination || isPending} type="submit" variant="outline">
        <ArrowRight aria-hidden="true" />
        {isPending ? "Moviendo..." : "Mover pedido"}
      </Button>
    </form>
  );
}

function DraggableOrderCard({
  canConfirmPayment,
  columns,
  isPending,
  onMove,
  onQuickView,
  order,
}: {
  canConfirmPayment: boolean;
  columns: BoardColumn[];
  isPending: boolean;
  onMove: (source: MoveSource, targetStageId: string, method: MovementMethod) => void;
  onQuickView: (orderId: string) => void;
  order: BoardOrder;
}) {
  const paidStageId = columns.find((column) => column.code === "paid")?.id;
  const dragDisabled = isPending || order.currentStageId === paidStageId;
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } = useDraggable({
    id: order.id,
    disabled: dragDisabled,
    data: { currentStageId: order.currentStageId },
  });

  return (
    <article
      {...listeners}
      aria-busy={isPending || undefined}
      className={`rounded-lg border border-border bg-card p-4 shadow-xs transition-[border-color,opacity,box-shadow] duration-150 motion-reduce:transition-none ${isDragging ? "opacity-40" : "opacity-100"}`}
      data-order-id={order.id}
      ref={setNodeRef}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1"><OrderSummary order={order} showThumbnail /></div>
        <div className="flex shrink-0 gap-1">
          <Button
            {...attributes}
            aria-label={dragDisabled ? `No se puede arrastrar ${orderId(order.publicNumber)}` : `Arrastrar ${orderId(order.publicNumber)}`}
            aria-pressed={isDragging}
            className="size-11 touch-none cursor-grab active:cursor-grabbing forced-colors:outline forced-colors:outline-2 forced-colors:outline-transparent"
            data-drag-handle={order.id}
            disabled={dragDisabled}
            ref={setActivatorNodeRef}
            size="icon"
            title={dragDisabled ? "Movimiento no disponible" : "Arrastrar pedido"}
            type="button"
            variant="ghost"
          >
            <GripVertical aria-hidden="true" />
          </Button>
        </div>
      </div>
      <Button aria-label={`Vista rápida de ${orderId(order.publicNumber)}`} className="mt-3 w-full" data-no-drag="true" onClick={() => onQuickView(order.id)} onPointerDown={(event) => event.stopPropagation()} type="button" variant="ghost"><Eye data-icon="inline-start" />Vista rápida</Button>
      <MoveOrderSelector canConfirmPayment={canConfirmPayment} columns={columns} isPending={isPending} onMove={onMove} order={order} />
    </article>
  );
}

function BoardColumnView({
  activeOrder,
  canConfirmPayment,
  children,
  column,
  paidStageId,
}: {
  activeOrder: BoardOrder | null;
  canConfirmPayment: boolean;
  children: React.ReactNode;
  column: BoardColumn;
  paidStageId?: string;
}) {
  const { isOver, setNodeRef } = useDroppable({ disabled: !canConfirmPayment && column.id === paidStageId, id: column.id, data: { code: column.code } });
  const isCurrentStage = activeOrder?.currentStageId === column.id;
  const isMovingFromPaid = Boolean(activeOrder && activeOrder.currentStageId === paidStageId);
  const isPaidTarget = Boolean(activeOrder && column.id === paidStageId && activeOrder.currentStageId !== paidStageId);
  const isPaymentTarget = Boolean(canConfirmPayment && isPaidTarget);
  const isValidTarget = Boolean(activeOrder && !isCurrentStage && !isMovingFromPaid && (!isPaidTarget || canConfirmPayment));
  const targetLabel = !activeOrder
    ? null
    : isMovingFromPaid
      ? "Destino no disponible"
      : isPaidTarget && !canConfirmPayment
        ? "Destino no disponible"
      : isPaymentTarget
        ? "Confirmar cobro"
        : isCurrentStage
          ? "Etapa actual"
          : "Destino disponible";

  return (
    <section
      aria-labelledby={`stage-${column.id}`}
      className={`min-w-0 rounded-xl border bg-muted/35 transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none forced-colors:outline forced-colors:outline-2 forced-colors:outline-transparent lg:min-h-0 ${
        isOver && isValidTarget
          ? "border-primary shadow-sm outline outline-2 outline-primary outline-offset-2"
          : isOver && !isValidTarget
            ? "border-error outline outline-2 outline-error outline-offset-2"
            : "border-border"
      }`}
      data-drop-stage={column.code}
      data-drop-valid={isValidTarget ? "true" : "false"}
      ref={setNodeRef}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-semibold" id={`stage-${column.id}`}>{column.name}</h2>
          {targetLabel ? <p className={`mt-1 text-xs ${isValidTarget ? "text-primary" : "text-muted-foreground"}`}>{targetLabel}</p> : null}
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground" data-stage-count={column.code}>{column.orders.length}</span>
      </header>
      <div className="flex min-h-28 flex-col gap-3 p-3">
        {column.orders.length === 0 ? <p className="rounded-md border border-dashed border-border bg-card/70 p-3 text-center text-xs text-muted-foreground">No hay pedidos en esta etapa.</p> : null}
        {children}
      </div>
    </section>
  );
}

export function OrderBoard({ canConfirmPayment, canCreateOrders, initialColumns }: { canConfirmPayment: boolean; canCreateOrders: boolean; initialColumns: BoardColumn[] }) {
  const [columns, setColumns] = useState(initialColumns);
  const [pendingOrderIds, setPendingOrderIds] = useState<Set<string>>(() => new Set());
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("Tablero listo para mover pedidos.");
  const [mutationState, setMutationState] = useState<MoveOrderActionState | ConfirmOrderPaymentActionState>({});
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [quickView, setQuickView] = useState<QuickViewData | null>(null);
  const [quickViewError, setQuickViewError] = useState<string | null>(null);
  const [isQuickViewPending, startQuickViewTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const allOrders = columns.flatMap((column) => column.orders);
  const activeOrder = activeDragId ? allOrders.find((order) => order.id === activeDragId) ?? null : null;
  const paidStageId = columns.find((column) => column.code === "paid")?.id;
  useMutationToast(mutationState);

  function stageName(stageId: string) {
    return columns.find((column) => column.id === stageId)?.name ?? "la etapa seleccionada";
  }

  function findOrder(orderIdValue: string) {
    return columns.flatMap((column) => column.orders).find((order) => order.id === orderIdValue);
  }

  function focusOrderControl(orderIdValue: string, method: MovementMethod) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const attribute = method === "dnd" ? "data-drag-handle" : "data-move-selector";
        document.querySelector<HTMLElement>(`[${attribute}="${orderIdValue}"]`)?.focus();
      });
    });
  }

  function clearPending(orderIdValue: string) {
    setPendingOrderIds((current) => {
      const next = new Set(current);
      next.delete(orderIdValue);
      return next;
    });
  }

  function openQuickView(orderIdValue: string) {
    setQuickViewError(null);
    const boardOrder = findOrder(orderIdValue);
    startQuickViewTransition(async () => {
      const result = await getOrderQuickViewAction(orderIdValue);
      if (result.data) {
        setQuickView({
          ...result.data,
          primaryDesignImage: boardOrder?.primaryDesignImage ?? null,
        });
      }
      else setQuickViewError(result.message ?? "No se pudo cargar la vista rápida.");
    });
  }

  function reportLocalRejection(order: BoardOrder, message: string, method: MovementMethod) {
    setErrorMessage(message);
    setMutationState({ message, status: "error", toastId: crypto.randomUUID() });
    setAnnouncement(`${orderId(order.publicNumber)} no se movió. ${message}`);
    focusOrderControl(order.id, method);
  }

  function openPaymentConfirmation(order: BoardOrder, source: MoveSource, method: MovementMethod) {
    setErrorMessage(null);
    setPaymentRequest({ order, source, method });
    setAnnouncement(`Se abrió la confirmación de cobro para ${orderId(order.publicNumber)}.`);
  }

  function closePaymentConfirmation(announce = true) {
    if (!paymentRequest) return;
    const request = paymentRequest;
    setPaymentRequest(null);
    if (announce) {
      setAnnouncement(`Cancelaste la confirmación de cobro de ${orderId(request.order.publicNumber)}. El pedido permanece en ${stageName(request.source.currentStageId)}.`);
    }
    focusOrderControl(request.order.id, request.method);
  }

  function confirmPayment() {
    if (!paymentRequest || pendingOrderIds.has(paymentRequest.order.id)) return;
    const { order, source, method } = paymentRequest;
    const formData = new FormData();
    formData.set("orderId", order.id);
    formData.set("expectedUpdatedAt", source.updatedAt);
    formData.set("idempotencyKey", crypto.randomUUID());

    setErrorMessage(null);
    setPendingOrderIds((current) => new Set(current).add(order.id));
    setAnnouncement(`Confirmando el cobro de ${orderId(order.publicNumber)}.`);
    startTransition(async () => {
      try {
        const result = await confirmOrderPaymentAction({}, formData);
        if (result.status === "success") {
          setColumns((current) => result.reconciledOrder ? replaceBoardOrder(current, result.reconciledOrder) : moveBoardOrder(current, order.id, paidStageId ?? source.currentStageId, result.confirmedAt));
          setMutationState(result);
          setPaymentRequest(null);
          setAnnouncement(result.message ?? `${orderId(order.publicNumber)} quedó confirmado como Pagado.`);
        } else {
          if (result.reconciledOrder) setColumns((current) => replaceBoardOrder(current, result.reconciledOrder!));
          setErrorMessage(result.message ?? "No se pudo confirmar el cobro. Intentá nuevamente.");
          setMutationState(result);
          setPaymentRequest(null);
          setAnnouncement(`${orderId(order.publicNumber)} no se confirmó. ${result.message ?? "Intentá nuevamente."}`);
        }
      } catch {
        const canonicalOrder = await reconcileOrderAction(order.id);
        if (canonicalOrder) {
          setColumns((current) => moveBoardOrder(current, order.id, canonicalOrder.currentStageId, canonicalOrder.updatedAt));
          const message = `Estado actualizado: ${orderId(order.publicNumber)} permanece en ${stageName(canonicalOrder.currentStageId)}.`;
          setErrorMessage(message);
          setMutationState({ message, status: "error", toastId: crypto.randomUUID() });
          setPaymentRequest(null);
          setAnnouncement(message);
        } else {
          const message = "Estado no confirmado. Recargá el tablero para verificar el cobro.";
          setErrorMessage(message);
          setMutationState({ message, status: "error", toastId: crypto.randomUUID() });
          setPaymentRequest(null);
          setAnnouncement(message);
        }
      } finally {
        clearPending(order.id);
        focusOrderControl(order.id, method);
      }
    });
  }

  function requestMove(source: MoveSource, targetStageId: string, method: MovementMethod) {
    const order = findOrder(source.id);
    if (!order) return;
    if (pendingOrderIds.has(source.id)) {
      setAnnouncement(`${orderId(order.publicNumber)} ya tiene un movimiento en curso.`);
      return;
    }
    if (source.currentStageId === targetStageId) {
      setAnnouncement(`${orderId(order.publicNumber)} permanece en ${stageName(source.currentStageId)}.`);
      focusOrderControl(source.id, method);
      return;
    }
    if (source.currentStageId === paidStageId) {
      reportLocalRejection(order, "Los movimientos desde Pagado estarán disponibles en una etapa posterior.", method);
      return;
    }
    if (targetStageId === paidStageId) {
      if (!canConfirmPayment) {
        reportLocalRejection(order, "No tenés permiso para confirmar pagos.", method);
        return;
      }
      openPaymentConfirmation(order, source, method);
      return;
    }

    const targetName = stageName(targetStageId);
    const sourceName = stageName(source.currentStageId);
    const formData = new FormData();
    formData.set("orderId", source.id);
    formData.set("fromStageId", source.currentStageId);
    formData.set("toStageId", targetStageId);
    formData.set("expectedUpdatedAt", source.updatedAt);
    formData.set("idempotencyKey", crypto.randomUUID());

    setErrorMessage(null);
    setPendingOrderIds((current) => new Set(current).add(source.id));
    setColumns((current) => moveBoardOrder(current, source.id, targetStageId));
    setAnnouncement(`Moviendo ${orderId(order.publicNumber)} de ${sourceName} a ${targetName}.`);

    startTransition(async () => {
      try {
        const result = await moveOrderAction({}, formData);
        if (result.status === "success" && result.movedOrder) {
          const message = `${orderId(order.publicNumber)} se movió de ${sourceName} a ${targetName}.`;
          setColumns((current) => moveBoardOrder(current, source.id, result.movedOrder!.toStageId, result.movedOrder!.updatedAt));
          setMutationState({ ...result, message });
          setAnnouncement(message);
        } else {
          const canonicalStageId = result.reconciledOrder?.currentStageId ?? source.currentStageId;
          const canonicalUpdatedAt = result.reconciledOrder?.updatedAt ?? source.updatedAt;
          setColumns((current) => moveBoardOrder(current, source.id, canonicalStageId, canonicalUpdatedAt));
          setErrorMessage(result.message ?? "No se pudo mover el pedido. Intentá nuevamente.");
          setMutationState(result);
          setAnnouncement(`${orderId(order.publicNumber)} no se movió. ${result.message ?? "Intentá nuevamente."}`);
        }
      } catch {
        try {
          const canonicalOrder = await reconcileOrderAction(source.id);
          if (canonicalOrder) {
            const canonicalStageName = stageName(canonicalOrder.currentStageId);
            const confirmed = canonicalOrder.currentStageId === targetStageId;
            const message = confirmed
              ? `${orderId(order.publicNumber)} se confirmó en ${canonicalStageName}.`
              : `${orderId(order.publicNumber)} quedó en ${canonicalStageName}. Actualizá el tablero antes de continuar.`;
            setColumns((current) => moveBoardOrder(current, source.id, canonicalOrder.currentStageId, canonicalOrder.updatedAt));
            setErrorMessage(confirmed ? null : message);
            setMutationState({ message, status: confirmed ? "success" : "error", toastId: crypto.randomUUID() });
            setAnnouncement(message);
          } else {
            const message = "Estado no confirmado. Recargá el tablero para verificar el movimiento.";
            setErrorMessage(message);
            setMutationState({ message, status: "error", toastId: crypto.randomUUID() });
            setAnnouncement(`${orderId(order.publicNumber)} tiene estado no confirmado. Recargá el tablero.`);
          }
        } catch {
          const message = "Estado no confirmado. Recargá el tablero para verificar el movimiento.";
          setErrorMessage(message);
          setMutationState({ message, status: "error", toastId: crypto.randomUUID() });
          setAnnouncement(`${orderId(order.publicNumber)} tiene estado no confirmado. Recargá el tablero.`);
        }
      } finally {
        clearPending(source.id);
        focusOrderControl(source.id, method);
      }
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const order = findOrder(String(event.active.id));
    if (!order) return;
    setActiveDragId(order.id);
    setAnnouncement(`Tomaste ${orderId(order.publicNumber)} desde ${stageName(order.currentStageId)}. Elegí una etapa y soltá para moverlo, o presioná Escape para cancelar.`);
  }

  function handleDragOver(event: DragOverEvent) {
    const order = findOrder(String(event.active.id));
    if (!order) return;
    if (!event.over) {
      setAnnouncement(`${orderId(order.publicNumber)} está fuera de una etapa.`);
      return;
    }

    const targetStageId = String(event.over.id);
    if (targetStageId === order.currentStageId) {
      setAnnouncement(`${orderId(order.publicNumber)} está sobre su etapa actual. Soltar no realizará cambios.`);
    } else if (targetStageId === paidStageId && order.currentStageId !== paidStageId) {
      setAnnouncement(canConfirmPayment
        ? `${orderId(order.publicNumber)} está sobre Pagado. Soltá para confirmar el cobro.`
        : `Pagado no está disponible como destino para ${orderId(order.publicNumber)}.`);
    } else if (order.currentStageId === paidStageId) {
      setAnnouncement(`Pagado no está disponible como origen para ${orderId(order.publicNumber)}.`);
    } else {
      setAnnouncement(`${orderId(order.publicNumber)} está sobre ${stageName(targetStageId)}. Soltá para moverlo.`);
    }
  }

  function handleDragCancel(event: DragCancelEvent) {
    const order = findOrder(String(event.active.id));
    setActiveDragId(null);
    if (!order) return;
    setAnnouncement(`Cancelaste el movimiento de ${orderId(order.publicNumber)}. Permanece en ${stageName(order.currentStageId)}.`);
    focusOrderControl(order.id, "dnd");
  }

  function handleDragEnd(event: DragEndEvent) {
    const order = findOrder(String(event.active.id));
    setActiveDragId(null);
    if (!order) return;
    if (!event.over) {
      setAnnouncement(`Cancelaste el movimiento de ${orderId(order.publicNumber)}. No se seleccionó una etapa.`);
      focusOrderControl(order.id, "dnd");
      return;
    }

    requestMove(
      { id: order.id, currentStageId: order.currentStageId, updatedAt: order.updatedAt },
      String(event.over.id),
      "dnd",
    );
  }

  const dndAnnouncements: Announcements = {
    onDragStart({ active }) {
      const order = findOrder(String(active.id));
      return order ? `Tomaste ${orderId(order.publicNumber)}.` : "Tomaste un pedido.";
    },
    onDragOver({ active, over }) {
      const order = findOrder(String(active.id));
      if (!order || !over) return "El pedido está fuera de una etapa.";
      return `${orderId(order.publicNumber)} está sobre ${stageName(String(over.id))}.`;
    },
    onDragEnd({ active, over }) {
      const order = findOrder(String(active.id));
      if (!order || !over) return "Movimiento cancelado.";
      return `${orderId(order.publicNumber)} se soltó sobre ${stageName(String(over.id))}.`;
    },
    onDragCancel({ active }) {
      const order = findOrder(String(active.id));
      return order ? `Cancelaste el movimiento de ${orderId(order.publicNumber)}.` : "Movimiento cancelado.";
    },
  };

  const orderCount = columns.reduce((count, column) => count + column.orders.length, 0);
  const paymentAmount = canConfirmPayment ? paymentRequest?.order.totalAmount ?? null : null;

  return (
    <DndContext
      accessibility={{
        announcements: dndAnnouncements,
        screenReaderInstructions: {
          draggable: "Para tomar un pedido, presioná Espacio. Usá las flechas para buscar una etapa, Espacio para soltar o Escape para cancelar. También podés usar el selector Mover pedido.",
        },
      }}
      collisionDetection={collisionDetectionStrategy}
      id="order-board-dnd"
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <section aria-label="Tablero de pedidos" className="flex min-w-0 flex-col gap-5 lg:min-h-0 lg:flex-1">
        <p aria-atomic="true" aria-live="assertive" className="sr-only" data-testid="board-announcement">{announcement}</p>
        <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" data-board-count>{orderCount === 1 ? "1 pedido en seguimiento" : `${orderCount} pedidos en seguimiento`}</p>
          {canCreateOrders ? <Button asChild><Link href="/orders/new">Nuevo pedido</Link></Button> : null}
        </div>
        {orderCount === 0 ? (
          <Alert>
            <PackageOpen aria-hidden="true" />
            <AlertTitle>Todavía no hay pedidos en el tablero</AlertTitle>
            <AlertDescription>{canCreateOrders ? "Creá un pedido para incorporarlo a Pedido recibido." : "Cuando se registren pedidos, se organizarán aquí por etapa."}</AlertDescription>
          </Alert>
        ) : null}
        {errorMessage ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>No pudimos mover el pedido</AlertTitle><AlertDescription>{errorMessage}</AlertDescription></Alert> : null}
         {mutationState.status === "success" ? <Alert variant="success"><CircleCheck aria-hidden="true" /><AlertDescription>{mutationState.message}</AlertDescription></Alert> : null}
         {quickViewError ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>No pudimos abrir la vista rápida</AlertTitle><AlertDescription>{quickViewError}</AlertDescription></Alert> : null}
         {isQuickViewPending ? <p aria-live="polite" className="text-sm text-muted-foreground">Cargando vista rápida...</p> : null}
          {quickView ? <OrderQuickViewPanel data={quickView} onClose={() => setQuickView(null)} onReconciled={(reconciledOrder) => { if (reconciledOrder) setColumns((current) => replaceBoardOrder(current, reconciledOrder)); setQuickView(null); }} stageNames={Object.fromEntries(columns.map((column) => [column.id, column.name]))} /> : null}
          <div className="w-full min-w-0 overflow-x-hidden lg:min-h-48 lg:flex-1 lg:overflow-x-auto lg:overflow-y-auto" data-testid="board-scroll-container">
            <div className="flex w-full min-w-0 max-w-full flex-col gap-4 lg:min-h-full lg:grid lg:grid-flow-col lg:auto-cols-[minmax(17rem,1fr)] lg:overscroll-x-contain lg:pb-3">
            {columns.map((column) => (
              <BoardColumnView activeOrder={activeOrder} canConfirmPayment={canConfirmPayment} column={column} key={column.id} paidStageId={paidStageId}>
                {column.orders.map((order) => (
                  <DraggableOrderCard canConfirmPayment={canConfirmPayment} columns={columns} isPending={pendingOrderIds.has(order.id)} key={order.id} onMove={requestMove} onQuickView={openQuickView} order={order} />
                ))}
              </BoardColumnView>
            ))}
          </div>
        </div>
      </section>
      <AlertDialog open={Boolean(paymentRequest)} onOpenChange={(open) => { if (!open && !pendingOrderIds.size) closePaymentConfirmation(); }}>
        {paymentRequest ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar cobro</AlertDialogTitle>
              <AlertDialogDescription>Esta acción registrará el cobro total, un ingreso en caja cuando corresponda y moverá el pedido a Pagado. El actor y la hora del servidor quedarán en el historial.</AlertDialogDescription>
            </AlertDialogHeader>
            <dl className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">Pedido</dt><dd className="font-mono font-semibold">{orderId(paymentRequest.order.publicNumber)}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">Cliente</dt><dd className="text-right font-medium">{paymentRequest.order.customerName}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">Importe total</dt><dd className="font-mono font-semibold tabular-nums">{paymentAmount === null ? "El importe se mostrará solo a los roles autorizados." : formatArs(String(paymentAmount))}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">Destino</dt><dd className="font-medium">Pagado</dd></div>
            </dl>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pendingOrderIds.has(paymentRequest.order.id)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction asChild><Button disabled={pendingOrderIds.has(paymentRequest.order.id)} onClick={confirmPayment} type="button">{pendingOrderIds.has(paymentRequest.order.id) ? "Confirmando..." : "Confirmar cobro"}</Button></AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
      <DragOverlay dropAnimation={null}>
        {activeOrder ? (
          <div className="w-72 rounded-lg border border-primary bg-card p-4 shadow-lg forced-colors:outline forced-colors:outline-2 forced-colors:outline-[Highlight]" data-testid="drag-overlay">
            <OrderSummary order={activeOrder} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
