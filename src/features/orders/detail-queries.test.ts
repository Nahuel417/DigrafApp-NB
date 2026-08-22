import { describe, expect, it } from "vitest";

import { mapOrderDetailRow } from "./detail-queries";

describe("order detail lifecycle mapping", () => {
  it("keeps cancellation metadata and the previous operational stage", () => {
    expect(mapOrderDetailRow({
      id: "order-1",
      public_number: 4,
      customer_name: "Equipo Centro",
      quantity: 3,
      order_type: "individual",
      order_date: "2026-08-14",
      promised_delivery_date: "2026-08-20",
      description: null,
      current_stage_id: "stage-1",
      lifecycle_state: "cancelled",
      cancelled_at: "2026-08-14T12:00:00.000Z",
      cancelled_by: "profile-1",
      cancellation_reason: "Cliente pidió pausa",
      updated_at: "2026-08-14T12:00:00.000Z",
      created_at: "2026-08-14T10:00:00.000Z",
    }, { id: "stage-1", code: "design", name: "Diseño" })).toMatchObject({
      id: "order-1",
      lifecycleState: "cancelled",
      cancelledAt: "2026-08-14T12:00:00.000Z",
      cancelledBy: "profile-1",
      cancellationReason: "Cliente pidió pausa",
      currentStage: { id: "stage-1", code: "design", name: "Diseño" },
    });
  });

  it("maps active orders without cancellation metadata", () => {
    const result = mapOrderDetailRow({
      id: "order-2",
      public_number: 5,
      customer_name: "Equipo Sur",
      quantity: 1,
      order_type: "set",
      order_date: "2026-08-14",
      promised_delivery_date: "2026-08-20",
      description: "Detalle",
      current_stage_id: "stage-1",
      lifecycle_state: "active",
      cancelled_at: null,
      cancelled_by: null,
      cancellation_reason: null,
      updated_at: "2026-08-14T12:00:00.000Z",
      created_at: "2026-08-14T10:00:00.000Z",
    }, { id: "stage-1", code: "design", name: "Diseño" });
    expect(result).toMatchObject({ lifecycleState: "active", cancelledAt: null, cancellationReason: null });
  });
});
