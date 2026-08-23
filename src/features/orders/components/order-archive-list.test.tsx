// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeliveredArchiveList, OrderArchiveList } from "./order-archive-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/hooks/use-mutation-toast", () => ({ useMutationToast: vi.fn() }));

afterEach(cleanup);

const baseOrder = {
  id: "order-1",
  publicNumber: 12,
  customerName: "Equipo Norte",
  currentStageName: "Diseño",
  cancelledAt: "2026-08-14T12:00:00.000Z",
  cancelledByDisplayName: "Admin",
  cancellationReason: "Cliente pidió pausa",
  updatedAt: "2026-08-14T12:00:00.000Z",
};

const baseDelivered = {
  id: "order-3",
  publicNumber: 14,
  customerName: "Club Oeste",
  teamName: "Primera",
  quantity: 12,
  currentStageName: "Entregado",
  orderDate: "2026-08-01",
  promisedDeliveryDate: "2026-08-10",
  updatedAt: "2026-08-10T12:00:00.000Z",
};

describe("order archive list", () => {
  it("shows historical reason, stage, actor and restore action", () => {
    render(
      <OrderArchiveList
        basePath="/orders/archive"
        orders={[baseOrder]}
        page={1}
        pageSize={10}
        total={1}
        totalPages={1}
      />,
    );

    expect(screen.getByRole("heading", { name: "Pedidos anulados" })).toBeTruthy();
    expect(screen.getByText("Cliente pidió pausa")).toBeTruthy();
    expect(screen.getByText("Diseño")).toBeTruthy();
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(screen.getByRole("link", { name: /PED-000012/ }).getAttribute("href")).toBe("/orders/order-1");
    expect(screen.getByRole("button", { name: "Restaurar pedido" })).toBeTruthy();
  });

  it("explains when the archive is empty", () => {
    render(<OrderArchiveList basePath="/orders/archive" orders={[]} page={1} pageSize={10} total={0} totalPages={1} />);
    expect(screen.getByText("No hay pedidos anulados en el Archivo.")).toBeTruthy();
  });

  it("hides pagination when a single page covers the total", () => {
    render(<OrderArchiveList basePath="/orders/archive" orders={[baseOrder]} page={1} pageSize={10} total={1} totalPages={1} />);

    expect(screen.queryByText(/Página/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Anterior/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Siguiente/ })).toBeNull();
  });

  it("renders the indicator and canonical adjacent links on intermediate pages", () => {
    render(
      <OrderArchiveList
        basePath="/orders/archive"
        orders={[baseOrder]}
        page={2}
        pageSize={10}
        total={25}
        totalPages={3}
      />,
    );

    expect(screen.getByText("Página 2 de 3 · Total 25 registros")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Anterior" }).getAttribute("href")).toBe("/orders/archive?page=1");
    expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe("/orders/archive?page=3");
  });

  it("disables the previous link on the first page of a multi-page archive", () => {
    render(
      <OrderArchiveList
        basePath="/orders/archive"
        orders={[baseOrder]}
        page={1}
        pageSize={10}
        total={25}
        totalPages={3}
      />,
    );

    expect(screen.queryByRole("link", { name: "Anterior" })).toBeNull();
    expect(screen.getByRole("button", { name: "Anterior" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe("/orders/archive?page=2");
  });

  it("disables the next link on the last page of a multi-page archive", () => {
    render(
      <OrderArchiveList
        basePath="/orders/archive"
        orders={[baseOrder]}
        page={3}
        pageSize={10}
        total={25}
        totalPages={3}
      />,
    );

    expect(screen.getByRole("link", { name: "Anterior" }).getAttribute("href")).toBe("/orders/archive?page=2");
    expect(screen.queryByRole("link", { name: "Siguiente" })).toBeNull();
    expect(screen.getByRole("button", { name: "Siguiente" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("delivered archive list", () => {
  it("hides pagination when a single page covers the total", () => {
    render(
      <DeliveredArchiveList
        basePath="/orders/archive/delivered"
        orders={[baseDelivered]}
        page={1}
        pageSize={10}
        total={1}
        totalPages={1}
      />,
    );

    expect(screen.queryByText(/Página/)).toBeNull();
  });

  it("renders the indicator and canonical adjacent links on intermediate pages", () => {
    render(
      <DeliveredArchiveList
        basePath="/orders/archive/delivered"
        orders={[baseDelivered]}
        page={2}
        pageSize={10}
        total={25}
        totalPages={3}
      />,
    );

    expect(screen.getByText("Página 2 de 3 · Total 25 registros")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Anterior" }).getAttribute("href")).toBe("/orders/archive/delivered?page=1");
    expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe("/orders/archive/delivered?page=3");
  });

  it("disables the previous link on the first page and the next link on the last page", () => {
    render(
      <DeliveredArchiveList
        basePath="/orders/archive/delivered"
        orders={[baseDelivered]}
        page={3}
        pageSize={10}
        total={25}
        totalPages={3}
      />,
    );

    expect(screen.getByRole("link", { name: "Anterior" }).getAttribute("href")).toBe("/orders/archive/delivered?page=2");
    expect(screen.queryByRole("link", { name: "Siguiente" })).toBeNull();
    expect(screen.getByRole("button", { name: "Siguiente" }).hasAttribute("disabled")).toBe(true);
  });
});
