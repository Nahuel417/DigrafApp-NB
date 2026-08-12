import { describe, expect, it } from "vitest";

import { buildOrderDesignReconciliationPlan } from "./image-reconciliation-plan";

const currentPath = "orders/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png";
const oldOrphanPath = "orders/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png";
const freshOrphanPath = "orders/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444.webp";

describe("order design object reconciliation plan", () => {
  it("protects current references and only plans old valid orphans", () => {
    const now = new Date("2026-08-03T12:00:00.000Z");
    const plan = buildOrderDesignReconciliationPlan([
      { path: currentPath, createdAt: "2026-08-03T08:00:00.000Z", updatedAt: "2026-08-03T08:00:00.000Z" },
      { path: oldOrphanPath, createdAt: "2026-08-03T08:00:00.000Z", updatedAt: "2026-08-03T08:00:00.000Z" },
      { path: freshOrphanPath, createdAt: "2026-08-03T11:30:00.000Z", updatedAt: "2026-08-03T11:30:00.000Z" },
      { path: "orders/not-a-valid-object", createdAt: "2026-08-03T08:00:00.000Z", updatedAt: "2026-08-03T08:00:00.000Z" },
    ], new Set([currentPath]), now);

    expect(plan).toEqual({
      deletableObjectPaths: [oldOrphanPath],
      deferredObjectPaths: [freshOrphanPath],
      protectedObjectPaths: [currentPath],
      unrecognizedObjectPaths: ["orders/not-a-valid-object"],
    });
  });

  it("defers objects without reliable timestamps", () => {
    const plan = buildOrderDesignReconciliationPlan([
      { path: oldOrphanPath, createdAt: null, updatedAt: null },
    ], new Set(), new Date("2026-08-03T12:00:00.000Z"));

    expect(plan.deferredObjectPaths).toEqual([oldOrphanPath]);
    expect(plan.deletableObjectPaths).toEqual([]);
  });
});
