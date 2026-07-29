import type { BoardColumn, BoardOrder } from "./queries";

export function sortBoardOrders(orders: BoardOrder[]) {
  return orders.toSorted((left, right) => (
    left.promisedDeliveryDate.localeCompare(right.promisedDeliveryDate)
    || left.publicNumber - right.publicNumber
  ));
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
      orders: sortBoardOrders([
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
