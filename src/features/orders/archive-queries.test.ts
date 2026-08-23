import { beforeEach, describe, expect, it, vi } from "vitest";

import { redirect } from "next/navigation";
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

vi.mock("@/lib/auth/current-profile", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireActiveProfile: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

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

describe("OrderArchivePage canonicalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveProfile).mockResolvedValue(activeAdmin);
    vi.mocked(createClient).mockResolvedValue(buildArchiveMock([{ data: [baseArchiveRow], count: 1, error: null }]) as never);
  });

  it.each([
    ["non-numeric", "abc"],
    ["zero", "0"],
    ["negative", "-2"],
    ["non-integer", "1.5"],
  ])("redirects an invalid %s ?page to ?page=1", async (_label, raw) => {
    await OrderArchivePage({ searchParams: Promise.resolve({ page: raw }) });

    expect(redirect).toHaveBeenCalledWith("/orders/archive?page=1");
  });

  it("redirects a positive out-of-range page to the last page", async () => {
    vi.mocked(createClient).mockResolvedValue(buildArchiveMock([
      { data: [], count: 25, error: null },
      { data: [baseArchiveRow], count: 25, error: null },
    ]) as never);

    await OrderArchivePage({ searchParams: Promise.resolve({ page: "100" }) });

    expect(redirect).toHaveBeenCalledWith("/orders/archive?page=3");
  });

  it("does not redirect a canonical ?page=1 request", async () => {
    await OrderArchivePage({ searchParams: Promise.resolve({ page: "1" }) });

    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not redirect an omitted ?page request", async () => {
    await OrderArchivePage({ searchParams: Promise.resolve({}) });

    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("DeliveredArchivePage canonicalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveProfile).mockResolvedValue(activeAdmin);
    vi.mocked(createClient).mockResolvedValue(buildArchiveMock([{ data: [baseDeliveredRow], count: 1, error: null }]) as never);
  });

  it("redirects an invalid ?page value to ?page=1", async () => {
    await DeliveredArchivePage({ searchParams: Promise.resolve({ page: "abc" }) });

    expect(redirect).toHaveBeenCalledWith("/orders/archive/delivered?page=1");
  });

  it("redirects a positive out-of-range page to the last page", async () => {
    vi.mocked(createClient).mockResolvedValue(buildArchiveMock([
      { data: [], count: 12, error: null },
      { data: [baseDeliveredRow], count: 12, error: null },
    ]) as never);

    await DeliveredArchivePage({ searchParams: Promise.resolve({ page: "99" }) });

    expect(redirect).toHaveBeenCalledWith("/orders/archive/delivered?page=2");
  });

  it("does not redirect a canonical ?page=1 request", async () => {
    await DeliveredArchivePage({ searchParams: Promise.resolve({ page: "1" }) });

    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not redirect an omitted ?page request", async () => {
    await DeliveredArchivePage({ searchParams: Promise.resolve({}) });

    expect(redirect).not.toHaveBeenCalled();
  });
});
