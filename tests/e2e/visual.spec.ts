import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const email = "visual-e2e@digraf.local";
const password = "VisualE2E2026";
const changePasswordEmail = "visual-password-e2e@digraf.local";
const temporaryPassword = "VisualTemporary2026";
const longEmail = `visual-${"contenido".repeat(5)}@digraf.local`;
const longName = "NombreOperativoSinEspacios".repeat(4).slice(0, 100);
let visualOrderId = "";

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

  return data.user.id;
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
  await page.addStyleTag({
    content: `
      nextjs-portal, [data-sonner-toaster] { display: none !important; }
      @media (max-width: 1023px) { header.sticky { position: static !important; } }
    `,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function isolateVisualOrder(page: Page) {
  await page.locator("[data-order-id]").evaluateAll((cards, expectedOrderId) => {
    for (const card of cards) {
      if (card.getAttribute("data-order-id") !== expectedOrderId) {
        (card as HTMLElement).style.display = "none";
      }
    }
  }, visualOrderId);
  await page.locator("[data-drop-stage]").evaluateAll((columns) => {
    for (const column of columns) {
      const visibleOrders = [...column.querySelectorAll<HTMLElement>("[data-order-id]")]
        .filter((card) => card.style.display !== "none").length;
      const count = column.querySelector<HTMLElement>("[data-stage-count]");
      if (count) count.textContent = String(visibleOrders);
    }
  });
  await page.locator("[data-board-count]").evaluate((count) => { count.textContent = "1 pedido en seguimiento"; });
}

test.describe("referencia visual", () => {
  test.skip(process.platform === "linux", "Los snapshots visuales se validan únicamente en Windows y macOS.");

  test.beforeAll(async () => {
    await deleteVisualUsers();
    const visualUserId = await createVisualUser(email, password, "Administración visual", false);
    await createVisualUser(changePasswordEmail, temporaryPassword, "Cambio de contraseña visual", true);
    await createVisualUser(longEmail, password, longName, false);

    const admin = createAdminClient();
    const { data: receivedStage, error: stageError } = await admin.from("workflow_stages").select("id").eq("code", "received").single();
    if (stageError) throw stageError;
    const { data: order, error: orderError } = await admin.from("orders").insert({
      customer_name: "Equipo visual del taller",
      quantity: 18,
      order_type: "set",
      order_date: "2026-07-29",
      promised_delivery_date: "2026-08-08",
      current_stage_id: receivedStage.id,
      created_by: visualUserId,
      idempotency_key: "visual-m4-order",
      idempotency_fingerprint: "visualm4order".padEnd(32, "0"),
    }).select("id").single();
    if (orderError || !order) throw orderError ?? new Error("No se pudo crear el pedido visual M4.");
    visualOrderId = order.id;
  });

  test.afterAll(async () => {
    if (visualOrderId) {
      const admin = createAdminClient();
      await admin.from("order_stage_events").delete().eq("order_id", visualOrderId);
      await admin.from("orders").delete().eq("id", visualOrderId);
    }
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

  test("tablero de pedidos", async ({ page }, testInfo) => {
    await login(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "Tablero de pedidos" })).toBeVisible();
    await waitForVisualStability(page);
    await isolateVisualOrder(page);
    await expect(page.getByLabel("Tablero de pedidos")).toHaveScreenshot(
      `order-board-${testInfo.project.name}-desktop.png`,
      { animations: "disabled", caret: "initial" },
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/orders");
    await waitForVisualStability(page);
    await isolateVisualOrder(page);
    await expect(page).toHaveScreenshot(`order-board-${testInfo.project.name}-mobile.png`, { animations: "disabled", caret: "initial", fullPage: true });
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
    const managedUserRow = page.locator("tbody tr").filter({ hasText: "Administración visual" });
    await managedUserRow.getByRole("button", { name: "Gestionar" }).click();
    await expect(managedUserRow).toHaveScreenshot(
      "managed-user.png",
      { animations: "disabled", caret: "initial" },
    );
    await managedUserRow.getByRole("button", { name: "Desactivar a Administración visual" }).click();
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
    await longRow.getByRole("button", { name: "Gestionar" }).click();
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
