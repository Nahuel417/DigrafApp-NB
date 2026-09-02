'use client';

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
} from '@dnd-kit/core';
import { AlertCircle, ArrowRight, ArrowUpRight, CalendarDays, ChevronDown, CircleCheck, Eye, FileText, GripVertical, Package, PackageOpen, Shirt } from 'lucide-react';
import { createPortal } from 'react-dom';
import { startTransition, useEffect, useRef, useState, useTransition } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMutationToast } from '@/hooks/use-mutation-toast';
import { formatArs } from '@/lib/money/decimal';

import {
    confirmOrderPaymentAction,
    getOrderQuickViewAction,
    moveOrderAction,
    reconcileOrderAction,
    type ConfirmOrderPaymentActionState,
    type MoveOrderActionState,
    type OrderQuickView,
} from '../actions';
import { moveBoardOrder, replaceBoardOrder } from '../board-state';
import type { BoardColumn, BoardOrder } from '../queries';
import { OrderDesignThumbnail } from './order-design-thumbnail';
import { OrderQuickView as OrderQuickViewPanel } from './order-quick-view';

type MoveSource = Pick<BoardOrder, 'id' | 'currentStageId' | 'updatedAt'>;
type MovementMethod = 'selector' | 'dnd';
type QuickViewData = OrderQuickView & Pick<BoardOrder, 'primaryDesignImage' | 'productName'>;
type PaymentRequest = { order: BoardOrder; source: MoveSource; method: MovementMethod };

const collisionDetectionStrategy: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
};

function orderId(publicNumber: number) {
    return `PED-${String(publicNumber).padStart(6, '0')}`;
}

function orderDetailPath(orderId: string) {
    return `/orders/${orderId}`;
}

function OrderSummary({ order, showThumbnail }: { order: BoardOrder; showThumbnail?: boolean }) {
    return (
        <>
            <div className="flex items-start gap-3">
                {showThumbnail ? (
                    <OrderDesignThumbnail
                        alt={`Diseño de ${order.customerName}`}
                        className="size-9 shrink-0 rounded-lg [&>span]:sr-only [&>svg]:size-3.5"
                        imageUpdatedAt={order.primaryDesignImage?.updatedAt ?? null}
                        key={order.primaryDesignImage?.updatedAt ?? 'empty'}
                        orderId={order.id}
                    />
                ) : null}
                <div className="min-w-0 flex-1 pr-8">
                    <p className="font-mono text-[11px] tracking-data text-muted-foreground">{orderId(order.publicNumber)}</p>
                    <h3 className="mt-0.5 flex min-w-0 items-center gap-1 text-xs font-medium leading-snug">
                        <FileText aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                        <a
                            className="min-w-0 truncate transition-colors duration-150 hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
                            href={orderDetailPath(order.id)}
                            onPointerDown={(event) => event.stopPropagation()}>
                            {order.customerName ?? 'Cliente histórico'}
                        </a>
                        <ArrowUpRight
                            aria-hidden="true"
                            className="size-3.5 shrink-0 text-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100 motion-reduce:transition-none"
                        />
                    </h3>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{order.teamName ?? 'Equipo sin completar'}</p>
                </div>
            </div>
            <dl className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted px-2 py-0.5">
                    <Package aria-hidden="true" className="size-3" />
                    <dt className="sr-only">Cantidad</dt>
                    <dd className="font-mono tabular-nums">{order.quantity} u.</dd>
                </div>
                <div className="inline-flex min-w-0 items-center gap-1 rounded-full border border-border bg-surface-muted px-2 py-0.5">
                    <Shirt aria-hidden="true" className="size-3 shrink-0" />
                    <dt className="sr-only">Producto</dt>
                    <dd className="max-w-[9rem] truncate">{order.productName ?? 'Sin producto'}</dd>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted px-2 py-0.5">
                    <CalendarDays aria-hidden="true" className="size-3" />
                    <dt className="sr-only">Entrega prometida</dt>
                    <dd className="font-mono tabular-nums">{order.promisedDeliveryDate}</dd>
                </div>
            </dl>
        </>
    );
}

