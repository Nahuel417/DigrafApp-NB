import type { AppRole } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { sortBoardOrders, sortPaidBoardOrders } from "./board-state";

export type BoardStage = {
  id: string;
  code: string;
  name: string;
  position: number;
};

export type BoardOrder = {
  id: string;
  publicNumber: number;
  customerName: string | null;
  teamName: string | null;
  quantity: number;
  orderType: "set" | "individual" | null;
  promisedDeliveryDate: string;
  currentStageId: string;
  updatedAt: string;
  primaryDesignImage: { id: string; updatedAt: string } | null;
  totalAmount: number | null;
  paymentConfirmedAt: string | null;
};

export type BoardColumn = BoardStage & {
  orders: BoardOrder[];
};

export type OrderBoard = {
  columns: BoardColumn[];
  role: AppRole;
};

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
    column.orders = column.code === "paid" ? sortPaidBoardOrders(column.orders) : sortBoardOrders(column.orders);
  }

  return columns;
}

type BoardRpcRow = {
  id: string; public_number: number; customer_name: string; team_name: string | null; quantity: number; order_type: "set" | "individual" | null;
  promised_delivery_date: string; current_stage_id: string; updated_at: string; has_design_image: boolean; image_updated_at: string | null;
  total_amount: number | null; payment_confirmed_at: string | null;
};

export async function getOrderBoard(role: AppRole, search = ""): Promise<OrderBoard> {
  const supabase = await createClient();
  const [stagesResult, ordersResult] = await Promise.all([
    supabase.from("workflow_stages").select("id, code, name, position").eq("is_active", true).order("position"),
    supabase.rpc("get_order_board", { p_search: search } as never),
  ]);

  if (stagesResult.error || ordersResult.error) throw new Error("No se pudo cargar el tablero de pedidos.");

  const stages = stagesResult.data as BoardStage[];
  const boardRows = ordersResult.data as unknown as BoardRpcRow[];
  const primaryImages = boardRows.length
    ? await supabase.from("order_design_images").select("order_id, id, updated_at").eq("is_primary", true).in("order_id", boardRows.map((order) => order.id))
    : { data: [], error: null };
  if (primaryImages.error) throw new Error("No se pudo cargar la imagen primaria de los pedidos.");
  const primaryByOrderId = new Map((primaryImages.data ?? []).map((image) => [image.order_id, { id: image.id, updatedAt: image.updated_at }]));

  const orders = boardRows.map((order) => {
    const primaryDesignImage = primaryByOrderId.get(order.id) ?? null;
    return {
    id: order.id,
    publicNumber: order.public_number,
    customerName: order.customer_name,
    teamName: order.team_name,
    quantity: order.quantity,
    orderType: order.order_type,
    promisedDeliveryDate: order.promised_delivery_date,
    currentStageId: order.current_stage_id,
    updatedAt: order.updated_at,
    primaryDesignImage,
    totalAmount: order.total_amount,
    paymentConfirmedAt: order.payment_confirmed_at,
    };
  });

  return { columns: buildBoardColumns(stages, orders), role };
}

export async function getOrderBoardSnapshot(orderId: string, role: AppRole): Promise<BoardOrder | null> {
  const board = await getOrderBoard(role);
  return board.columns.flatMap((column) => column.orders).find((order) => order.id === orderId) ?? null;
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
