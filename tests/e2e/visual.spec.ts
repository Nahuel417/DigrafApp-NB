import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const email = "visual-e2e@digraf.local";
const password = "VisualE2E2026";
const changePasswordEmail = "visual-password-e2e@digraf.local";
const temporaryPassword = "VisualTemporary2026";
const longEmail = `visual-${"contenido".repeat(5)}@digraf.local`;
const longName = "NombreOperativoSinEspacios".repeat(4).slice(0, 100);

function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Falta configurar Supabase para las pruebas visuales.");
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function deleteVisualUsers() {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emails = new Set([email, changePasswordEmail, longEmail]);
  await Promise.all(data.users.filter((candidate) => candidate.email && emails.has(candidate.email)).map((user) => admin.auth.admin.deleteUser(user.id)));
}

async function createVisualUser(userEmail: string, userPassword: string, displayName: string, mustChangePassword: boolean) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: userEmail,
    password: userPassword,
    email_confirm: true,
  });

  if (error || !data.user) throw new Error(`No se pudo crear el usuario visual ${userEmail}.`);

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    display_name: displayName,
    role: "super_admin",
    is_active: true,
    must_change_password: mustChangePassword,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`No se pudo crear el perfil visual E2E: ${profileError.message}`);
  }
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function waitForVisualStability(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: "nextjs-portal, [data-sonner-toaster] { display: none !important; }" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

test.describe("referencia visual", () => {
  test.beforeAll(async () => {
    await deleteVisualUsers();
    await createVisualUser(email, password, "Administración visual", false);
    await createVisualUser(changePasswordEmail, temporaryPassword, "Cambio de contraseña visual", true);
    await createVisualUser(longEmail, password, longName, false);
  });

  test.afterAll(async () => {
    await deleteVisualUsers();
  });

  test("login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Ingresar" })).toBeVisible();
    await waitForVisualStability(page);
    await expect(page).toHaveScreenshot("login.png", { animations: "disabled", caret: "initial", fullPage: true });
  });

  test("panel", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Panel general" })).toBeVisible();
    await waitForVisualStability(page);
    await expect(page).toHaveScreenshot("dashboard.png", { animations: "disabled", caret: "initial", fullPage: true });
  });

  test("cambio de contraseña", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(changePasswordEmail);
    await page.getByLabel("Contraseña").fill(temporaryPassword);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/change-password$/);
    await page.goto("/change-password");
    await waitForVisualStability(page);
    await expect(page).toHaveScreenshot("change-password.png", { animations: "disabled", caret: "initial", fullPage: true });
  });

  test("usuarios", async ({ page }) => {
    await login(page);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
    await waitForVisualStability(page);
    await expect(page.getByRole("heading", { name: "Nuevo usuario" }).locator("xpath=ancestor::form")).toHaveScreenshot(
      "create-user.png",
      { animations: "disabled", caret: "initial" },
    );
    await expect(page.locator("tbody tr").filter({ hasText: "Administración visual" })).toHaveScreenshot(
      "managed-user.png",
      { animations: "disabled", caret: "initial" },
    );
    await page.getByRole("button", { name: "Desactivar a Administración visual" }).click();
    await expect(page.getByRole("alertdialog", { name: "Desactivar usuario" })).toHaveScreenshot(
      "deactivate-user-dialog.png",
      { animations: "disabled", caret: "initial" },
    );
    await page.getByRole("button", { name: "Cancelar" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("responsive, contenido largo y teclado", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "La matriz de viewports se ejecuta una sola vez.");
    await login(page);

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/users");
      await expect(page.getByText(longEmail)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const longRow = page.getByText(longEmail).locator("xpath=ancestor::tr");
    const deactivateButton = longRow.getByRole("button", { name: `Desactivar a ${longName}` });
    const buttonBox = await deactivateButton.boundingBox();
    expect(buttonBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.goto("/dashboard");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(skipLink).toBeFocused();
    await skipLink.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });
});
