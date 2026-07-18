import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const password = `Manager${randomUUID().replaceAll("-", "")}7`;

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta Supabase para E2E.");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

test("Super admin crea un usuario desde la gestión interna", async ({ page }) => {
  const admin = adminClient();
  const managerEmail = `manager-${randomUUID()}@digraf.local`;
  const newUserEmail = `new-user-${randomUUID()}@digraf.local`;
  const { data, error } = await admin.auth.admin.createUser({ email: managerEmail, password, email_confirm: true });
  if (error || !data.user) throw new Error("No se pudo crear el Super admin E2E.");

  try {
    await admin.from("profiles").insert({
      id: data.user.id,
      display_name: "Super admin E2E",
      role: "super_admin",
      is_active: true,
      must_change_password: false,
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill(managerEmail);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();

    await page.getByLabel("Nombre descriptivo").fill("Operario de prueba");
    await page.getByLabel("Email").last().fill(newUserEmail);
    await page.getByLabel("Contraseña temporal").fill(`Temp${randomUUID().replaceAll("-", "")}7`);
    await page.getByRole("button", { name: "Crear usuario" }).click();
    await expect(page.getByText("Usuario creado. Comunicá la contraseña temporal por un canal seguro.")).toBeVisible();
    await expect(page.getByText("Operario de prueba").first()).toBeVisible();
  } finally {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const created = users.users.find((user) => user.email === newUserEmail);
    if (created) await admin.auth.admin.deleteUser(created.id);
    await admin.auth.admin.deleteUser(data.user.id);
  }
});

test("Admin visualiza otros Admin y activa o desactiva personal operativo", async ({ page }) => {
  const admin = adminClient();
  const runId = randomUUID().slice(0, 8);
  const visibleAdminName = `Admin visible ${runId}`;
  const attentionName = `Atención operativa ${runId}`;
  const employeeName = `Empleado operativo ${runId}`;
  const identities = await Promise.all([
    admin.auth.admin.createUser({ email: `admin-ui-${randomUUID()}@digraf.local`, password, email_confirm: true }),
    admin.auth.admin.createUser({ email: `admin-readonly-${randomUUID()}@digraf.local`, password, email_confirm: true }),
    admin.auth.admin.createUser({ email: `attention-ui-${randomUUID()}@digraf.local`, password, email_confirm: true }),
    admin.auth.admin.createUser({ email: `employee-ui-${randomUUID()}@digraf.local`, password, email_confirm: true }),
  ]);
  const users = identities.map(({ data, error }) => {
    if (error || !data.user) throw new Error("No se pudo crear identidad Admin E2E.");
    return data.user;
  });

  try {
    await admin.from("profiles").insert([
      { id: users[0].id, display_name: "Admin operativo E2E", role: "admin", is_active: true, must_change_password: false },
      { id: users[1].id, display_name: visibleAdminName, role: "admin", is_active: true, must_change_password: false },
      { id: users[2].id, display_name: attentionName, role: "attention", is_active: true, must_change_password: false },
      { id: users[3].id, display_name: employeeName, role: "employee", is_active: true, must_change_password: false },
    ]);

    await page.goto("/login");
    await page.getByLabel("Email").fill(users[0].email!);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/users");
    await expect(page.getByText(visibleAdminName)).toBeVisible();
    await expect(page.getByText(visibleAdminName).locator("xpath=ancestor::tr").getByText("Solo lectura")).toBeVisible();

    for (const name of [attentionName, employeeName]) {
      const row = page.getByText(name).locator("xpath=ancestor::tr");
      await row.getByRole("button", { name: "Desactivar", exact: true }).click();
      await expect(row.getByRole("button", { name: "Activar", exact: true })).toBeVisible();
      await row.getByRole("button", { name: "Activar", exact: true }).click();
      await expect(row.getByRole("button", { name: "Desactivar", exact: true })).toBeVisible();
    }
  } finally {
    await Promise.all(users.map((user) => admin.auth.admin.deleteUser(user.id)));
  }
});
