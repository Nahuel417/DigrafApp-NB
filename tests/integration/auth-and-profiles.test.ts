import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

const runId = randomUUID();
const activeEmail = `active-auth-${runId}@digraf.local`;
const inactiveEmail = `inactive-auth-${runId}@digraf.local`;
const password = `Auth${runId.replaceAll("-", "")}7`;

describe.skipIf(!serviceRoleKey || !publishableKey)("Auth y perfiles", () => {
  const admin = createClient<Database>(url, serviceRoleKey ?? "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const browser = createClient<Database>(url, publishableKey ?? "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const activeUser = await admin.auth.admin.createUser({
      email: activeEmail,
      password,
      email_confirm: true,
    });
    const inactiveUser = await admin.auth.admin.createUser({
      email: inactiveEmail,
      password,
      email_confirm: true,
    });

    if (activeUser.error || inactiveUser.error || !activeUser.data.user || !inactiveUser.data.user) {
      throw new Error("No se pudieron crear los usuarios sintéticos para la integración.");
    }

    createdUserIds.push(activeUser.data.user.id, inactiveUser.data.user.id);

    const { error } = await admin.from("profiles").insert([
      {
        id: activeUser.data.user.id,
        role: "attention",
        is_active: true,
        must_change_password: true,
      },
      {
        id: inactiveUser.data.user.id,
        role: "employee",
        is_active: false,
        must_change_password: true,
      },
    ]);

    if (error) {
      throw error;
    }
  });

  afterAll(async () => {
    await Promise.all(createdUserIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("bloquea el registro público", async () => {
    const { error } = await browser.auth.signUp({
      email: `public-signup-${runId}@digraf.local`,
      password,
    });

    expect(error).not.toBeNull();
  });

  it("permite a un perfil activo leer solamente su propio perfil", async () => {
    const { error: signInError } = await browser.auth.signInWithPassword({
      email: activeEmail,
      password,
    });
    expect(signInError).toBeNull();

    const { data, error } = await browser.from("profiles").select("role, is_active");

    expect(error).toBeNull();
    expect(data).toEqual([{ role: "attention", is_active: true }]);
  });

  it("no expone el perfil de un usuario inactivo aunque tenga una sesión válida", async () => {
    await browser.auth.signOut();
    const { error: signInError } = await browser.auth.signInWithPassword({
      email: inactiveEmail,
      password,
    });
    expect(signInError).toBeNull();

    const { data, error } = await browser.from("profiles").select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("impide modificar directamente el cambio obligatorio", async () => {
    await browser.auth.signOut();
    await browser.auth.signInWithPassword({ email: activeEmail, password });

    const { error: updateError } = await browser
      .from("profiles")
      .update({ must_change_password: false })
      .eq("role", "attention");

    expect(updateError).not.toBeNull();

    const { data, error } = await browser
      .from("profiles")
      .select("must_change_password")
      .eq("role", "attention")
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({ must_change_password: true });
  });
});
