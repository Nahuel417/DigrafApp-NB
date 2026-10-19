import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/current-profile", () => ({ getCurrentProfile: mocks.profile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
import { saveOrderIncidentAction } from "./incident-actions";

function input(kind = "internal", version = "0") {
  const data = new FormData();
  Object.entries({ orderId: "22222222-2222-4222-8222-222222222222", incidentId: "33333333-3333-4333-8333-333333333333", requestId: "44444444-4444-4444-8444-444444444444", kind, expectedVersion: version }).forEach(([key, value]) => data.set(key, value));
  data.append("reasons", "sewing"); data.append("reasons", "design");
  return data;
}
beforeEach(() => { vi.clearAllMocks(); mocks.profile.mockResolvedValue({ role: "admin", isActive: true, mustChangePassword: false }); mocks.rpc.mockResolvedValue({ data: { version: 1 }, error: null }); });
describe("incident server action", () => {
  it("validates inputs before database work", async () => {
    const data = input(); data.delete("reasons");
    expect((await saveOrderIncidentAction({}, data)).status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("authorizes all manager roles and employee internal registration, with typed RPC and detail revalidation", async () => {
    for (const role of ["super_admin", "admin", "attention", "employee"]) {
      mocks.profile.mockResolvedValue({ role, isActive: true, mustChangePassword: false });
      expect((await saveOrderIncidentAction({}, input())).status).toBe("success");
    }
    expect(mocks.rpc).toHaveBeenCalledWith("save_order_incident", expect.objectContaining({ p_kind: "internal", p_reasons: ["sewing", "design"], p_expected_version: 0 }));
    expect(mocks.revalidate).toHaveBeenCalledWith("/orders/22222222-2222-4222-8222-222222222222");
  });
  it("denies missing, inactive and password-pending profiles and employee complaints/corrections", async () => {
    for (const profile of [null, { role: "admin", isActive: false }, { role: "admin", isActive: true, mustChangePassword: true }]) {
      mocks.profile.mockResolvedValue(profile);
      expect((await saveOrderIncidentAction({}, input())).status).toBe("error");
    }
    mocks.profile.mockResolvedValue({ role: "employee", isActive: true, mustChangePassword: false });
    expect((await saveOrderIncidentAction({}, input("complaint_with_return"))).status).toBe("error");
    expect((await saveOrderIncidentAction({}, input("internal", "1"))).status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("surfaces stale edits and hides unexpected database details", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "La incidencia cambió en otra sesión. Actualice el pedido." } });
    expect((await saveOrderIncidentAction({}, input("internal", "1"))).message).toContain("otra sesión");
    mocks.rpc.mockResolvedValue({ error: { message: "private database details" } });
    expect((await saveOrderIncidentAction({}, input())).message).not.toContain("private");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
