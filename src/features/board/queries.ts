import type { AppRole } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { sortBoardOrders } from "./board-state";

export type BoardStage = {
  id: string;
  code: string;
  name: string;
  position: number;
};

export type BoardOrder = {
  id: string;
  publicNumber: number;
  customerName: string;
  quantity: number;
  orderType: "set" | "individual";
  promisedDeliveryDate: string;
  currentStageId: string;
  updatedAt: string;
  hasDesignImage: boolean;
  imageUpdatedAt: string | null;
};

export type BoardColumn = BoardStage & {
  orders: BoardOrder[];
};

export type OrderBoard = {
  columns: BoardColumn[];
  role: AppRole;
};

const boardOrderSelect = "id, public_number, customer_name, quantity, order_type, promised_delivery_date, current_stage_id, updated_at, order_design_images (updated_at)";

function toBoardOrder(order: {
  id: string;
  public_number: number;
  customer_name: string;
  quantity: number;
  order_type: "set" | "individual";
  promised_delivery_date: string;
  current_stage_id: string;
  updated_at: string;
  order_design_images: { updated_at: string } | { updated_at: string }[] | null;
}): BoardOrder {
  const image = Array.isArray(order.order_design_images)
    ? order.order_design_images[0] ?? null
    : order.order_design_images;
  return {
    id: order.id,
    publicNumber: order.public_number,
    customerName: order.customer_name,
    quantity: order.quantity,
    orderType: order.order_type,
    promisedDeliveryDate: order.promised_delivery_date,
    currentStageId: order.current_stage_id,
    updatedAt: order.updated_at,
    hasDesignImage: image !== null,
    imageUpdatedAt: image?.updated_at ?? null,
  };
}

export function buildBoardColumns(stages: BoardStage[], orders: BoardOrder[]): BoardColumn[] {
  const columns = stages
    .toSorted((left, right) => left.position - right.position)
    .map((stage) => ({ ...stage, orders: [] as BoardOrder[] }));
  const columnsByStage = new Map(columns.map((column) => [column.id, column]));
  const orderIds = new Set<string>();

  for (const order of orders) {
    if (orderIds.has(order.id)) throw new Error("El tablero recibió un pedido duplicado.");
    orderIds.add(order.id);

    const column = columnsByStage.get(order.currentStageId);
    if (!column) throw new Error("El pedido pertenece a una etapa que no está disponible.");
    column.orders.push(order);
  }

  for (const column of columns) {
    column.orders = sortBoardOrders(column.orders);
  }

  return columns;
}

export async function getOrderBoard(role: AppRole): Promise<OrderBoard> {
  const supabase = await createClient();
  const [stagesResult, ordersResult] = await Promise.all([
    supabase.from("workflow_stages").select("id, code, name, position").eq("is_active", true).order("position"),
    supabase.from("orders").select(boardOrderSelect),
  ]);

  if (stagesResult.error || ordersResult.error) throw new Error("No se pudo cargar el tablero de pedidos.");

  const stages = stagesResult.data as BoardStage[];
  const orders = (ordersResult.data as Array<{
    id: string;
    public_number: number;
    customer_name: string;
    quantity: number;
    order_type: "set" | "individual";
    promised_delivery_date: string;
    current_stage_id: string;
    updated_at: string;
    order_design_images: { updated_at: string } | { updated_at: string }[] | null;
  }>).map(toBoardOrder);

  return { columns: buildBoardColumns(stages, orders), role };
}

export type OrderMovementSnapshot = Pick<BoardOrder, "currentStageId" | "updatedAt">;

export async function getOrderMovementSnapshot(orderId: string): Promise<OrderMovementSnapshot | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("current_stage_id, updated_at")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data) return null;
  return { currentStageId: data.current_stage_id, updatedAt: data.updated_at };
}
