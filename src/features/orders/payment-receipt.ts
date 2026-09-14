import { createClient } from "@/lib/supabase/server";

export type ActiveOrderPayment = {
  id: string;
  amount: number;
  cashMovementId: string | null;
  confirmedAt: string;
  actorDisplayName: string;
};

export function shouldShowPaymentReceipt(
  stageCode: string,
  payment: ActiveOrderPayment | null,
  canOperate: boolean,
) {
  return canOperate && payment !== null && (stageCode === "paid" || stageCode === "delivered");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function getActiveOrderPayment(orderId: string): Promise<ActiveOrderPayment | null> {
  const supabase = await createClient();
  const [{ data: payment, error }, { data: timeline, error: timelineError }] = await Promise.all([
    supabase
      .from("order_payments")
      .select("id, amount, cash_movement_id, actor_id, confirmed_at, reversed_at")
      .eq("order_id", orderId)
      .is("reversed_at", null)
      .maybeSingle(),
    supabase.rpc("get_order_timeline", { p_order_id: orderId }),
  ]);

  if (error || timelineError || !payment) return null;

  const paymentEvent = timeline?.find((event) => {
    if (event.event_type !== "payment_confirmed" || !isRecord(event.details)) return false;
    return event.details.id === payment.id;
  });

  if (!paymentEvent?.actor_display_name) return null;

  return {
    id: payment.id,
    amount: payment.amount,
    cashMovementId: payment.cash_movement_id,
    confirmedAt: payment.confirmed_at,
    actorDisplayName: paymentEvent.actor_display_name,
  };
}
