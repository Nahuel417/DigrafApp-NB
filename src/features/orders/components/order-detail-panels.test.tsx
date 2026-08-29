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

  it("renders a payment reversal without exposing restricted details through the label", () => {
    render(<Timeline events={[{
      id: "reversal-event",
      type: "payment_reversed",
      actor: "Admin",
      occurredAt: "2026-08-12T19:02:00.000Z",
      body: null,
      changeNote: null,
      details: { version: 1, payment_reversed: true },
    }]} />);

    expect(screen.getByText("Pago revertido")).toBeTruthy();
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(screen.queryByText(/100/)).toBeNull();
  });

  it("shows the four latest events and collapses older events", () => {
    render(<Timeline events={Array.from({ length: 5 }, (_, index) => ({
      id: `event-${index}`,
      type: "stage_moved",
      actor: "Admin",
      occurredAt: `2026-08-${String(20 - index).padStart(2, "0")}T19:02:00.000Z`,
      body: null,
      changeNote: null,
      fromStageName: "Diseño",
      toStageName: `Etapa ${index + 1}`,
      details: {},
    }))} />);

    expect(Array.from(document.querySelectorAll("ol")).some((list) => list.querySelectorAll("li").length === 4)).toBe(true);
    expect(screen.getByText("Ver 1 movimientos anteriores").closest("details")?.hasAttribute("open")).toBe(false);
  });
});
