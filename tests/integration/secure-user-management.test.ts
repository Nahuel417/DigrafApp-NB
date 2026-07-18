import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const password = `User${randomUUID().replaceAll("-", "")}7`;

describe.skipIf(!url || !serviceRoleKey || !publishableKey)("Gestión segura de usuarios", () => {
  const admin = createClient<Database>(url ?? "", serviceRoleKey ?? "", { auth: { persistSession: false } });
  const createdIds: string[] = [];
  let superId = "";
  let adminId = "";
  let attentionId = "";
  let employeeId = "";

  async function createIdentity(role: Database["public"]["Enums"]["app_role"], name: string) {
    const { data, error } = await admin.auth.admin.createUser({
      email: `${role}-${randomUUID()}@digraf.local`, password, email_confirm: true,
    });
    if (error || !data.user) throw new Error("No se pudo crear identidad sintética.");
    createdIds.push(data.user.id);
    const { error: profileError } = await admin.from("profiles").insert({
      id: data.user.id, display_name: name, role, is_active: true, must_change_password: false,
    });
    if (profileError) throw profileError;
    return { id: data.user.id, email: data.user.email! };
  }

  async function signedClient(email: string) {
    const client = createClient<Database>(url ?? "", publishableKey ?? "", { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  beforeAll(async () => {
    const superUser = await createIdentity("super_admin", "Super prueba");
    const adminUser = await createIdentity("admin", "Admin prueba");
    const attentionUser = await createIdentity("attention", "Atención prueba");
    const employeeUser = await createIdentity("employee", "Empleado prueba");
    superId = superUser.id;
    adminId = adminUser.id;
    attentionId = attentionUser.id;
    employeeId = employeeUser.id;
    Object.assign(globalThis, { __m2Emails: { superUser, adminUser, attentionUser, employeeUser } });
  });

  afterAll(async () => { await Promise.all(createdIds.map((id) => admin.auth.admin.deleteUser(id))); });

  it("aplica visibilidad RLS por rol", async () => {
    const emails = (globalThis as typeof globalThis & { __m2Emails: Record<string, { email: string }> }).__m2Emails;
    const [superClient, adminClient, attentionClient] = await Promise.all([
      signedClient(emails.superUser.email), signedClient(emails.adminUser.email), signedClient(emails.attentionUser.email),
    ]);
    const [superProfiles, adminProfiles, attentionProfiles] = await Promise.all([
      superClient.from("profiles").select("id"), adminClient.from("profiles").select("id"), attentionClient.from("profiles").select("id"),
    ]);
    expect(superProfiles.data?.map((row) => row.id)).toEqual(expect.arrayContaining([superId, adminId, attentionId, employeeId]));
    expect(adminProfiles.data?.map((row) => row.id)).toEqual(expect.arrayContaining([adminId, attentionId, employeeId]));
    expect(attentionProfiles.data).toEqual([{ id: attentionId }]);
  });

  it("permite al Admin cambiar Atención/Empleado y desactivar", async () => {
    const emails = (globalThis as typeof globalThis & { __m2Emails: Record<string, { email: string }> }).__m2Emails;
    const client = await signedClient(emails.adminUser.email);
    const { error: roleError } = await client.rpc("update_managed_profile", { target_id: attentionId, target_role: "employee", target_is_active: true });
    expect(roleError).toBeNull();
    const { error: deactivateError } = await client.rpc("update_managed_profile", { target_id: attentionId, target_role: "employee", target_is_active: false });
    expect(deactivateError).toBeNull();
    const { data } = await admin.from("profiles").select("role, is_active").eq("id", attentionId).single();
    expect(data).toEqual({ role: "employee", is_active: false });
    const { error: forbiddenError } = await client.rpc("update_managed_profile", { target_id: superId, target_role: "admin", target_is_active: true });
    expect(forbiddenError).not.toBeNull();
  });

  it("protege el último Super admin y audita cambios", async () => {
    const emails = (globalThis as typeof globalThis & { __m2Emails: Record<string, { email: string }> }).__m2Emails;
    const client = await signedClient(emails.superUser.email);
    const { error } = await client.rpc("update_managed_profile", { target_id: superId, target_role: "admin", target_is_active: true });
    expect(error).not.toBeNull();
    const { data: events } = await client.from("audit_events").select("action").eq("target_user_id", attentionId);
    expect(events?.map((event) => event.action)).toEqual(expect.arrayContaining(["user_role_changed", "user_deactivated"]));
  });

  it("rechaza escrituras directas de perfiles y auditoría", async () => {
    const emails = (globalThis as typeof globalThis & { __m2Emails: Record<string, { email: string }> }).__m2Emails;
    const client = await signedClient(emails.superUser.email);
    const { error: profileError } = await client.from("profiles").update({ role: "admin" }).eq("id", superId);
    const { error: auditError } = await client.from("audit_events").insert({ actor_id: superId, target_user_id: adminId, action: "user_created" });
    expect(profileError).not.toBeNull();
    expect(auditError).not.toBeNull();
  });
});
