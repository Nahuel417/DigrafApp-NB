import { createClient } from "@/lib/supabase/server";

import type { Database } from "@/lib/supabase/database.types";

export type OrderDetail = {
  id: string;
  publicNumber: number;
  customerName: string;
  quantity: number;
  orderType: Database["public"]["Enums"]["order_type"];
  orderDate: string;
  promisedDeliveryDate: string;
  description: string | null;
  currentStage: { id: string; code: string; name: string };
  createdAt: string;
  updatedAt: string;
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

export type OrderDetailCatalogs = {
  garments: Array<{ id: string; garmentLayer: Database["public"]["Enums"]["garment_layer"]; name: string }>;
  necklines: Array<{ id: string; name: string }>;
  upperPatterns: Array<{ id: string; name: string }>;
  lowerPatterns: Array<{ id: string; name: string }>;
  fabrics: Array<{ id: string; name: string }>;
  extras: Array<{ id: string; name: string }>;
};

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
    .select("id, public_number, customer_name, quantity, order_type, order_date, promised_delivery_date, description, current_stage_id, updated_at, created_at, workflow_stages (id, code, name)")
    .eq("id", orderId)
    .single();

  if (orderError || !order) return null;

  const stage = Array.isArray(order.workflow_stages) ? order.workflow_stages[0] : order.workflow_stages;

  const [{ data: financials }, { data: selections }, { data: catalogItems }] = await Promise.all([
    supabase.from("order_financials").select("total_amount, deposit_amount, deposit_paid").eq("order_id", orderId).single(),
    supabase.from("order_catalog_items").select("id, selection_key, catalog_kind, garment_layer, item_name, catalog_item_id").eq("order_id", orderId),
    supabase.from("catalog_items").select("id, kind, garment_layer, name").eq("is_active", true),
  ]);

  const catalogItemsData = catalogItems ?? [];
  const catalogs: OrderDetailCatalogs = {
    garments: catalogItemsData.filter((item) => item.kind === "garment").map((item) => ({ id: item.id, garmentLayer: item.garment_layer!, name: item.name })),
    necklines: catalogItemsData.filter((item) => item.kind === "neckline").map((item) => ({ id: item.id, name: item.name })),
    upperPatterns: catalogItemsData.filter((item) => item.kind === "upper_pattern").map((item) => ({ id: item.id, name: item.name })),
    lowerPatterns: catalogItemsData.filter((item) => item.kind === "lower_pattern").map((item) => ({ id: item.id, name: item.name })),
    fabrics: catalogItemsData.filter((item) => item.kind === "fabric").map((item) => ({ id: item.id, name: item.name })),
    extras: catalogItemsData.filter((item) => item.kind === "extra").map((item) => ({ id: item.id, name: item.name })),
  };

  return {
    order: {
      id: order.id,
      publicNumber: order.public_number,
      customerName: order.customer_name,
      quantity: order.quantity,
      orderType: order.order_type,
      orderDate: order.order_date,
      promisedDeliveryDate: order.promised_delivery_date,
      description: order.description,
      currentStage: { id: stage.id, code: stage.code, name: stage.name },
      createdAt: order.created_at,
      updatedAt: order.updated_at,
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
  fromStageId: string | null;
  toStageId: string | null;
};

export async function getOrderTimeline(orderId: string): Promise<TimelineEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_order_timeline", { p_order_id: orderId });
  if (error || !data) return [];

  return data.map((event) => ({
    id: event.event_id,
    type: event.event_type,
    actorDisplayName: event.actor_display_name,
    occurredAt: event.occurred_at,
    details: event.details as Record<string, unknown>,
    commentBody: event.comment_body,
    fromStageId: event.from_stage_id,
    toStageId: event.to_stage_id,
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
