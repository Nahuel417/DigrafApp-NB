// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppNavigation } from "./app-navigation";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/dashboard") }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));

afterEach(cleanup);

const fullCapabilities = {
  canCreateOrders: true,
  canManageCatalogs: true,
  canManageStages: true,
  canManageUsers: true,
  canManageOrderLifecycle: true,
  canArchiveDeliveredOrder: true,
  canOperateCash: true,
};

function hrefsFor(container: HTMLElement) {
  return Array.from(container.querySelectorAll("a")).map((link) => link.getAttribute("href"));
}

describe("app navigation archives entry", () => {
  it("exposes exactly one /orders/archives entry when archive capabilities are granted", () => {
    const { container } = render(<AppNavigation capabilities={fullCapabilities} />);

    const hrefs = hrefsFor(container);
    expect(hrefs.filter((href) => href === "/orders/archives")).toHaveLength(1);
  });

  it("does not expose any legacy archive route entries", () => {
    const { container } = render(<AppNavigation capabilities={fullCapabilities} />);

    const hrefs = hrefsFor(container);
    expect(hrefs).not.toContain("/orders/archive");
    expect(hrefs).not.toContain("/orders/archive/delivered");
  });

  it("hides the archive entry when no archive capability is granted", () => {
    const noArchive = { ...fullCapabilities, canManageOrderLifecycle: false, canArchiveDeliveredOrder: false };

    const { container } = render(<AppNavigation capabilities={noArchive} />);

    const hrefs = hrefsFor(container);
    expect(hrefs).not.toContain("/orders/archives");
    expect(hrefs).not.toContain("/orders/archive");
    expect(hrefs).not.toContain("/orders/archive/delivered");
  });
});