function MoveOrderSelector({
    canConfirmPayment,
    canDeliverPaidOrders,
    columns,
    isPending,
    onMove,
    order,
}: {
    canConfirmPayment: boolean;
    canDeliverPaidOrders?: boolean;
    columns: BoardColumn[];
    isPending: boolean;
    onMove: (source: MoveSource, targetStageId: string, method: MovementMethod) => void;
    order: BoardOrder;
}) {
    const [destination, setDestination] = useState('');
    const selectId = `move-order-${order.id}`;
    const paidStageId = columns.find((column) => column.code === 'paid')?.id;
    const movementLocked = order.currentStageId === paidStageId && !canDeliverPaidOrders;
    const availableDestinations =
        order.currentStageId === paidStageId
            ? columns.filter((column) => column.code === 'delivered')
            : columns.filter((column) => column.id !== order.currentStageId && (canConfirmPayment || column.code !== 'paid'));

    if (movementLocked) {
        return <p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">Los movimientos desde Pagado no están disponibles para este rol.</p>;
    }

    return (
        <details className="group/move mt-2 border-t border-border pt-1.5">
            <summary className="flex min-h-5 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-1.5 text-[10px] text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                <span>Mostrar movimiento</span>
                <ChevronDown aria-hidden="true" className="size-3.5 transition-transform duration-150 group-open/move:rotate-180 motion-reduce:transition-none" />
            </summary>
            <form
                className="mt-2 border-t border-border pt-2"
                noValidate
                onPointerDown={(event) => event.stopPropagation()}
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!destination || isPending) return;
                    onMove({ id: order.id, currentStageId: order.currentStageId, updatedAt: order.updatedAt }, destination, 'selector');
                }}>
                <Field className="gap-2">
                    <FieldLabel className="text-[10px]" htmlFor={selectId}>
                        Mover {orderId(order.publicNumber)} a
                    </FieldLabel>
                    <Select disabled={isPending} name="toStageId" onValueChange={setDestination} value={destination}>
                        <SelectTrigger className="h-8 rounded-lg px-2.5 py-1 text-xs shadow-none [&>svg]:size-3.5" data-move-selector={order.id} id={selectId}>
                            <SelectValue placeholder="Elegí una etapa" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                {availableDestinations.map((column) => (
                                    <SelectItem key={column.id} value={column.id}>
                                        {column.name}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </Field>
                <Button className="mt-2 h-8 w-full px-3 py-1 text-xs shadow-none [&_svg]:size-3.5" disabled={!destination || isPending} type="submit" variant="outline">
                    <ArrowRight aria-hidden="true" />
                    {isPending ? 'Moviendo...' : 'Mover pedido'}
                </Button>
            </form>
        </details>
    );
}

function DraggableOrderCard({
    canConfirmPayment,
    canDeliverPaidOrders,
    columns,
    disableDragOnMobile,
    isPending,
    onMove,
    onQuickView,
    order,
}: {
    canConfirmPayment: boolean;
    canDeliverPaidOrders?: boolean;
    columns: BoardColumn[];
    disableDragOnMobile: boolean;
    isPending: boolean;
    onMove: (source: MoveSource, targetStageId: string, method: MovementMethod) => void;
    onQuickView: (orderId: string, trigger: HTMLButtonElement) => void;
    order: BoardOrder;
}) {
    const paidStageId = columns.find((column) => column.code === 'paid')?.id;
    const dragDisabled = disableDragOnMobile || isPending || (order.currentStageId === paidStageId && !canDeliverPaidOrders);
    const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } = useDraggable({
        id: order.id,
        disabled: dragDisabled,
        data: { currentStageId: order.currentStageId },
    });

    return (
        <article
            {...listeners}
            aria-busy={isPending || undefined}
            className={`group rounded-xl border border-border bg-card p-2.5 shadow-xs transition-[border-color,opacity,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-sm motion-reduce:transform-none motion-reduce:transition-none ${isDragging ? 'opacity-40' : 'opacity-100'}`}
            data-order-id={order.id}
            ref={setNodeRef}>
            <div className="relative">
                <div className="min-w-0 flex-1">
                    <OrderSummary order={order} showThumbnail />
                </div>
                <div className="absolute right-0 top-0 flex shrink-0 gap-1">
                    <Button
                        {...attributes}
                        aria-label={dragDisabled ? `No se puede arrastrar ${orderId(order.publicNumber)}` : `Arrastrar ${orderId(order.publicNumber)}`}
                        aria-pressed={isDragging}
                        className="hidden size-7 touch-none cursor-grab text-muted-foreground transition-[background-color,color,opacity] duration-200 ease-out active:cursor-grabbing forced-colors:outline forced-colors:outline-2 forced-colors:outline-transparent lg:inline-flex lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 [&_svg]:size-3.5"
                        data-drag-handle={order.id}
                        disabled={dragDisabled}
                        ref={setActivatorNodeRef}
                        size="icon"
                        title={dragDisabled ? 'Movimiento no disponible' : 'Arrastrar pedido'}
                        type="button"
                        variant="ghost">
                        <GripVertical aria-hidden="true" />
                    </Button>
                </div>
            </div>
            <Button
                aria-label={`Vista rápida de ${orderId(order.publicNumber)}`}
                className="mt-2 h-6 w-full rounded-xl border border-border bg-surface-muted px-2 py-1 text-[10px] font-normal text-muted-foreground shadow-none hover:border-primary/40 hover:bg-primary/10 hover:text-primary [&_svg]:size-3"
                data-no-drag="true"
                onClick={(event) => onQuickView(order.id, event.currentTarget)}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
                variant="ghost">
                <Eye data-icon="inline-start" />
                Vista rápida
            </Button>
            <MoveOrderSelector canConfirmPayment={canConfirmPayment} canDeliverPaidOrders={canDeliverPaidOrders} columns={columns} isPending={isPending} onMove={onMove} order={order} />
        </article>
    );
}

