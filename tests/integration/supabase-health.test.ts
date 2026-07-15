import { describe, expect, it } from "vitest";

const supabaseUrl = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

describe("Supabase local", () => {
  it("exposes a healthy Auth service", async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/health`);

    expect(response.ok).toBe(true);
  });
});
