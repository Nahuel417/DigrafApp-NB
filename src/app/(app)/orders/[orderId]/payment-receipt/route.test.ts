import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentProfile } from "@/lib/auth/current-profile";
import type { getOrderDetail } from "@/features/orders/detail-queries";
import type { ActiveOrderPayment } from "@/features/orders/payment-receipt";

import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getOrderDetail as loadOrderDetail } from "@/features/orders/detail-queries";
import { getActiveOrderPayment } from "@/features/orders/payment-receipt";
import { renderPaymentReceiptPdf } from "@/features/orders/payment-receipt-pdf";

import { GET } from "./route";

vi.mock("@/lib/auth/current-profile", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@/features/orders/detail-queries", () => ({ getOrderDetail: vi.fn() }));
vi.mock("@/features/orders/payment-receipt", () => ({ getActiveOrderPayment: vi.fn() }));
vi.mock("@/features/orders/payment-receipt-pdf", () => ({ renderPaymentReceiptPdf: vi.fn() }));

const orderId = "11111111-1111-4111-8111-111111111111";
const profile: CurrentProfile = { id: "profile-1", displayName: "Atención", isActive: true, mustChangePassword: false, role: "attention" };
const payment: ActiveOrderPayment = { id: "payment-1", amount: 100, cashMovementId: "movement-1", confirmedAt: "2026-09-04T12:00:00.000Z", actorDisplayName: "Atención" };

const detail = {
  order: { publicNumber: 0, currentStage: { code: "received" } },
} as NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>;

describe("payment receipt route", () => {
  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockReset();
    vi.mocked(loadOrderDetail).mockReset();
    vi.mocked(getActiveOrderPayment).mockReset();
    vi.mocked(renderPaymentReceiptPdf).mockReset();
  });

  it("rejects actors who cannot operate cash", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...profile, role: "employee" });

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId }) });

    expect(response.status).toBe(403);
    expect(vi.mocked(loadOrderDetail)).not.toHaveBeenCalled();
  });

  it("returns a private PDF for a current payment in any order stage", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(profile);
    vi.mocked(loadOrderDetail).mockResolvedValue(detail);
    vi.mocked(getActiveOrderPayment).mockResolvedValue(payment);
    vi.mocked(renderPaymentReceiptPdf).mockResolvedValue(Buffer.from("%PDF-test"));

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("comprobante-PED-000000.pdf");
  });

  it("returns a PDF even without an active payment", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(profile);
    vi.mocked(loadOrderDetail).mockResolvedValue(detail);
    vi.mocked(getActiveOrderPayment).mockResolvedValue(null);
    vi.mocked(renderPaymentReceiptPdf).mockResolvedValue(Buffer.from("%PDF-test"));

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId }) });

    expect(response.status).toBe(200);
    expect(vi.mocked(renderPaymentReceiptPdf)).toHaveBeenCalledWith(expect.objectContaining({ payment: null }));
  });
});