function BoardColumnView({
    activeOrder,
    canConfirmPayment,
    canDeliverPaidOrders,
    children,
    column,
    paidStageId,
}: {
    activeOrder: BoardOrder | null;
    canConfirmPayment: boolean;
    canDeliverPaidOrders?: boolean;
    children: React.ReactNode;
    column: BoardColumn;
    paidStageId?: string;
}) {
    const { isOver, setNodeRef } = useDroppable({
        disabled: (!canConfirmPayment && column.id === paidStageId) || (!canDeliverPaidOrders && activeOrder?.currentStageId === paidStageId),
        id: column.id,
        data: { code: column.code },
    });
    const isCurrentStage = activeOrder?.currentStageId === column.id;
    const isMovingFromPaid = Boolean(activeOrder && activeOrder.currentStageId === paidStageId);
    const isPaidTarget = Boolean(activeOrder && column.id === paidStageId && activeOrder.currentStageId !== paidStageId);
    const isPaymentTarget = Boolean(canConfirmPayment && isPaidTarget);
    const isDeliverPaidTarget = Boolean(activeOrder && isMovingFromPaid && column.code === 'delivered');
    const isValidTarget = Boolean(activeOrder && !isCurrentStage && (isDeliverPaidTarget ? canDeliverPaidOrders : !isMovingFromPaid && (!isPaidTarget || canConfirmPayment)));
    const targetLabel = !activeOrder
        ? null
        : isMovingFromPaid && !isDeliverPaidTarget
          ? 'Destino no disponible'
          : isPaidTarget && !canConfirmPayment
            ? 'Destino no disponible'
            : isPaymentTarget
              ? 'Confirmar cobro'
              : isCurrentStage
                ? 'Etapa actual'
                : 'Destino disponible';

    return (
        <section
            aria-labelledby={`stage-${column.id}`}
            className={`min-w-0 rounded-2xl border bg-surface-muted transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none forced-colors:outline forced-colors:outline-2 forced-colors:outline-transparent lg:min-h-full ${
                isOver && isValidTarget
                    ? 'border-primary shadow-sm outline outline-2 outline-primary outline-offset-2'
                    : isOver && !isValidTarget
                      ? 'border-error outline outline-2 outline-error outline-offset-2'
                      : 'border-border'
            }`}
            data-drop-stage={column.code}
            data-drop-valid={isValidTarget ? 'true' : 'false'}
            id={`stage-panel-${column.id}`}
            ref={setNodeRef}>
            <header className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" />
                        <h2 className="truncate text-sm font-medium" id={`stage-${column.id}`}>
                            {column.name}
                        </h2>
                    </div>
                    {targetLabel ? <p className={`mt-1 text-xs ${isValidTarget ? 'text-primary' : 'text-muted-foreground'}`}>{targetLabel}</p> : null}
                </div>
                <span className="rounded-full bg-card px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground" data-stage-count={column.code}>
                    {column.orders.length}
                </span>
            </header>
            <div className="flex min-h-28 flex-col gap-3 p-3">
                {column.orders.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">Sin pedidos en esta etapa</p>
                ) : null}
                {children}
            </div>
        </section>
    );
}

