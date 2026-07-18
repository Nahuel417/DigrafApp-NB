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
    await expect(page.getByText("Operario de prueba")).toBeVisible();
  } finally {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const created = users.users.find((user) => user.email === newUserEmail);
    if (created) await admin.auth.admin.deleteUser(created.id);
    await admin.auth.admin.deleteUser(data.user.id);
  }
});
