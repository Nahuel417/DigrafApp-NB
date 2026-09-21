import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentProfile: vi.fn(),
}));

vi.mock("@/lib/auth/current-profile", () => ({ getCurrentProfile: mocks.getCurrentProfile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getOrderFormCatalogs } from "./queries";

function queryResult(data: unknown[]) {
  const result = Promise.resolve({ data, error: null });
  const chain = {
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    then: result.then.bind(result),
  };
  return chain;
}

describe("order catalog queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      from: vi.fn(() => ({ select: vi.fn(() => queryResult([])) })),
    });
  });

  it.each(["super_admin", "admin", "attention", "employee"] as const)(
    "loads the catalog names needed to display saved order options for %s",
    async (role) => {
      mocks.getCurrentProfile.mockResolvedValue({
        id: "profile-id",
        displayName: role,
        isActive: true,
        mustChangePassword: false,
        role,
      });

      await expect(getOrderFormCatalogs()).resolves.toMatchObject({
        necklines: [],
        upperPatterns: [],
        fabrics: [],
        extras: [],
      });
      expect(mocks.createClient).toHaveBeenCalledOnce();
    },
  );

  it("does not load catalogs for an inactive profile", async () => {
    mocks.getCurrentProfile.mockResolvedValue({
      id: "profile-id",
      displayName: "Inactive employee",
      isActive: false,
      mustChangePassword: false,
      role: "employee",
    });

    await expect(getOrderFormCatalogs()).resolves.toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
