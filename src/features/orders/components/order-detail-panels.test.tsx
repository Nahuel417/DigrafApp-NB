// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Timeline } from "./order-detail-panels";

describe("order payment timeline", () => {
  it("renders the payment confirmation with the server actor and time", () => {
    render(<Timeline events={[{
      id: "payment-event",
      type: "payment_confirmed",
      actor: "Atención",
      occurredAt: "2026-08-12T19:01:00.000Z",
      body: null,
      changeNote: null,
      details: { amount: 125.5 },
    }]} />);

    expect(screen.getByText("Pago confirmado")).toBeTruthy();
    expect(screen.getByText("Atención")).toBeTruthy();
    expect(screen.getByText(/12\/8\/26/)).toBeTruthy();
  });
});
