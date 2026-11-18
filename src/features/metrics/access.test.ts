import { describe, expect, it } from "vitest";

import { canViewMetrics } from "./access";

describe("metrics access", () => {
  it("allows only Super Admin and Admin roles", () => {
    expect(canViewMetrics("super_admin")).toBe(true);
    expect(canViewMetrics("admin")).toBe(true);
    expect(canViewMetrics("attention")).toBe(false);
    expect(canViewMetrics("employee")).toBe(false);
  });
});
