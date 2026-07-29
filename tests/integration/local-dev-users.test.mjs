import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import {
  assertLocalSupabaseUrl,
  ensureLocalDevUsers,
} from "../../scripts/ensure-local-dev-users.mjs";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const runId = randomUUID();
const password = `Local${runId.replaceAll("-", "")}7`;
const users = [
  { email: `super-${runId}@digraf.local`, displayName: "Super local test", role: "super_admin" },
  { email: `admin-${runId}@digraf.local`, displayName: "Admin local test", role: "admin" },
  { email: `attention-${runId}@digraf.local`, displayName: "Atención local test", role: "attention" },
  { email: `employee-${runId}@digraf.local`, displayName: "Empleado local test", role: "employee" },
];

describe("local development user safety", () => {
  it("rejects every non-local Supabase URL", () => {
    expect(() => assertLocalSupabaseUrl("https://project.supabase.co")).toThrow("solo puede ejecutarse contra Supabase local");
    expect(() => assertLocalSupabaseUrl("not-a-url")).toThrow("no es una URL válida");
    expect(assertLocalSupabaseUrl("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
  });
});

describe.skipIf(!url || !serviceRoleKey || !publishableKey)("local development users", () => {
  const admin = createClient(url ?? "http://127.0.0.1:54321", serviceRoleKey ?? "test-key", {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    const fixtureEmails = new Set(users.map(({ email }) => email));
    await Promise.all(data.users
      .filter((user) => user.email && fixtureEmails.has(user.email))
      .map((user) => admin.auth.admin.deleteUser(user.id)));
  });

  it("creates, authenticates and restores every role idempotently without logging secrets", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const first = await ensureLocalDevUsers({
      url,
      serviceRoleKey,
      publishableKey,
      password,
      users,
    });
    const second = await ensureLocalDevUsers({
      url,
      serviceRoleKey,
      publishableKey,
      password,
      users,
    });

    expect(first.map(({ email, role, created }) => ({ email, role, created }))).toEqual(
      users.map(({ email, role }) => ({ email, role, created: true })),
    );
    expect(second.map(({ id }) => id)).toEqual(first.map(({ id }) => id));
    expect(second.every(({ created }) => !created)).toBe(true);

    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, role, is_active, must_change_password")
      .in("id", first.map(({ id }) => id));
    expect(error).toBeNull();
    expect(profiles).toHaveLength(4);
    expect(profiles.map(({ role }) => role).sort()).toEqual(["admin", "attention", "employee", "super_admin"]);
    expect(profiles.every(({ is_active, must_change_password }) => is_active && !must_change_password)).toBe(true);

    const output = log.mock.calls.flat().join(" ");
    expect(output).not.toContain(password);
    expect(output).not.toContain(serviceRoleKey);
    log.mockRestore();
  });
});
