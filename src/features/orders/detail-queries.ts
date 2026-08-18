import { createClient } from "@/lib/supabase/server";
import { getOrderFormCatalogs, type OrderFormCatalogs } from "./queries";

import type { Database } from "@/lib/supabase/database.types";

export type OrderDetail = {
  id: string;
  publicNumber: number;
  customerName: string | null;
  clientName: string | null;
  teamName: string | null;
  phone: string | null;
  quantity: number;
  orderType: Database["public"]["Enums"]["order_type"] | null;
  orderDate: string;
  promisedDeliveryDate: string;
  description: string | null;
  currentStage: { id: string; code: string; name: string };
  createdAt: string;
  updatedAt: string;
  lines: OrderDetailLine[];
};

export type OrderDetailLine = {
  id: string;
  position: number;
  lineType: Database["public"]["Enums"]["order_line_type"];
  productId: string | null;
  productName: string;
  quantity: number;
  color: string | null;
  configurationSnapshot: Record<string, unknown>;
  shieldNames: string[];
  shieldProductIds: string[];
};

export type OrderFinancials = {
  totalAmount: number;
  depositAmount: number;
  depositPaid: boolean;
};

export type OrderSelection = {
  id: string;
  selectionKey: string;
  catalogKind: Database["public"]["Enums"]["catalog_item_kind"];
  garmentLayer: Database["public"]["Enums"]["garment_layer"] | null;
  itemName: string;
  catalogItemId: string | null;
};

export type OrderDetailCatalogs = OrderFormCatalogs;

export type OrderDetailData = {
  order: OrderDetail;
  financials: OrderFinancials | null;
  selections: OrderSelection[];
  catalogs: OrderDetailCatalogs;
};

export async function getOrderDetail(orderId: string): Promise<OrderDetailData | null> {
  const supabase = await createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, public_number, customer_name, client_name, team_name, phone, quantity, order_type, order_date, promised_delivery_date, description, current_stage_id, updated_at, created_at, workflow_stages (id, code, name)")
    .eq("id", orderId)
    .single();

  if (orderError || !order) return null;

  const stage = Array.isArray(order.workflow_stages) ? order.workflow_stages[0] : order.workflow_stages;

  const [{ data: financials }, { data: selections }, { data: lines }, formCatalogs] = await Promise.all([
    supabase.from("order_financials").select("total_amount, deposit_amount, deposit_paid").eq("order_id", orderId).single(),
    supabase.from("order_catalog_items").select("id, selection_key, catalog_kind, garment_layer, item_name, catalog_item_id").eq("order_id", orderId),
    supabase.from("order_lines").select("id, position, line_type, product_id, product_name_snapshot, quantity, color, configuration, order_line_shields(shield_product_id, shield_name_snapshot)").eq("order_id", orderId).order("position"),
    getOrderFormCatalogs(),
  ]);
  const catalogs: OrderDetailCatalogs = formCatalogs ?? { garments: [], flags: [], bags: [], shields: [], necklines: [], upperPatterns: [], lowerPatterns: [], fabrics: [], extras: [] };

  return {
    order: {
      id: order.id,
      publicNumber: order.public_number,
      customerName: order.customer_name,
      clientName: order.client_name,
      teamName: order.team_name,
      phone: order.phone,
      quantity: order.quantity,
      orderType: order.order_type,
      orderDate: order.order_date,
      promisedDeliveryDate: order.promised_delivery_date,
      description: order.description,
      currentStage: { id: stage.id, code: stage.code, name: stage.name },
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      lines: (lines ?? []).map((line) => ({
        id: line.id,
        position: line.position,
        lineType: line.line_type,
        productId: line.product_id,
        quantity: line.quantity,
        color: line.color,
        productName: line.product_name_snapshot,
        configurationSnapshot: line.configuration as unknown as Record<string, unknown>,
        shieldNames: (Array.isArray(line.order_line_shields) ? line.order_line_shields : []).map((shield) => shield.shield_name_snapshot),
        shieldProductIds: (Array.isArray(line.order_line_shields) ? line.order_line_shields : []).flatMap((shield) => shield.shield_product_id ? [shield.shield_product_id] : []),
      })),
    },
    financials: financials
      ? { totalAmount: financials.total_amount, depositAmount: financials.deposit_amount, depositPaid: financials.deposit_paid }
      : null,
    selections: (selections ?? []).map((item) => ({
      id: item.id,
      selectionKey: item.selection_key,
      catalogKind: item.catalog_kind,
      garmentLayer: item.garment_layer,
      itemName: item.item_name,
      catalogItemId: item.catalog_item_id,
    })),
    catalogs,
  };
}

export type TimelineEvent = {
  id: string;
  type: string;
  actorDisplayName: string;
  occurredAt: string;
  details: Record<string, unknown>;
  commentBody: string | null;
  changeNote: string | null;
  fromStageId: string | null;
  fromStageName: string | null;
  toStageId: string | null;
  toStageName: string | null;
};

export async function getOrderTimeline(orderId: string): Promise<TimelineEvent[]> {
  const supabase = await createClient();
  const [{ data, error }, { data: snapshots, error: snapshotError }] = await Promise.all([
    supabase.rpc("get_order_timeline", { p_order_id: orderId }),
    supabase
      .from("order_stage_events")
      .select("id, from_stage_name, to_stage_name")
      .eq("order_id", orderId),
  ]);
  if (error || snapshotError || !data) return [];

  const snapshotsByEventId = new Map(
    (snapshots ?? []).map((event) => [event.id, {
      fromStageName: event.from_stage_name,
      toStageName: event.to_stage_name,
    }]),
  );

  return data.map((event) => ({
    id: event.event_id,
    type: event.event_type,
    actorDisplayName: event.actor_display_name,
    occurredAt: event.occurred_at,
    details: event.details as Record<string, unknown>,
    commentBody: event.comment_body,
    changeNote: event.change_note,
    fromStageId: event.from_stage_id,
    fromStageName: snapshotsByEventId.get(event.event_id)?.fromStageName ?? null,
    toStageId: event.to_stage_id,
    toStageName: snapshotsByEventId.get(event.event_id)?.toStageName ?? null,
  }));
}

export async function getStageNames(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("workflow_stages").select("id, name");
  if (error || !data) return {};
  return Object.fromEntries(data.map((stage) => [stage.id, stage.name]));
}

export function getOrderFinancialsForEdit(financials: OrderFinancials | null): { totalAmount: string; depositAmount: string; depositPaid: boolean } {
  if (!financials) return { totalAmount: "", depositAmount: "", depositPaid: false };
  return {
    totalAmount: financials.totalAmount.toFixed(2),
    depositAmount: financials.depositAmount.toFixed(2),
    depositPaid: financials.depositPaid,
  };
}
