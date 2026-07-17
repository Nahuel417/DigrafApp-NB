import { describe, expect, it } from "vitest";

import { getOperatingDate } from "./operating-day";

describe("getOperatingDate", () => {
  it("uses the Córdoba calendar date before the UTC day boundary", () => {
    expect(getOperatingDate(new Date("2026-07-14T02:59:59.000Z"))).toBe(
      "2026-07-13",
    );
  });

  it("changes date at midnight in Córdoba", () => {
    expect(getOperatingDate(new Date("2026-07-14T03:00:00.000Z"))).toBe(
      "2026-07-14",
    );
  });
});
