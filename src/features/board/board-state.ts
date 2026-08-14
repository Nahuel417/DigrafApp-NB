import type { BoardColumn, BoardOrder } from "./queries";

export function sortBoardOrders(orders: BoardOrder[]) {
  return orders.toSorted((left, right) => (
    left.promisedDeliveryDate.localeCompare(right.promisedDeliveryDate)
    || left.publicNumber - right.publicNumber
  ));
}

export function sortPaidBoardOrders(orders: BoardOrder[]) {
  return orders.toSorted((left, right) => (
    (right.paymentConfirmedAt ? Date.parse(right.paymentConfirmedAt) : Number.NEGATIVE_INFINITY)
      - (left.paymentConfirmedAt ? Date.parse(left.paymentConfirmedAt) : Number.NEGATIVE_INFINITY)
    || right.publicNumber - left.publicNumber
  ));
}

function sortOrdersForColumn(column: BoardColumn, orders: BoardOrder[]) {
  return column.code === "paid" ? sortPaidBoardOrders(orders) : sortBoardOrders(orders);
}

export function replaceBoardOrder(columns: BoardColumn[], replacement: BoardOrder): BoardColumn[] {
  if (!columns.some((column) => column.id === replacement.currentStageId)) return columns;

  return columns.map((column) => {
    const orders = column.orders.filter((order) => order.id !== replacement.id);
    if (column.id !== replacement.currentStageId) return { ...column, orders };
    return { ...column, orders: sortOrdersForColumn(column, [...orders, replacement]) };
  });
}

export function moveBoardOrder(
  columns: BoardColumn[],
  orderId: string,
  stageId: string,
  updatedAt?: string,
): BoardColumn[] {
  const movedOrder = columns.flatMap((column) => column.orders).find((order) => order.id === orderId);
  if (!movedOrder || movedOrder.currentStageId === stageId && !updatedAt) return columns;

  const destinationExists = columns.some((column) => column.id === stageId);
  if (!destinationExists) return columns;

  return columns.map((column) => {
    const ordersWithoutMoved = column.orders.filter((order) => order.id !== orderId);
    if (column.id !== stageId) return { ...column, orders: ordersWithoutMoved };

    return {
      ...column,
      orders: sortOrdersForColumn(column, [
        ...ordersWithoutMoved,
        {
          ...movedOrder,
          currentStageId: stageId,
          updatedAt: updatedAt ?? movedOrder.updatedAt,
        },
      ]),
    };
  });
}