export function OrderBoard({
    canConfirmPayment,
    canDeliverPaidOrders = false,
    canCreateOrders,
    initialColumns,
}: {
    canConfirmPayment: boolean;
    canDeliverPaidOrders?: boolean;
    canCreateOrders: boolean;
    initialColumns: BoardColumn[];
}) {
    const [columns, setColumns] = useState(initialColumns);
    const [mobileStageId, setMobileStageId] = useState(() => initialColumns[0]?.id ?? '');
    const [pendingOrderIds, setPendingOrderIds] = useState<Set<string>>(() => new Set());
    const [isMobileBoard, setIsMobileBoard] = useState(false);
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [dragPreviewAnchor, setDragPreviewAnchor] = useState<{ x: number; y: number } | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [announcement, setAnnouncement] = useState('Tablero listo para mover pedidos.');
    const [mutationState, setMutationState] = useState<MoveOrderActionState | ConfirmOrderPaymentActionState>({});
    const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
    const [quickView, setQuickView] = useState<QuickViewData | null>(null);
    const [quickViewError, setQuickViewError] = useState<string | null>(null);
    const [isQuickViewPending, startQuickViewTransition] = useTransition();
    const quickViewTriggerRef = useRef<HTMLButtonElement | null>(null);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));
    const allOrders = columns.flatMap((column) => column.orders);
    const activeOrder = activeDragId ? (allOrders.find((order) => order.id === activeDragId) ?? null) : null;
    const paidStageId = columns.find((column) => column.code === 'paid')?.id;
    const selectedMobileStageId = columns.some((column) => column.id === mobileStageId) ? mobileStageId : columns[0]?.id ?? '';
    useMutationToast(mutationState);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mediaQuery = window.matchMedia('(max-width: 1023px)');
        const updateMobileState = () => setIsMobileBoard(mediaQuery.matches);
        updateMobileState();
        mediaQuery.addEventListener('change', updateMobileState);
        return () => mediaQuery.removeEventListener('change', updateMobileState);
    }, []);

    function stageName(stageId: string) {
        return columns.find((column) => column.id === stageId)?.name ?? 'la etapa seleccionada';
    }

    function findOrder(orderIdValue: string) {
        return columns.flatMap((column) => column.orders).find((order) => order.id === orderIdValue);
    }

    function handleMobileStageKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
        if (!columns.length) return;
        let nextIndex: number | null = null;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % columns.length;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + columns.length) % columns.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = columns.length - 1;
        if (nextIndex === null) return;

        event.preventDefault();
        const nextColumn = columns[nextIndex];
        setMobileStageId(nextColumn.id);
        document.getElementById(`mobile-stage-tab-${nextColumn.id}`)?.focus();
    }

    function focusOrderControl(orderIdValue: string, method: MovementMethod) {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                const attribute = method === 'dnd' ? 'data-drag-handle' : 'data-move-selector';
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

    function openQuickView(orderIdValue: string, trigger: HTMLButtonElement) {
        quickViewTriggerRef.current = trigger;
        setQuickViewError(null);
        const boardOrder = findOrder(orderIdValue);
        startQuickViewTransition(async () => {
            const result = await getOrderQuickViewAction(orderIdValue);
            if (result.data) {
                setQuickView({
                    ...result.data,
                    primaryDesignImage: boardOrder?.primaryDesignImage ?? null,
                    productName: boardOrder?.productName ?? null,
                });
            } else setQuickViewError(result.message ?? 'No se pudo cargar la vista rápida.');
        });
    }

    function closeQuickView() {
        setQuickView(null);
        window.requestAnimationFrame(() => quickViewTriggerRef.current?.focus());
    }

    function reportLocalRejection(order: BoardOrder, message: string, method: MovementMethod) {
        setErrorMessage(message);
        setMutationState({ message, status: 'error', toastId: crypto.randomUUID() });
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
        formData.set('orderId', order.id);
        formData.set('expectedUpdatedAt', source.updatedAt);
        formData.set('idempotencyKey', crypto.randomUUID());

        setErrorMessage(null);
        setPendingOrderIds((current) => new Set(current).add(order.id));
        setAnnouncement(`Confirmando el cobro de ${orderId(order.publicNumber)}.`);
        startTransition(async () => {
            try {
                const result = await confirmOrderPaymentAction({}, formData);
                if (result.status === 'success') {
                    setMobileStageId(result.reconciledOrder?.currentStageId ?? paidStageId ?? source.currentStageId);
                    setColumns((current) =>
                        result.reconciledOrder
                            ? replaceBoardOrder(current, result.reconciledOrder)
                            : moveBoardOrder(current, order.id, paidStageId ?? source.currentStageId, result.confirmedAt),
                    );
                    setMutationState(result);
                    setPaymentRequest(null);
                    setAnnouncement(result.message ?? `${orderId(order.publicNumber)} quedó confirmado como Pagado.`);
                } else {
                    if (result.reconciledOrder) {
                        setMobileStageId(result.reconciledOrder.currentStageId);
                        setColumns((current) => replaceBoardOrder(current, result.reconciledOrder!));
                    }
                    setErrorMessage(result.message ?? 'No se pudo confirmar el cobro. Intentá nuevamente.');
                    setMutationState(result);
                    setPaymentRequest(null);
                    setAnnouncement(`${orderId(order.publicNumber)} no se confirmó. ${result.message ?? 'Intentá nuevamente.'}`);
                }
            } catch {
                const canonicalOrder = await reconcileOrderAction(order.id);
                if (canonicalOrder) {
                    setMobileStageId(canonicalOrder.currentStageId);
                    setColumns((current) => moveBoardOrder(current, order.id, canonicalOrder.currentStageId, canonicalOrder.updatedAt));
                    const message = `Estado actualizado: ${orderId(order.publicNumber)} permanece en ${stageName(canonicalOrder.currentStageId)}.`;
                    setErrorMessage(message);
                    setMutationState({ message, status: 'error', toastId: crypto.randomUUID() });
                    setPaymentRequest(null);
                    setAnnouncement(message);
                } else {
                    const message = 'Estado no confirmado. Recargá el tablero para verificar el cobro.';
                    setErrorMessage(message);
                    setMutationState({ message, status: 'error', toastId: crypto.randomUUID() });
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
        if (source.currentStageId === paidStageId && (!canDeliverPaidOrders || columns.find((column) => column.id === targetStageId)?.code !== 'delivered')) {
            reportLocalRejection(order, 'Solo se permite entregar un pedido pagado.', method);
            return;
        }
        if (targetStageId === paidStageId) {
            if (!canConfirmPayment) {
                reportLocalRejection(order, 'No tenés permiso para confirmar pagos.', method);
                return;
            }
            openPaymentConfirmation(order, source, method);
            return;
        }

        const targetName = stageName(targetStageId);
        const sourceName = stageName(source.currentStageId);
        const formData = new FormData();
        formData.set('orderId', source.id);
        formData.set('fromStageId', source.currentStageId);
        formData.set('toStageId', targetStageId);
        formData.set('expectedUpdatedAt', source.updatedAt);
        formData.set('idempotencyKey', crypto.randomUUID());

        setErrorMessage(null);
        setPendingOrderIds((current) => new Set(current).add(source.id));
        setMobileStageId(targetStageId);
        setColumns((current) => moveBoardOrder(current, source.id, targetStageId));
        setAnnouncement(`Moviendo ${orderId(order.publicNumber)} de ${sourceName} a ${targetName}.`);

        startTransition(async () => {
            try {
                const result = await moveOrderAction({}, formData);
                if (result.status === 'success' && result.movedOrder) {
                    setMobileStageId(result.movedOrder.toStageId);
                    const message = `${orderId(order.publicNumber)} se movió de ${sourceName} a ${targetName}.`;
                    setColumns((current) => moveBoardOrder(current, source.id, result.movedOrder!.toStageId, result.movedOrder!.updatedAt));
                    setMutationState({ ...result, message });
                    setAnnouncement(message);
                } else {
                    const canonicalStageId = result.reconciledOrder?.currentStageId ?? source.currentStageId;
                    const canonicalUpdatedAt = result.reconciledOrder?.updatedAt ?? source.updatedAt;
                    setMobileStageId(canonicalStageId);
                    setColumns((current) => moveBoardOrder(current, source.id, canonicalStageId, canonicalUpdatedAt));
                    setErrorMessage(result.message ?? 'No se pudo mover el pedido. Intentá nuevamente.');
                    setMutationState(result);
                    setAnnouncement(`${orderId(order.publicNumber)} no se movió. ${result.message ?? 'Intentá nuevamente.'}`);
                }
            } catch {
                try {
                    const canonicalOrder = await reconcileOrderAction(source.id);
                    if (canonicalOrder) {
                        setMobileStageId(canonicalOrder.currentStageId);
                        const canonicalStageName = stageName(canonicalOrder.currentStageId);
                        const confirmed = canonicalOrder.currentStageId === targetStageId;
                        const message = confirmed
                            ? `${orderId(order.publicNumber)} se confirmó en ${canonicalStageName}.`
                            : `${orderId(order.publicNumber)} quedó en ${canonicalStageName}. Actualizá el tablero antes de continuar.`;
                        setColumns((current) => moveBoardOrder(current, source.id, canonicalOrder.currentStageId, canonicalOrder.updatedAt));
                        setErrorMessage(confirmed ? null : message);
                        setMutationState({ message, status: confirmed ? 'success' : 'error', toastId: crypto.randomUUID() });
                        setAnnouncement(message);
                    } else {
                        const message = 'Estado no confirmado. Recargá el tablero para verificar el movimiento.';
                        setErrorMessage(message);
                        setMutationState({ message, status: 'error', toastId: crypto.randomUUID() });
                        setAnnouncement(`${orderId(order.publicNumber)} tiene estado no confirmado. Recargá el tablero.`);
                    }
                } catch {
                    const message = 'Estado no confirmado. Recargá el tablero para verificar el movimiento.';
                    setErrorMessage(message);
                    setMutationState({ message, status: 'error', toastId: crypto.randomUUID() });
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
        const activeNode = Array.from(document.querySelectorAll<HTMLElement>('[data-order-id]')).find((node) => node.dataset.orderId === String(event.active.id));
        const initialRect = event.active.rect.current.initial ?? activeNode?.getBoundingClientRect() ?? null;
        const clientX = 'clientX' in event.activatorEvent ? event.activatorEvent.clientX : null;
        const clientY = 'clientY' in event.activatorEvent ? event.activatorEvent.clientY : null;
        setDragPreviewAnchor(initialRect && typeof clientX === 'number' && typeof clientY === 'number' ? { x: clientX - initialRect.left, y: clientY - initialRect.top } : null);
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
        } else if (order.currentStageId === paidStageId && columns.find((column) => column.id === targetStageId)?.code === 'delivered' && canDeliverPaidOrders) {
            setAnnouncement(`${orderId(order.publicNumber)} está sobre Entregado. Soltá para entregar el pedido.`);
        } else if (targetStageId === paidStageId && order.currentStageId !== paidStageId) {
            setAnnouncement(
                canConfirmPayment
                    ? `${orderId(order.publicNumber)} está sobre Pagado. Soltá para confirmar el cobro.`
                    : `Pagado no está disponible como destino para ${orderId(order.publicNumber)}.`,
            );
        } else if (order.currentStageId === paidStageId) {
            setAnnouncement(`Pagado no está disponible como origen para ${orderId(order.publicNumber)}.`);
        } else {
            setAnnouncement(`${orderId(order.publicNumber)} está sobre ${stageName(targetStageId)}. Soltá para moverlo.`);
        }
    }

    function handleDragCancel(event: DragCancelEvent) {
        const order = findOrder(String(event.active.id));
        setActiveDragId(null);
        setDragPreviewAnchor(null);
        if (!order) return;
        setAnnouncement(`Cancelaste el movimiento de ${orderId(order.publicNumber)}. Permanece en ${stageName(order.currentStageId)}.`);
        focusOrderControl(order.id, 'dnd');
    }

    function handleDragEnd(event: DragEndEvent) {
        const order = findOrder(String(event.active.id));
        setActiveDragId(null);
        setDragPreviewAnchor(null);
        if (!order) return;
        if (!event.over) {
            setAnnouncement(`Cancelaste el movimiento de ${orderId(order.publicNumber)}. No se seleccionó una etapa.`);
            focusOrderControl(order.id, 'dnd');
            return;
        }

        requestMove({ id: order.id, currentStageId: order.currentStageId, updatedAt: order.updatedAt }, String(event.over.id), 'dnd');
    }

    const dndAnnouncements: Announcements = {
        onDragStart({ active }) {
            const order = findOrder(String(active.id));
            return order ? `Tomaste ${orderId(order.publicNumber)}.` : 'Tomaste un pedido.';
        },
        onDragOver({ active, over }) {
            const order = findOrder(String(active.id));
            if (!order || !over) return 'El pedido está fuera de una etapa.';
            return `${orderId(order.publicNumber)} está sobre ${stageName(String(over.id))}.`;
        },
        onDragEnd({ active, over }) {
            const order = findOrder(String(active.id));
            if (!order || !over) return 'Movimiento cancelado.';
            return `${orderId(order.publicNumber)} se soltó sobre ${stageName(String(over.id))}.`;
        },
        onDragCancel({ active }) {
            const order = findOrder(String(active.id));
            return order ? `Cancelaste el movimiento de ${orderId(order.publicNumber)}.` : 'Movimiento cancelado.';
        },
    };

    const orderCount = columns.reduce((count, column) => count + column.orders.length, 0);
    const paymentAmount = canConfirmPayment ? (paymentRequest?.order.totalAmount ?? null) : null;
    const dragOverlay = (
        <DragOverlay dropAnimation={null}>
            {activeOrder ? (
                <div
                    className="absolute w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-primary bg-card p-4 shadow-lg forced-colors:outline forced-colors:outline-2 forced-colors:outline-[Highlight]"
                    data-testid="drag-overlay"
                    style={{ left: dragPreviewAnchor?.x ?? '50%', top: dragPreviewAnchor?.y ?? '50%' }}>
                    <OrderSummary order={activeOrder} />
                </div>
            ) : null}
        </DragOverlay>
    );

    return (
        <DndContext
            accessibility={{
                announcements: dndAnnouncements,
                screenReaderInstructions: {
                    draggable:
                        'Para tomar un pedido, presioná Espacio. Usá las flechas para buscar una etapa, Espacio para soltar o Escape para cancelar. También podés usar el selector Mover pedido.',
                },
            }}
            collisionDetection={collisionDetectionStrategy}
            id="order-board-dnd"
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragStart={handleDragStart}
            sensors={sensors}>
            <section aria-label="Tablero de pedidos" className="mt-5 flex min-w-0 flex-col gap-4 lg:min-h-0 lg:flex-1">
                <p aria-atomic="true" aria-live="assertive" className="sr-only" data-testid="board-announcement">
                    {announcement}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5" data-board-count>
                        <Package aria-hidden="true" className="size-3.5 text-primary" />
                        {orderCount === 1 ? '1 pedido en seguimiento' : `${orderCount} pedidos en seguimiento`}
                    </p>
                </div>
                {orderCount === 0 ? (
                    <Alert>
                        <PackageOpen aria-hidden="true" />
                        <AlertTitle>Todavía no hay pedidos en el tablero</AlertTitle>
                        <AlertDescription>
                            {canCreateOrders ? 'Creá un pedido para incorporarlo a Pedido recibido.' : 'Cuando se registren pedidos, se organizarán aquí por etapa.'}
                        </AlertDescription>
                    </Alert>
                ) : null}
                {errorMessage ? (
                    <Alert variant="destructive">
                        <AlertCircle aria-hidden="true" />
                        <AlertTitle>No pudimos mover el pedido</AlertTitle>
                        <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                ) : null}
                {mutationState.status === 'success' ? (
                    <Alert variant="success">
                        <CircleCheck aria-hidden="true" />
                        <AlertDescription>{mutationState.message}</AlertDescription>
                    </Alert>
                ) : null}
                {quickViewError ? (
                    <Alert variant="destructive">
                        <AlertCircle aria-hidden="true" />
                        <AlertTitle>No pudimos abrir la vista rápida</AlertTitle>
                        <AlertDescription>{quickViewError}</AlertDescription>
                    </Alert>
                ) : null}
                {isQuickViewPending ? (
                    <p aria-live="polite" className="text-sm text-muted-foreground">
                        Cargando vista rápida...
                    </p>
                ) : null}
                {quickView ? (
                    <OrderQuickViewPanel
                        data={quickView}
                        onClose={closeQuickView}
                        onReconciled={(reconciledOrder) => {
                            if (reconciledOrder) {
                                setMobileStageId(reconciledOrder.currentStageId);
                                setColumns((current) => replaceBoardOrder(current, reconciledOrder));
                            }
                            closeQuickView();
                        }}
                        stageNames={Object.fromEntries(columns.map((column) => [column.id, column.name]))}
                    />
                ) : null}
                <div className="w-full min-w-0 overflow-x-hidden lg:min-h-48 lg:flex-1 lg:overflow-x-auto lg:overflow-y-auto" data-testid="board-scroll-container">
                    <div aria-label="Etapas del tablero" className="mb-3 flex min-w-0 gap-2 overflow-x-auto pb-1 lg:hidden" data-testid="mobile-stage-selector" role="tablist">
                        {columns.map((column, index) => {
                            const isSelected = column.id === selectedMobileStageId;
                            const orderLabel = column.orders.length === 1 ? 'pedido' : 'pedidos';
                            return (
                                <button
                                    aria-controls={`stage-panel-${column.id}`}
                                    aria-label={`${column.name}, ${column.orders.length} ${orderLabel}`}
                                    aria-selected={isSelected}
                                    className={`flex min-h-11 min-w-[10rem] shrink-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${
                                        isSelected
                                            ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                                            : 'border-border bg-card text-foreground hover:border-primary/50 hover:bg-primary/10'
                                    }`}
                                    id={`mobile-stage-tab-${column.id}`}
                                    key={column.id}
                                    onClick={() => setMobileStageId(column.id)}
                                    onKeyDown={(event) => handleMobileStageKeyDown(event, index)}
                                    role="tab"
                                    tabIndex={isSelected ? 0 : -1}
                                    type="button">
                                    <span className="min-w-0 truncate">{column.name}</span>
                                    <span className="rounded-full border border-current px-2 py-0.5 font-mono text-[11px] tabular-nums">{column.orders.length}</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex w-full min-w-0 max-w-full flex-col gap-4 lg:min-h-full lg:w-max lg:max-w-none lg:flex-row lg:overscroll-x-contain lg:pb-3">
                        {columns.map((column) => (
                            <div className={`${column.id === selectedMobileStageId ? 'block' : 'hidden'} lg:block lg:w-[18.75rem] lg:shrink-0`} data-testid={`mobile-stage-panel-${column.code}`} key={column.id}>
                                <BoardColumnView
                                    activeOrder={activeOrder}
                                    canConfirmPayment={canConfirmPayment}
                                    canDeliverPaidOrders={canDeliverPaidOrders}
                                    column={column}
                                    paidStageId={paidStageId}>
                                    {column.orders.map((order) => (
                                        <DraggableOrderCard
                                            canConfirmPayment={canConfirmPayment}
                                            canDeliverPaidOrders={canDeliverPaidOrders}
                                            columns={columns}
                                            disableDragOnMobile={isMobileBoard}
                                            isPending={pendingOrderIds.has(order.id)}
                                            key={order.id}
                                            onMove={requestMove}
                                            onQuickView={openQuickView}
                                            order={order}
                                        />
                                    ))}
                                </BoardColumnView>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
            <AlertDialog
                open={Boolean(paymentRequest)}
                onOpenChange={(open) => {
                    if (!open && !pendingOrderIds.size) closePaymentConfirmation();
                }}>
                {paymentRequest ? (
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar cobro</AlertDialogTitle>
                            <AlertDialogDescription>
                                Esta acción registrará el cobro total, un ingreso en caja cuando corresponda y moverá el pedido a Pagado. El actor y la hora del servidor quedarán en el
                                historial.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <dl className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                            <div className="flex items-center justify-between gap-4">
                                <dt className="text-muted-foreground">Pedido</dt>
                                <dd className="font-mono font-semibold">{orderId(paymentRequest.order.publicNumber)}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <dt className="text-muted-foreground">Cliente</dt>
                                <dd className="text-right font-medium">{paymentRequest.order.customerName}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <dt className="text-muted-foreground">Importe total</dt>
                                <dd className="font-mono font-semibold tabular-nums">
                                    {paymentAmount === null ? 'El importe se mostrará solo a los roles autorizados.' : formatArs(String(paymentAmount))}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <dt className="text-muted-foreground">Destino</dt>
                                <dd className="font-medium">Pagado</dd>
                            </div>
                        </dl>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={pendingOrderIds.has(paymentRequest.order.id)}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction asChild>
                                <Button disabled={pendingOrderIds.has(paymentRequest.order.id)} onClick={confirmPayment} type="button">
                                    {pendingOrderIds.has(paymentRequest.order.id) ? 'Confirmando...' : 'Confirmar cobro'}
                                </Button>
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                ) : null}
            </AlertDialog>
            {typeof document === 'undefined' ? dragOverlay : createPortal(dragOverlay, document.body)}
        </DndContext>
    );
}
