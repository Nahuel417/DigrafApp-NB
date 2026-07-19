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
  const newUserName = `Operario de prueba ${randomUUID().slice(0, 8)}`;
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

    await page.getByLabel("Nombre descriptivo").fill(newUserName);
    await page.getByLabel("Email").last().fill(newUserEmail);
    await page.getByLabel("Contraseña temporal", { exact: true }).fill(`Temp${randomUUID().replaceAll("-", "")}7`);
    const createForm = page.getByRole("heading", { name: "Nuevo usuario" }).locator("xpath=ancestor::form");
    await createForm.getByRole("combobox", { name: "Rol" }).click();
    await page.getByRole("option", { name: "Admin", exact: true }).click();
    await page.getByRole("button", { name: "Crear usuario" }).click();
    await expect(page.getByRole("alertdialog", { name: "Confirmar creación de usuario" })).toBeVisible();
    await expect(page.getByRole("alertdialog")).toContainText(`${newUserName} (${newUserEmail})`);
    await expect(page.getByRole("alertdialog")).toContainText("rol Admin");
    await page.getByRole("button", { name: "Confirmar creación" }).click();
    await expect(page.getByText("Usuario creado. Comunicá la contraseña temporal por un canal seguro.").first()).toBeVisible();
    await expect(page.getByText(newUserName).first()).toBeVisible();
    await expect(createForm.getByRole("combobox", { name: "Rol" })).toHaveText("Empleado");

    const row = page.getByText(newUserName).locator("xpath=ancestor::tr");
    await row.getByRole("combobox", { name: `Rol de ${newUserName}` }).click();
    await page.getByRole("option", { name: "Atención" }).click();
    await row.getByRole("button", { name: `Guardar rol de ${newUserName}` }).click();
    await expect(page.getByRole("alertdialog", { name: "Confirmar cambio de rol" })).toBeVisible();
    await page.getByRole("button", { name: "Confirmar cambio" }).click();
    await expect(page.getByText("Rol actualizado correctamente.").first()).toBeVisible();

    await row.getByLabel(`Nueva contraseña temporal para ${newUserName}`).fill(`Reset${randomUUID().replaceAll("-", "")}8`);
    await row.getByRole("button", { name: `Restablecer contraseña de ${newUserName}` }).click();
    await expect(page.getByRole("alertdialog", { name: "Confirmar restablecimiento" })).toBeVisible();
    await page.getByRole("button", { name: "Confirmar restablecimiento" }).click();
    await expect(page.getByText("Contraseña restablecida. Comunicá la temporal por un canal seguro.").first()).toBeVisible();
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
      const deactivate = row.getByRole("button", { name: `Desactivar a ${name}` });
      await deactivate.click();
      await expect(page.getByRole("alertdialog", { name: "Desactivar usuario" })).toBeVisible();

      if (name === attentionName) {
        await page.getByRole("button", { name: "Cancelar" }).click();
        await expect(deactivate).toBeFocused();
        await deactivate.click();
      }

      await page.getByRole("button", { name: "Confirmar desactivación" }).click();
      const activate = row.getByRole("button", { name: `Activar a ${name}` });
      await expect(activate).toBeVisible();
      await expect(activate).toBeFocused();
      await activate.click();
      await expect(page.getByRole("alertdialog", { name: "Activar usuario" })).toBeVisible();
      await page.getByRole("button", { name: "Confirmar activación" }).click();
      await expect(row.getByRole("button", { name: `Desactivar a ${name}` })).toBeVisible();
    }
  } finally {
    await Promise.all(users.map((user) => admin.auth.admin.deleteUser(user.id)));
  }
});
