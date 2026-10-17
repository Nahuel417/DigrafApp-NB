import { describe, expect, it } from "vitest";

import { incidentSchema, incidentKinds, incidentReasons, canCreateIncident, canCorrectIncident } from "./incident-schemas";

const valid = {
  orderId: "22222222-2222-4222-8222-222222222222", incidentId: "33333333-3333-4333-8333-333333333333",
  requestId: "44444444-4444-4444-8444-444444444444", kind: "internal", reasons: ["sewing"], expectedVersion: "0",
};

describe("incident input", () => {
  it("accepts all three types and one or multiple fixed reasons", () => {
    for (const kind of Object.keys(incidentKinds)) {
      expect(incidentSchema.safeParse({ ...valid, kind }).success).toBe(true);
      expect(incidentSchema.safeParse({ ...valid, kind, reasons: Object.keys(incidentReasons) }).success).toBe(true);
    }
  });
  it("rejects missing or unknown classification, invalid identifiers and invalid revisions", () => {
    for (const change of [{ kind: "other" }, { reasons: [] }, { reasons: ["other"] }, { reasons: [null] }, { reasons: ["sewing", "sewing", "sewing", "sewing", "sewing"] }, { orderId: "bad" }, { incidentId: "bad" }, { requestId: "bad" }, { expectedVersion: -1 }, { expectedVersion: 1.5 }, { expectedVersion: "" }]) {
      expect(incidentSchema.safeParse({ ...valid, ...change }).success).toBe(false);
    }
  });
  it("allows employee internal registration only, while managers may register and correct", () => {
    expect(canCreateIncident("employee", "internal")).toBe(true);
    expect(canCreateIncident("employee", "complaint_with_return")).toBe(false);
    expect(canCreateIncident("employee", "complaint_without_return")).toBe(false);
    expect(canCorrectIncident("employee")).toBe(false);
    for (const role of ["super_admin", "admin", "attention"] as const) {
      for (const kind of Object.keys(incidentKinds)) expect(canCreateIncident(role, kind)).toBe(true);
      expect(canCorrectIncident(role)).toBe(true);
    }
  });
});
