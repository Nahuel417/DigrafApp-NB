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
  const destination = columns.find((column) => column.id === replacement.currentStageId);
  if (!destination) return columns;
  const sourceIndex = columns.findIndex((column) => column.orders.some((order) => order.id === replacement.id));
  if (sourceIndex === -1) return columns;
  const destinationIndex = columns.indexOf(destination);

  if (sourceIndex === destinationIndex) {
    return columns.map((column, index) => index === destinationIndex
      ? { ...column, orders: sortOrdersForColumn(column, [...column.orders.filter((order) => order.id !== replacement.id), replacement]) }
      : column);
  }

  return columns.map((column, index) => {
    if (index === sourceIndex) return { ...column, orders: column.orders.filter((order) => order.id !== replacement.id) };
    if (index === destinationIndex) return { ...column, orders: sortOrdersForColumn(column, [...column.orders, replacement]) };
    return column;
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

  const sourceIndex = columns.findIndex((column) => column.orders.some((order) => order.id === orderId));
  const destinationIndex = columns.findIndex((column) => column.id === stageId);
  const nextOrder = { ...movedOrder, currentStageId: stageId, updatedAt: updatedAt ?? movedOrder.updatedAt };

  return columns.map((column, index) => {
    if (index === sourceIndex && index === destinationIndex) {
      return { ...column, orders: sortOrdersForColumn(column, [...column.orders.filter((order) => order.id !== orderId), nextOrder]) };
    }
    if (index === sourceIndex) return { ...column, orders: column.orders.filter((order) => order.id !== orderId) };
    if (index === destinationIndex) return { ...column, orders: sortOrdersForColumn(column, [...column.orders, nextOrder]) };
    return column;
  });
}
