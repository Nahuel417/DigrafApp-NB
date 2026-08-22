import { describe, expect, it } from "vitest";

import { mapArchiveRows } from "./archive-queries";

describe("order archive query mapping", () => {
  it("maps a cancelled order with its historical stage and actor", () => {
    expect(mapArchiveRows(
      [{ id: "order-1", public_number: 12, customer_name: "Equipo Norte", current_stage_id: "stage-1", cancelled_at: "2026-08-14T12:00:00.000Z", cancelled_by: "profile-1", cancellation_reason: "Cliente pidió pausa", updated_at: "2026-08-14T12:00:00.000Z" }],
      [{ id: "stage-1", name: "Diseño" }],
      [{ id: "profile-1", display_name: "Admin" }],
    )).toEqual([{
      id: "order-1",
      publicNumber: 12,
      customerName: "Equipo Norte",
      currentStageName: "Diseño",
      cancelledAt: "2026-08-14T12:00:00.000Z",
      cancelledByDisplayName: "Admin",
      cancellationReason: "Cliente pidió pausa",
      updatedAt: "2026-08-14T12:00:00.000Z",
    }]);
  });

  it("keeps historical orders readable when their stage or actor is no longer available", () => {
    expect(mapArchiveRows(
      [{ id: "order-2", public_number: 13, customer_name: "Equipo Sur", current_stage_id: "retired-stage", cancelled_at: "2026-08-13T12:00:00.000Z", cancelled_by: "deleted-profile", cancellation_reason: "Sin confirmación", updated_at: "2026-08-13T12:00:00.000Z" }],
      [],
      [],
    )[0]).toMatchObject({ currentStageName: "Etapa no disponible", cancelledByDisplayName: "Perfil no disponible" });
  });
});
