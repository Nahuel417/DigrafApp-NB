import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOrderQuickViewData } from "./quick-view-queries";

const client = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));

const orderRow = {
  id: "11111111-1111-4111-8111-111111111111",
  public_number: 7,
  customer_name: "Historic customer",
  client_name: "Current client",
  team_name: "Team",
  quantity: 2,
  order_type: "individual",
  promised_delivery_date: "2026-08-13",
  description: "Description",
  updated_at: "2026-08-12T19:01:00.000Z",
  workflow_stages: { code: "paid", name: "Paid" },
};

function orderBuilder<T>(data: T | null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  client.from.mockReturnValue(builder);
  return builder;
}

function timelineBuilder(rows: unknown[]) {
  const filters: Array<[string, unknown]> = [];
  const orders: Array<[string, { ascending: boolean }]> = [];
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => { filters.push([column, value]); return builder; }),
    neq: vi.fn((column: string, value: unknown) => { filters.push([column, value]); return builder; }),
    order: vi.fn((column: string, options: { ascending: boolean }) => { orders.push([column, options]); return builder; }),
    limit: vi.fn(async () => ({ data: rows, error: null })),
  };
  return { builder, filters, orders };
}

describe("order quick-view queries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("selects a minimal RLS-filtered order and only the newest needed event per category", async () => {
    const order = orderBuilder(orderRow);
    const movement = timelineBuilder([{
      event_id: "movement-event",
      event_type: "stage_moved",
      actor_display_name: "Operator",
      occurred_at: "2026-08-12T19:00:00.000Z",
      from_stage_id: "from-stage",
      to_stage_id: "to-stage",
    }]);
    const comment = timelineBuilder([{
      event_id: "comment-event",
      event_type: "commented",
      actor_display_name: "Operator",
      occurred_at: "2026-08-12T18:00:00.000Z",
      comment_body: "Recent comment",
    }]);
    const payment = timelineBuilder([{ id: "payment-id" }]);
    client.rpc
      .mockReturnValueOnce(movement.builder)
      .mockReturnValueOnce(comment.builder)
      .mockReturnValueOnce(payment.builder);

    const result = await getOrderQuickViewData(orderRow.id, true);

    expect(result).toMatchObject({
      order: {
        customerName: "Current client",
        teamName: "Team",
        currentStage: { code: "paid", name: "Paid" },
      },
      lastMovement: { event_id: "movement-event", from_stage_id: "from-stage", to_stage_id: "to-stage" },
      latestComment: { event_id: "comment-event", comment_body: "Recent comment" },
      paymentId: "payment-id",
    });
    expect(order.select).toHaveBeenCalledWith("id, public_number, customer_name, client_name, team_name, quantity, order_type, promised_delivery_date, description, updated_at, workflow_stages!inner (id, code, name)");
    expect(order.eq).toHaveBeenCalledWith("id", orderRow.id);
    expect(order.in).toHaveBeenCalledWith("lifecycle_state", ["active", "cancelled", "archived_delivered"]);
    expect(order.maybeSingle).toHaveBeenCalledOnce();
    expect(client.rpc).toHaveBeenCalledTimes(3);
    expect(movement.filters).toContainEqual(["event_type", "stage_moved"]);
    expect(comment.filters).toContainEqual(["event_type", "commented"]);
    expect(comment.filters).toContainEqual(["comment_body", ""]);
    for (const query of [movement, comment, payment]) {
      expect(query.orders).toEqual([["occurred_at", { ascending: false }], ["event_id", { ascending: true }]]);
      expect(query.builder.limit).toHaveBeenCalledWith(1);
    }
    expect(movement.builder.select).toHaveBeenCalledWith("event_id,event_type,actor_display_name,occurred_at,from_stage_id,to_stage_id");
    expect(comment.builder.select).toHaveBeenCalledWith("event_id,event_type,actor_display_name,occurred_at,comment_body");
    expect(payment.builder.select).toHaveBeenCalledWith("id:details->>id");
  });

  it.each([
    [true, "received", "Received"],
    [false, "paid", "Paid"],
  ] as const)("uses historic customer names and skips payment events for permission=%s, stage=%s", async (canReadPaymentDetails, stageCode, stageName) => {
    const historicOrder = { ...orderRow, client_name: "   ", workflow_stages: { code: stageCode, name: stageName } };
    const order = orderBuilder(historicOrder);
    const movement = timelineBuilder([]);
    const comment = timelineBuilder([]);
    client.rpc.mockReturnValueOnce(movement.builder).mockReturnValueOnce(comment.builder);

    const result = await getOrderQuickViewData(orderRow.id, canReadPaymentDetails);

    expect(result?.order.customerName).toBe("Historic customer");
    expect(result?.lastMovement).toBeNull();
    expect(result?.latestComment).toBeNull();
    expect(result?.paymentId).toBeNull();
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });

  it("returns no order when row-level visibility or lifecycle state excludes it", async () => {
    orderBuilder(null);

    expect(await getOrderQuickViewData(orderRow.id, true)).toBeNull();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
