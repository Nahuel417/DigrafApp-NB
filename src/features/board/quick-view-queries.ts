import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type TimelineEvent = Database["public"]["Functions"]["get_order_timeline"]["Returns"][number];
type QuickViewMovement = Omit<Pick<TimelineEvent, "event_id" | "actor_display_name" | "occurred_at" | "from_stage_id" | "to_stage_id">, "from_stage_id" | "to_stage_id"> & {
  from_stage_id: string | null;
  to_stage_id: string | null;
};
type QuickViewComment = Omit<Pick<TimelineEvent, "event_id" | "actor_display_name" | "occurred_at" | "comment_body">, "comment_body"> & {
  comment_body: string | null;
};

export type OrderQuickViewData = {
  order: {
    id: string;
    publicNumber: number;
    customerName: string | null;
    teamName: string | null;
    quantity: number;
    orderType: Database["public"]["Enums"]["order_type"] | null;
    promisedDeliveryDate: string;
    description: string | null;
    currentStage: { code: string; name: string };
    updatedAt: string;
  };
  lastMovement: QuickViewMovement | null;
  latestComment: QuickViewComment | null;
  paymentId: string | null;
};

export async function getOrderQuickViewData(orderId: string, canReadPaymentDetails: boolean): Promise<OrderQuickViewData | null> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("orders")
    .select("id, public_number, customer_name, client_name, team_name, quantity, order_type, promised_delivery_date, description, updated_at, workflow_stages!inner (id, code, name)")
    .eq("id", orderId)
    .in("lifecycle_state", ["active", "cancelled", "archived_delivered"])
    .maybeSingle();

  if (error || !row || row.quantity === null || row.promised_delivery_date === null) return null;
  const stage = Array.isArray(row.workflow_stages) ? row.workflow_stages[0] : row.workflow_stages;
  if (!stage) return null;

  const [{ data: movementRows, error: movementError }, { data: commentRows, error: commentError }] = await Promise.all([
    supabase.rpc("get_order_timeline", { p_order_id: orderId })
      .select("event_id,event_type,actor_display_name,occurred_at,from_stage_id,to_stage_id")
      .eq("event_type", "stage_moved")
      .order("occurred_at", { ascending: false })
      .order("event_id", { ascending: true })
      .limit(1),
    supabase.rpc("get_order_timeline", { p_order_id: orderId })
      .select("event_id,event_type,actor_display_name,occurred_at,comment_body")
      .eq("event_type", "commented")
      .neq("comment_body", "")
      .order("occurred_at", { ascending: false })
      .order("event_id", { ascending: true })
      .limit(1),
  ]);

  let paymentId: string | null = null;
  if (!movementError && !commentError && canReadPaymentDetails && stage.code === "paid") {
    const { data: paymentRows, error: paymentError } = await supabase.rpc("get_order_timeline", { p_order_id: orderId })
      .select("event_id,occurred_at,id:details->>id")
      .eq("event_type", "payment_confirmed")
      .order("occurred_at", { ascending: false })
      .order("event_id", { ascending: true })
      .limit(1);
    const id = paymentError ? null : paymentRows?.[0]?.id;
    if (typeof id === "string") paymentId = id;
  }

  return {
    order: {
      id: row.id,
      publicNumber: row.public_number,
      customerName: row.client_name?.trim() ? row.client_name : row.customer_name,
      teamName: row.team_name,
      quantity: row.quantity,
      orderType: row.order_type,
      promisedDeliveryDate: row.promised_delivery_date,
      description: row.description,
      currentStage: { code: stage.code, name: stage.name },
      updatedAt: row.updated_at,
    },
    lastMovement: movementError ? null : movementRows?.[0] ?? null,
    latestComment: commentError ? null : commentRows?.[0] ?? null,
    paymentId,
  };
}
