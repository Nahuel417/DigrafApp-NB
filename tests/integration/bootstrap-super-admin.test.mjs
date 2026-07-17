import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSuperAdmin,
  deleteAuthUser,
  repairProfile,
} from "../../scripts/bootstrap-super-admin.mjs";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const runId = randomUUID();
const temporaryPassword = `Bootstrap${runId.replaceAll("-", "")}7`;

describe.skipIf(!url || !serviceRoleKey)("Bootstrap de Super admin", () => {
  const admin = createClient(url ?? "", serviceRoleKey ?? "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const createdUserIds = new Set();

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([...createdUserIds].map((id) => admin.auth.admin.deleteUser(id)));
    createdUserIds.clear();
    delete process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
  });

  it("crea Auth confirmado y perfil sin exponer secretos", async () => {
    process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL = `bootstrap-${runId}@digraf.local`;
    process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD = temporaryPassword;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const userId = await createSuperAdmin(admin);
    createdUserIds.add(userId);

    const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role, is_active, must_change_password")
      .eq("id", userId)
      .single();
    const output = log.mock.calls.flat().join(" ");

    expect(authError).toBeNull();
    expect(authData.user.email_confirmed_at).toBeTruthy();
    expect(profileError).toBeNull();
    expect(profile).toEqual({
      role: "super_admin",
      is_active: true,
      must_change_password: true,
    });
    expect(output).not.toContain(temporaryPassword);
    expect(output).not.toContain(serviceRoleKey);
  });

  it("repara un Auth huérfano sin sobrescribir perfiles existentes", async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: `orphan-bootstrap-${runId}@digraf.local`,
      password: temporaryPassword,
      email_confirm: true,
    });

    expect(error).toBeNull();
    createdUserIds.add(data.user.id);

    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await repairProfile(admin, data.user.id);

    const { data: profile } = await admin
      .from("profiles")
      .select("role, is_active, must_change_password")
      .eq("id", data.user.id)
      .single();

    expect(profile).toEqual({
      role: "super_admin",
      is_active: true,
      must_change_password: true,
    });
    await expect(repairProfile(admin, data.user.id)).rejects.toThrow("No se pudo reparar el perfil");
  });

  it("exige confirmación explícita para limpiar Auth", async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: `cleanup-bootstrap-${runId}@digraf.local`,
      password: temporaryPassword,
      email_confirm: true,
    });

    expect(error).toBeNull();
    createdUserIds.add(data.user.id);

    await expect(deleteAuthUser(admin, data.user.id, false)).rejects.toThrow(
      "--confirm-delete-auth",
    );

    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await deleteAuthUser(admin, data.user.id, true);
    createdUserIds.delete(data.user.id);

    const { error: getError } = await admin.auth.admin.getUserById(data.user.id);
    expect(getError).not.toBeNull();
  });

  it("informa el user_id y opciones ante un fallo parcial sin mostrar secretos", async () => {
    process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL = `partial-bootstrap-${runId}@digraf.local`;
    process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD = temporaryPassword;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const userId = "00000000-0000-4000-8000-000000000001";
    const fakeAdmin = {
      from() {
        return {
          select() {
            return {
              async eq() {
                return { count: 0, error: null };
              },
            };
          },
          async insert() {
            return { error: { message: "fallo sintético" } };
          },
        };
      },
      auth: {
        admin: {
          async createUser() {
            return { data: { user: { id: userId } }, error: null };
          },
        },
      },
    };

    await expect(createSuperAdmin(fakeAdmin)).rejects.toThrow("fallo sintético");

    const output = errorLog.mock.calls.flat().join(" ");
    expect(output).toContain(userId);
    expect(output).toContain("--repair-profile");
    expect(output).toContain("--confirm-delete-auth");
    expect(output).not.toContain(temporaryPassword);
    expect(output).not.toContain(serviceRoleKey);
  });
});
