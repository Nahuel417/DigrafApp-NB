import { createClient } from "@/lib/supabase/server";

export type ActiveOrderPayment = {
  id: string;
  amount: number;
  cashMovementId: string | null;
  confirmedAt: string;
  actorDisplayName: string;
};

export type PaymentReceiptSummary = {
  totalAmount: string | null;
  depositAmount: string | null;
  depositPaid: boolean | null;
  paidAmount: string;
  pendingAmount: string | null;
};

export function shouldShowPaymentReceipt(canOperate: boolean) {
  return canOperate;
}

function centsToMoney(cents: bigint) {
  return `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
}

export function getPaymentReceiptSummary(
  financials: { totalAmount: number; depositAmount: number; depositPaid: boolean } | null,
  payment: ActiveOrderPayment | null,
): PaymentReceiptSummary {
  const depositAmount = financials?.depositAmount.toFixed(2) ?? null;
  const paid = (payment?.amount ?? (financials?.depositPaid ? financials.depositAmount : 0)).toFixed(2);
  if (financials === null) return { totalAmount: null, depositAmount, depositPaid: null, paidAmount: paid, pendingAmount: null };

  const totalCents = BigInt(financials.totalAmount.toFixed(2).replace(".", ""));
  const paidCents = BigInt(paid.replace(".", ""));
  return {
    totalAmount: financials.totalAmount.toFixed(2),
    depositAmount,
    depositPaid: financials.depositPaid,
    paidAmount: paid,
    pendingAmount: centsToMoney(totalCents > paidCents ? totalCents - paidCents : BigInt(0)),
  };
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
