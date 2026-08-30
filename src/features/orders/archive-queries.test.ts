import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

import { permanentRedirect, redirect } from "next/navigation";
import { requireActiveProfile } from "@/lib/auth/guards";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";

import {
  getArchivedDeliveredOrders,
  getOrderArchive,
  mapArchiveRows,
  mapArchivedDeliveredRows,
} from "./archive-queries";
import OrderArchivePage from "@/app/(app)/orders/archive/page";
import DeliveredArchivePage from "@/app/(app)/orders/archive/delivered/page";
import OrdersArchivesPage from "@/app/(app)/orders/archives/page";
import { OrderArchiveList } from "@/features/orders/components/order-archive-list";

vi.mock("@/lib/auth/current-profile", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireActiveProfile: vi.fn() }));
vi.mock("next/navigation", () => {
  const nextRedirect = (url: string) => {
    const error = new Error(`NEXT_REDIRECT:${url}`) as Error & { __isNextRedirect?: boolean; digest?: string };
    error.__isNextRedirect = true;
    error.digest = `NEXT_REDIRECT;replace;${url};307`;
    throw error;
  };
  const nextPermanentRedirect = (url: string) => {
    const error = new Error(`NEXT_REDIRECT:${url}`) as Error & { __isNextRedirect?: boolean; digest?: string };
    error.__isNextRedirect = true;
    error.digest = `NEXT_REDIRECT;replace;${url};308`;
    throw error;
  };
  return { permanentRedirect: vi.fn(nextPermanentRedirect), redirect: vi.fn(nextRedirect) };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/features/orders/components/order-archive-list", () => ({ OrderArchiveList: vi.fn(), DeliveredArchiveList: vi.fn() }));

const activeAdmin = { id: "admin-id", displayName: "Admin", isActive: true, mustChangePassword: false, role: "admin" as const };

const baseArchiveRow = {
  id: "order-1",
  public_number: 12,
  customer_name: "Equipo Norte",
  current_stage_id: "stage-1",
  cancelled_at: "2026-08-14T12:00:00.000Z",
  cancelled_by: "profile-1",
  cancellation_reason: "Cliente pidió pausa",
  updated_at: "2026-08-14T12:00:00.000Z",
};

const baseDeliveredRow = {
  id: "order-3",
  public_number: 14,
  customer_name: null,
  client_name: "Club Oeste",
  team_name: "Primera",
  quantity: 12,
  order_date: "2026-08-01",
  promised_delivery_date: "2026-08-10",
  current_stage_id: "stage-delivered",
  updated_at: "2026-08-10T12:00:00.000Z",
};

function buildArchiveMock(rangeResponses: Array<{ data: unknown[] | null; count: number; error: { message: string } | null }>) {
  let rangeIndex = 0;
  const range = vi.fn(() => {
    const r = rangeResponses[rangeIndex] ?? rangeResponses[rangeResponses.length - 1] ?? { data: [], count: 0, error: null };
    rangeIndex += 1;
    return Promise.resolve(r);
  });
  const order = vi.fn(() => chain);
  const eq = vi.fn(() => chain);
  const inFn = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const select = vi.fn(() => chain);
  const chain: { range: typeof range; order: typeof order; eq: typeof eq; in: typeof inFn; select: typeof select } = { range, order, eq, in: inFn, select };
  const fromResult = { select };
  const from = vi.fn(() => fromResult);
  return { from, range, order, eq, select };
}

function isNextRedirectError(error: unknown): boolean {
  return Boolean((error as { __isNextRedirect?: boolean } | null)?.__isNextRedirect);
}

async function invokeRoute(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    if (!isNextRedirectError(error)) throw error;
  }
}

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

  it("maps archived delivered rows without changing their retained order data", () => {
    const row = { id: "order-3", public_number: 14, customer_name: "Equipo Oeste", client_name: "Club Oeste", team_name: "Primera", quantity: 12, order_date: "2026-08-01", promised_delivery_date: "2026-08-10", current_stage_id: "stage-delivered", updated_at: "2026-08-10T12:00:00.000Z" };
    expect(mapArchivedDeliveredRows([row], [{ id: "stage-delivered", name: "Entregado" }])[0]).toEqual({ id: "order-3", publicNumber: 14, customerName: "Club Oeste", teamName: "Primera", quantity: 12, currentStageName: "Entregado", orderDate: "2026-08-01", promisedDeliveryDate: "2026-08-10", updatedAt: "2026-08-10T12:00:00.000Z" });
  });
});

