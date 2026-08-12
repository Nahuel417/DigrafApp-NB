import { describe, expect, it } from "vitest";

import {
  ensureAllowedEnvironment,
  getBootstrapUsers,
  isAnonymousProfilesAccessBlocked,
} from "../../scripts/bootstrap-super-admin.mjs";

const stagingUrl = "https://saajtpvsttiedthuhxou.supabase.co";
const stagingProjectRef = "saajtpvsttiedthuhxou";

const environment = {
  BOOTSTRAP_SUPER_ADMIN_EMAIL: "superadmin@example.test",
  BOOTSTRAP_SUPER_ADMIN_NAME: "Synthetic super admin",
  BOOTSTRAP_SUPER_ADMIN_PASSWORD: "SyntheticSuper1",
  BOOTSTRAP_ADMIN_EMAIL: "admin@example.test",
  BOOTSTRAP_ADMIN_NAME: "Synthetic admin",
  BOOTSTRAP_ADMIN_PASSWORD: "SyntheticAdmin1",
  BOOTSTRAP_ATTENTION_EMAIL: "attention@example.test",
  BOOTSTRAP_ATTENTION_NAME: "Synthetic attention",
  BOOTSTRAP_ATTENTION_PASSWORD: "SyntheticAttention1",
  BOOTSTRAP_EMPLOYEE_EMAIL: "employee@example.test",
  BOOTSTRAP_EMPLOYEE_NAME: "Synthetic employee",
  BOOTSTRAP_EMPLOYEE_PASSWORD: "SyntheticEmployee1",
};

describe("staging bootstrap configuration", () => {
  it("allows only the configured staging project for confirmed remote runs", () => {
    expect(() => ensureAllowedEnvironment(stagingUrl, stagingProjectRef, true)).not.toThrow();
    expect(() => ensureAllowedEnvironment(stagingUrl, stagingProjectRef, false)).toThrow(
      "--confirm-remote",
    );
    expect(() => ensureAllowedEnvironment("https://other.supabase.co", stagingProjectRef, true)).toThrow(
      "digraf-staging",
    );
    expect(() => ensureAllowedEnvironment(stagingUrl, "other-project", true)).toThrow(
      "digraf-staging",
    );
  });

  it("requires the four synthetic roles and example.test emails", () => {
    const users = getBootstrapUsers(environment, true);

    expect(users.map((user) => user.role)).toEqual([
      "super_admin",
      "admin",
      "attention",
      "employee",
    ]);
    expect(users.every((user) => user.email.endsWith("@example.test"))).toBe(true);
  });

  it("accepts PostgreSQL 42501 as the expected anonymous denial", () => {
    expect(isAnonymousProfilesAccessBlocked(null, { code: "42501" })).toBe(true);
    expect(isAnonymousProfilesAccessBlocked([], null)).toBe(true);
    expect(isAnonymousProfilesAccessBlocked([], { code: "PGRST301" })).toBe(false);
    expect(isAnonymousProfilesAccessBlocked([{ id: "profile" }], null)).toBe(false);
  });
});
