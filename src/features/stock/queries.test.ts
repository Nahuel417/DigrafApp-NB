import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";

import { getStockHistory } from "./queries";

vi.mock("@/lib/auth/current-profile", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const activeProfile = {
  id: "profile-id",
  displayName: "Operador",
  isActive: true,
  mustChangePassword: false,
};

describe("getStockHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects employees before querying the history", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeProfile, role: "employee" });

    await expect(getStockHistory("item-id", false)).rejects.toThrow(
      "No tenés permiso para consultar el historial de stock.",
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects inactive profiles before querying the history", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...activeProfile, isActive: false, role: "attention" });

    await expect(getStockHistory("item-id", false)).rejects.toThrow(
      "No tenés permiso para consultar el historial de stock.",
    );
    expect(createClient).not.toHaveBeenCalled();
  });
});