describe("getOrderArchive pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentProfile).mockResolvedValue(activeAdmin);
  });

  it("queries a 10-row range by default for a valid positive integer page", async () => {
    const mock = buildArchiveMock([{ data: [baseArchiveRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const result = await getOrderArchive(1);

    expect(result).toMatchObject({ total: 1, page: 1, totalPages: 1 });
    expect(result?.orders).toHaveLength(1);
    expect(mock.range).toHaveBeenCalledTimes(1);
    expect(mock.range).toHaveBeenCalledWith(0, 9);
  });

  it.each([
    ["zero", 0],
    ["negative", -2],
    ["non-integer", 1.5],
    ["NaN", Number.NaN],
  ])("normalizes %s numeric input to page 1", async (_label, input) => {
    const mock = buildArchiveMock([{ data: [baseArchiveRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const result = await getOrderArchive(input);

    expect(result).toMatchObject({ page: 1 });
    expect(mock.range).toHaveBeenCalledWith(0, 9);
  });

  it("computes the correct range for an intermediate page", async () => {
    const mock = buildArchiveMock([{ data: [baseArchiveRow], count: 25, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const result = await getOrderArchive(2);

    expect(result).toMatchObject({ total: 25, page: 2, totalPages: 3 });
    expect(mock.range).toHaveBeenCalledWith(10, 19);
  });

  it("clamps a positive out-of-range page to the last page with one bounded fallback query", async () => {
    const mock = buildArchiveMock([
      { data: [], count: 25, error: null },
      { data: [{ ...baseArchiveRow, id: "order-21" }], count: 25, error: null },
    ]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const result = await getOrderArchive(100);

    expect(result).toMatchObject({ total: 25, page: 3, totalPages: 3 });
    expect(result?.orders).toHaveLength(1);
    expect(result?.orders[0]?.id).toBe("order-21");
    expect(mock.range).toHaveBeenCalledTimes(2);
    expect(mock.range).toHaveBeenNthCalledWith(1, 990, 999);
    expect(mock.range).toHaveBeenNthCalledWith(2, 20, 24);
  });

  it("returns an empty page with total zero and no fallback when nothing matches", async () => {
    const mock = buildArchiveMock([{ data: [], count: 0, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const result = await getOrderArchive(1);

    expect(result).toEqual({ orders: [], total: 0, page: 1, totalPages: 1 });
    expect(mock.range).toHaveBeenCalledTimes(1);
  });

  it("orders by updated_at descending, then id descending", async () => {
    const mock = buildArchiveMock([{ data: [baseArchiveRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    await getOrderArchive(1);

    expect(mock.order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(mock.order).toHaveBeenCalledWith("id", { ascending: false });
  });

  it("returns null when the profile is missing", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    expect(await getOrderArchive(1)).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns null when the role cannot manage the lifecycle", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeAdmin, role: "attention" });
    expect(await getOrderArchive(1)).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("maps a query error to a safe message without leaking database details", async () => {
    const mock = buildArchiveMock([{ data: null, count: 0, error: { message: "internal database details" } }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    await expect(getOrderArchive(1)).rejects.toThrow("No se pudo cargar el Archivo de pedidos.");
    await expect(getOrderArchive(1)).rejects.not.toThrow("internal database details");
  });
});

describe("getArchivedDeliveredOrders pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentProfile).mockResolvedValue(activeAdmin);
  });

  it("queries a 10-row range by default for a valid positive integer page", async () => {
    const mock = buildArchiveMock([{ data: [baseDeliveredRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const result = await getArchivedDeliveredOrders(1);

    expect(result).toMatchObject({ total: 1, page: 1, totalPages: 1 });
    expect(result?.orders).toHaveLength(1);
    expect(mock.range).toHaveBeenCalledTimes(1);
    expect(mock.range).toHaveBeenCalledWith(0, 9);
  });

  it("normalizes invalid numeric input to page 1", async () => {
    const mock = buildArchiveMock([{ data: [baseDeliveredRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const result = await getArchivedDeliveredOrders(0);

    expect(result).toMatchObject({ page: 1 });
    expect(mock.range).toHaveBeenCalledWith(0, 9);
  });

  it("clamps a positive out-of-range page to the last page with one bounded fallback query", async () => {
    const mock = buildArchiveMock([
      { data: [], count: 12, error: null },
      { data: [{ ...baseDeliveredRow, id: "order-12" }], count: 12, error: null },
    ]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const result = await getArchivedDeliveredOrders(50);

    expect(result).toMatchObject({ total: 12, page: 2, totalPages: 2 });
    expect(result?.orders).toHaveLength(1);
    expect(mock.range).toHaveBeenCalledTimes(2);
    expect(mock.range).toHaveBeenNthCalledWith(1, 490, 499);
    expect(mock.range).toHaveBeenNthCalledWith(2, 10, 11);
  });

  it("returns an empty page with total zero when nothing matches", async () => {
    const mock = buildArchiveMock([{ data: [], count: 0, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const result = await getArchivedDeliveredOrders(1);

    expect(result).toEqual({ orders: [], total: 0, page: 1, totalPages: 1 });
  });

  it("orders by updated_at descending, then id descending", async () => {
    const mock = buildArchiveMock([{ data: [baseDeliveredRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    await getArchivedDeliveredOrders(1);

    expect(mock.order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(mock.order).toHaveBeenCalledWith("id", { ascending: false });
  });

  it("returns null when the profile is missing", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    expect(await getArchivedDeliveredOrders(1)).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns null when the role cannot archive delivered orders", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeAdmin, role: "attention" });
    expect(await getArchivedDeliveredOrders(1)).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("maps a query error to a safe message without leaking database details", async () => {
    const mock = buildArchiveMock([{ data: null, count: 0, error: { message: "internal database details" } }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    await expect(getArchivedDeliveredOrders(1)).rejects.toThrow("No se pudo cargar el Archivo de entregados.");
    await expect(getArchivedDeliveredOrders(1)).rejects.not.toThrow("internal database details");
  });
});

describe("OrderArchivePage 308 shim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveProfile).mockResolvedValue(activeAdmin);
  });

  it("issues a 308 permanent redirect to cancelled tab with mapped page", async () => {
    await invokeRoute(() => OrderArchivePage({ searchParams: Promise.resolve({ page: "3" }) }));

    expect(permanentRedirect).toHaveBeenCalledTimes(1);
    expect(permanentRedirect).toHaveBeenCalledWith("/orders/archives?tab=cancelled&cancelledPage=3");
  });

  it("omits the cancelledPage key when legacy page is omitted", async () => {
    await invokeRoute(() => OrderArchivePage({ searchParams: Promise.resolve({}) }));

    expect(permanentRedirect).toHaveBeenCalledWith("/orders/archives?tab=cancelled");
  });

  it("does not query the database", async () => {
    await invokeRoute(() => OrderArchivePage({ searchParams: Promise.resolve({ page: "5" }) }));

    expect(createClient).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("checks the cancelled authorization before reading searchParams", async () => {
    vi.mocked(requireActiveProfile).mockResolvedValue({ ...activeAdmin, role: "attention" });

    await invokeRoute(() => OrderArchivePage({ searchParams: Promise.resolve({ page: "5" }) }));

    expect(redirect).toHaveBeenCalledWith("/orders");
    expect(createClient).not.toHaveBeenCalled();
    expect(permanentRedirect).not.toHaveBeenCalled();
  });
});

describe("DeliveredArchivePage 308 shim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveProfile).mockResolvedValue(activeAdmin);
  });

  it("issues a 308 permanent redirect to delivered tab with mapped page", async () => {
    await invokeRoute(() => DeliveredArchivePage({ searchParams: Promise.resolve({ page: "4" }) }));

    expect(permanentRedirect).toHaveBeenCalledTimes(1);
    expect(permanentRedirect).toHaveBeenCalledWith("/orders/archives?tab=delivered&deliveredPage=4");
  });

  it("omits the deliveredPage key when legacy page is omitted", async () => {
    await invokeRoute(() => DeliveredArchivePage({ searchParams: Promise.resolve({}) }));

    expect(permanentRedirect).toHaveBeenCalledWith("/orders/archives?tab=delivered");
  });

  it("does not query the database", async () => {
    await invokeRoute(() => DeliveredArchivePage({ searchParams: Promise.resolve({ page: "2" }) }));

    expect(createClient).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("checks the delivered authorization before reading searchParams", async () => {
    vi.mocked(requireActiveProfile).mockResolvedValue({ ...activeAdmin, role: "attention" });

    await invokeRoute(() => DeliveredArchivePage({ searchParams: Promise.resolve({ page: "2" }) }));

    expect(redirect).toHaveBeenCalledWith("/orders");
    expect(createClient).not.toHaveBeenCalled();
    expect(permanentRedirect).not.toHaveBeenCalled();
  });
});

describe("OrdersArchivesPage (unified tabs) canonicalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveProfile).mockResolvedValue(activeAdmin);
  });

  it("resolves the default delivered tab when tab is omitted", async () => {
    const mock = buildArchiveMock([{ data: [baseDeliveredRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    await invokeRoute(() => OrdersArchivesPage({ searchParams: Promise.resolve({}) }));

    expect(redirect).not.toHaveBeenCalled();
    expect(mock.from).toHaveBeenCalledWith("archived_delivered_orders");
    expect(mock.from).not.toHaveBeenCalledWith("orders");
  });

  it("resolves the delivered tab explicitly", async () => {
    const mock = buildArchiveMock([{ data: [baseDeliveredRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    await invokeRoute(() => OrdersArchivesPage({ searchParams: Promise.resolve({ tab: "delivered" }) }));

    expect(redirect).not.toHaveBeenCalled();
    expect(mock.from).toHaveBeenCalledWith("archived_delivered_orders");
  });

  it("resolves the cancelled tab explicitly", async () => {
    const superAdmin = { ...activeAdmin, role: "super_admin" as const };
    vi.mocked(requireActiveProfile).mockResolvedValue(superAdmin);
    const mock = buildArchiveMock([{ data: [baseArchiveRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);
    vi.mocked(getCurrentProfile).mockResolvedValue(superAdmin);

    await invokeRoute(() =>
      OrdersArchivesPage({ searchParams: Promise.resolve({ tab: "cancelled" }) }).then((jsx) => renderToString(jsx as never)),
    );

    expect(redirect).not.toHaveBeenCalled();
    expect(mock.from).toHaveBeenCalledWith("orders");
    expect(mock.from).not.toHaveBeenCalledWith("archived_delivered_orders");
    expect(OrderArchiveList).toHaveBeenCalledWith(expect.objectContaining({ canPurge: true }), undefined);
  });

  it.each([
    ["unsupported", "archived"],
    ["garbage", "???"],
    ["empty-after-trim", "  "],
  ])("canonicalizes an invalid %s tab to delivered without looping", async (_label, raw) => {
    const mock = buildArchiveMock([{ data: [baseDeliveredRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    await invokeRoute(() => OrdersArchivesPage({ searchParams: Promise.resolve({ tab: raw }) }));

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("tab=delivered"));
    expect(redirect).toHaveBeenCalledWith(expect.not.stringContaining(`tab=${raw}`));
  });

  it("does not redirect the canonical delivered tab without page params", async () => {
    const mock = buildArchiveMock([{ data: [baseDeliveredRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    await invokeRoute(() => OrdersArchivesPage({ searchParams: Promise.resolve({ tab: "delivered", deliveredPage: "1" }) }));

    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects an invalid deliveredPage to deliveredPage=1 without dropping cancelledPage", async () => {
    const mock = buildArchiveMock([{ data: [baseDeliveredRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    await invokeRoute(() => OrdersArchivesPage({
      searchParams: Promise.resolve({ tab: "delivered", deliveredPage: "0", cancelledPage: "7" }),
    }));

    expect(redirect).toHaveBeenCalledTimes(1);
    const target = vi.mocked(redirect).mock.calls[0]?.[0] as string;
    expect(target).toContain("tab=delivered");
    expect(target).toContain("deliveredPage=1");
    expect(target).toContain("cancelledPage=7");
    expect(target).not.toContain("deliveredPage=0");
  });

  it("preserves the inactive cancelledPage verbatim while active deliveredPage is canonicalized", async () => {
    const mock = buildArchiveMock([{ data: [baseDeliveredRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    await invokeRoute(() => OrdersArchivesPage({
      searchParams: Promise.resolve({ tab: "delivered", deliveredPage: "abc", cancelledPage: "7" }),
    }));

    const target = vi.mocked(redirect).mock.calls[0]?.[0] as string;
    expect(target).toContain("cancelledPage=7");
  });

  it("redirects an invalid cancelledPage to cancelledPage=1 in a single combined redirect", async () => {
    const mock = buildArchiveMock([{ data: [baseArchiveRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    await invokeRoute(() => OrdersArchivesPage({
      searchParams: Promise.resolve({ tab: "cancelled", cancelledPage: "-2" }),
    }));

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/orders/archives?tab=cancelled&cancelledPage=1");
  });

  it("does not invoke the inactive tab's query when only the active tab renders", async () => {
    const mock = buildArchiveMock([{ data: [baseDeliveredRow], count: 1, error: null }]);
    vi.mocked(createClient).mockResolvedValue(mock as never);

    await invokeRoute(() => OrdersArchivesPage({
      searchParams: Promise.resolve({ tab: "delivered", deliveredPage: "1", cancelledPage: "3" }),
    }));

    expect(mock.from).toHaveBeenCalledWith("archived_delivered_orders");
    expect(mock.from).not.toHaveBeenCalledWith("orders");
    expect(mock.range).toHaveBeenCalledTimes(1);
  });

  it("checks branch-specific authorization: redirected on attention for delivered tab", async () => {
    vi.mocked(requireActiveProfile).mockResolvedValue({ ...activeAdmin, role: "attention" });

    await invokeRoute(() => OrdersArchivesPage({ searchParams: Promise.resolve({ tab: "delivered" }) }));

    expect(redirect).toHaveBeenCalledWith("/orders");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("checks branch-specific authorization: redirected on attention for cancelled tab", async () => {
    vi.mocked(requireActiveProfile).mockResolvedValue({ ...activeAdmin, role: "attention" });

    await invokeRoute(() => OrdersArchivesPage({ searchParams: Promise.resolve({ tab: "cancelled" }) }));

    expect(redirect).toHaveBeenCalledWith("/orders");
    expect(createClient).not.toHaveBeenCalled();
  });
});