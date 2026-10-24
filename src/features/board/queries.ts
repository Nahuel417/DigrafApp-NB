import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

import { sortBoardOrders, sortPaidBoardOrders } from "./board-state";
import type { OrderLabel } from "./schemas";

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
  label: OrderLabel | null;
  productName?: string | null;
  specialProductTypes?: ("bag" | "flag")[];
  promisedDeliveryDate: string;
  currentStageId: string;
  updatedAt: string;
  primaryDesignImage: { updatedAt: string } | null;
  totalAmount: number | null;
  paymentConfirmedAt: string | null;
};

export type BoardColumn = BoardStage & {
  orders: BoardOrder[];
};

export type OrderBoard = {
  columns: BoardColumn[];
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

type BoardRpcRow = Database["public"]["Functions"]["get_order_board"]["Returns"][number];

function mapBoardRpcRow(order: BoardRpcRow, specialProductTypes: ("bag" | "flag")[] = []): BoardOrder {
  return {
    id: order.id,
    publicNumber: order.public_number,
    customerName: order.customer_name,
    teamName: order.team_name,
    quantity: order.quantity,
    label: order.label,
    productName: order.product_name,
    specialProductTypes,
    promisedDeliveryDate: order.promised_delivery_date,
    currentStageId: order.current_stage_id,
    updatedAt: order.updated_at,
    primaryDesignImage: order.image_updated_at ? { updatedAt: order.image_updated_at } : null,
    totalAmount: order.total_amount,
    paymentConfirmedAt: order.payment_confirmed_at,
  };
}

async function getSpecialProductTypes(supabase: Awaited<ReturnType<typeof createClient>>, orderIds: string[]) {
  const types = new Map<string, ("bag" | "flag")[]>();
  if (!orderIds.length) return types;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("order_lines").select("order_id, line_type")
      .in("order_id", orderIds).order("id").range(offset, offset + 999);
    if (error) throw new Error("No se pudieron cargar los tipos de producto del tablero.");
    for (const line of data ?? []) {
      if (line.line_type !== "bag" && line.line_type !== "flag") continue;
      const existing = types.get(line.order_id) ?? [];
      if (!existing.includes(line.line_type)) types.set(line.order_id, [...existing, line.line_type].sort());
    }
    if (!data || data.length < 1000) return types;
  }
}

export async function getOrderBoard(search = ""): Promise<OrderBoard> {
  const supabase = await createClient();
  const [stagesResult, ordersResult] = await Promise.all([
    supabase.from("workflow_stages").select("id, code, name, position").eq("is_active", true).order("position"),
    supabase.rpc("get_order_board", { p_search: search }),
  ]);

  if (stagesResult.error || ordersResult.error) throw new Error("No se pudo cargar el tablero de pedidos.");

  const stages = stagesResult.data as BoardStage[];
  const boardRows: BoardRpcRow[] = ordersResult.data;
  const types = await getSpecialProductTypes(supabase, boardRows.map((order) => order.id));
  const orders = boardRows.map((order) => mapBoardRpcRow(order, types.get(order.id)));

  return { columns: buildBoardColumns(stages, orders) };
}

export async function getOrderBoardSnapshot(orderId: string): Promise<BoardOrder | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_order_board_snapshot", { p_order_id: orderId });
  if (error) throw new Error("No se pudo cargar el pedido del tablero.");
  const order = data[0];
  if (!order) return null;
  const types = await getSpecialProductTypes(supabase, [order.id]);
  return mapBoardRpcRow(order, types.get(order.id));
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
  if (data.current_stage_id === null) return null;
  return { currentStageId: data.current_stage_id, updatedAt: data.updated_at };
}
