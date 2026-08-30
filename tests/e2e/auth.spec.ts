import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const runId = randomUUID().replaceAll("-", "");
const temporaryPassword = `Temporary${runId}7`;
const updatedPassword = `Updated${runId}8`;

function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Falta configurar Supabase para los recorridos E2E.");
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createSyntheticUser(isActive = true) {
  const admin = createAdminClient();
  const email = `auth-e2e-${randomUUID()}@digraf.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`No se pudo crear el usuario E2E: ${error?.message ?? "error desconocido"}`);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    role: "super_admin",
    is_active: isActive,
    must_change_password: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`No se pudo crear el perfil E2E: ${profileError.message}`);
  }

  return {
    email,
    async cleanup() {
      await admin.auth.admin.deleteUser(data.user.id);
    },
  };
}

test("requires changing the temporary password before entering the app", async ({ page }) => {
  const user = await createSyntheticUser();

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Contraseña").fill(temporaryPassword);
    await page.getByRole("button", { name: "Ingresar" }).click();

    await expect(page).toHaveURL(/\/change-password$/);
    await page.getByLabel("Nueva contraseña", { exact: true }).fill(updatedPassword);
    await page.getByLabel("Repetí la nueva contraseña", { exact: true }).fill(updatedPassword);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Panel general" })).toBeVisible();
    await expect(page.getByText("Contraseña actualizada. Tu acceso ya está habilitado.")).toBeVisible();

    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Sesión cerrada correctamente.")).toBeVisible();
  } finally {
    await user.cleanup();
  }
});

test("associates validation errors with login fields", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("email-invalido");
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Ingresá un email válido.").first()).toBeVisible();
  await expect(page.getByLabel("Contraseña")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Ingresá tu contraseña.").first()).toBeVisible();
});

test("rejects a new password without a number", async ({ page }) => {
  const user = await createSyntheticUser();

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Contraseña").fill(temporaryPassword);
    await page.getByRole("button", { name: "Ingresar" }).click();

    await page.getByLabel("Nueva contraseña", { exact: true }).fill("SoloLetras");
    await page.getByLabel("Repetí la nueva contraseña", { exact: true }).fill("SoloLetras");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();

    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByText("La contraseña debe incluir al menos un número.").first()).toBeVisible();
  } finally {
    await user.cleanup();
  }
});

test("blocks an inactive user even with valid credentials", async ({ page }) => {
  const user = await createSyntheticUser(false);

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Contraseña").fill(temporaryPassword);
    await page.getByRole("button", { name: "Ingresar" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Tu cuenta no tiene acceso a Digraf.").first()).toBeVisible();
  } finally {
    await user.cleanup();
  }
});
