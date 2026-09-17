// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MobileNavigation } from "./mobile-navigation";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/dashboard") }));
vi.mock("next/link", () => ({ default: ({ children, onClick, ...props }: { children: React.ReactNode; onClick?: React.MouseEventHandler<HTMLAnchorElement> } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} onClick={(event) => { event.preventDefault(); onClick?.(event); }}>{children}</a> }));
vi.mock("./brand-lockup", () => ({ BrandLockup: ({ tagline }: { tagline?: string | null }) => <div>{tagline ? `Digraf ${tagline}` : "Digraf"}</div> }));
vi.mock("@/features/auth/components/logout-form", () => ({ LogoutForm: ({ label = "Salir" }: { label?: string }) => <button type="button">{label}</button> }));

const capabilities = {
  canCreateOrders: true,
  canManageCatalogs: true,
  canManageStages: true,
  canManageUsers: true,
  canManageOrderLifecycle: true,
  canArchiveDeliveredOrder: true,
  canOperateCash: true,
};

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});

afterEach(cleanup);

describe("MobileNavigation", () => {
  it("opens the drawer and returns focus after Escape", async () => {
    render(<MobileNavigation capabilities={capabilities} displayName="Ana Admin" initials="AA" roleName="Admin" />);

    const trigger = screen.getByRole("button", { name: "Abrir navegación" });
    expect(document.activeElement).not.toBe(trigger);
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Navegación" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(within(dialog).getByRole("navigation", { name: "Navegación principal móvil" })).toBeTruthy();

    fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));

    await waitFor(() => {
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("closes after selecting a destination", async () => {
    render(<MobileNavigation capabilities={capabilities} displayName="Ana Admin" initials="AA" roleName="Admin" />);

    const trigger = screen.getByRole("button", { name: "Abrir navegación" });
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Navegación" })).getByRole("link", { name: "Pedidos" }));

    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("false"));
  });
});
