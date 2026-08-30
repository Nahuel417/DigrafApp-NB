// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OrderDetailTabList, OrderDetailTabPanel, OrderDetailTabs } from "./order-detail-tabs";

afterEach(cleanup);

describe("OrderDetailTabs", () => {
  it("switches between details and edit without changing the URL hash", () => {
    render(
      <OrderDetailTabs>
        <OrderDetailTabList showEdit />
        <OrderDetailTabPanel tab="details">Panel de detalles</OrderDetailTabPanel>
        <OrderDetailTabPanel tab="edit">Panel de edición</OrderDetailTabPanel>
      </OrderDetailTabs>,
    );

    expect(screen.getByText("Panel de detalles").className).not.toContain("hidden");
    expect(screen.getByText("Panel de edición").className).toContain("hidden");

    fireEvent.click(screen.getByRole("tab", { name: "Editar" }));

    expect(screen.getByText("Panel de edición").className).not.toContain("hidden");
    expect(screen.getByText("Panel de detalles").className).toContain("hidden");
    expect(window.location.hash).toBe("");
  });

  it("can open directly on edit", () => {
    render(
      <OrderDetailTabs initialTab="edit">
        <OrderDetailTabList showEdit />
        <OrderDetailTabPanel tab="details">Panel de detalles</OrderDetailTabPanel>
        <OrderDetailTabPanel tab="edit">Panel de edición</OrderDetailTabPanel>
      </OrderDetailTabs>,
    );

    expect(screen.getByRole("tab", { name: "Editar" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Panel de edición").className).not.toContain("hidden");
  });
});
