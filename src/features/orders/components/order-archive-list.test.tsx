// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderArchiveList } from "./order-archive-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/hooks/use-mutation-toast", () => ({ useMutationToast: vi.fn() }));

describe("order archive list", () => {
  it("shows historical reason, stage, actor and restore action", () => {
    render(<OrderArchiveList orders={[{
      id: "order-1",
      publicNumber: 12,
      customerName: "Equipo Norte",
      currentStageName: "Diseño",
      cancelledAt: "2026-08-14T12:00:00.000Z",
      cancelledByDisplayName: "Admin",
      cancellationReason: "Cliente pidió pausa",
      updatedAt: "2026-08-14T12:00:00.000Z",
    }]} />);

    expect(screen.getByRole("heading", { name: "Pedidos anulados" })).toBeTruthy();
    expect(screen.getByText("Cliente pidió pausa")).toBeTruthy();
    expect(screen.getByText("Diseño")).toBeTruthy();
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(screen.getByRole("link", { name: /PED-000012/ }).getAttribute("href")).toBe("/orders/order-1");
    expect(screen.getByRole("button", { name: "Restaurar pedido" })).toBeTruthy();
  });

  it("explains when the archive is empty", () => {
    render(<OrderArchiveList orders={[]} />);
    expect(screen.getByText("No hay pedidos anulados en el Archivo.")).toBeTruthy();
  });
});
