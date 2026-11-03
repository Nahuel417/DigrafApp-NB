import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
const password = `StockE2E${randomUUID().replaceAll("-", "")}7`;
const runId = randomUUID().slice(0, 8);
const fabricName = `Tela stock E2E ${runId}`;
const openingDate = stockDateDaysAgo(2);
const purchaseDate = stockDateDaysAgo(1);

type Role = Database["public"]["Enums"]["app_role"];
type Identity = { email: string; id: string; role: Role };

function stockDateDaysAgo(days: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day") - days)).toISOString().slice(0, 10);
}

function displayDate(value: string) {
  return value.split("-").reverse().join("/");
}

test.describe("Stock de telas", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!url || !serviceRoleKey || !publishableKey, "Falta Supabase local para E2E de stock.");

  const service = createClient<Database>(url ?? "http://127.0.0.1:54396", serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  let admin: Identity;
  let attention: Identity;
  let employee: Identity;
  let itemId = "";

  async function createIdentity(role: Role) {
    const email = `stock-e2e-${role}-${randomUUID()}@example.test`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error(`No se creó la identidad E2E de stock para ${role}.`);

    const identity = { email, id: data.user.id, role };
    identities.push(identity);
    const { error: profileError } = await service.from("profiles").insert({
      id: identity.id,
      display_name: `Stock E2E ${role} ${runId}`,
      role,
      is_active: true,
      must_change_password: false,
    });
    if (profileError) throw profileError;
    return identity;
  }

  async function login(page: Page, identity: Identity) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(identity.email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  test.beforeAll(async () => {
    admin = await createIdentity("admin");
    attention = await createIdentity("attention");
    employee = await createIdentity("employee");
  });

  test.afterAll(async () => {
    const failures: string[] = [];
    const found = await service.from("stock_items").select("id").eq("name", fabricName).maybeSingle();
    if (found.error) failures.push(`tela: ${found.error.message}`);
    itemId ||= found.data?.id ?? "";

    if (itemId) {
      for (const table of ["stock_movement_cancellations", "stock_purchase_prices", "stock_movements", "stock_item_events", "stock_requests"] as const) {
        const { error } = await service.from(table).delete().eq("item_id", itemId);
        if (error) failures.push(`${table}: ${error.message}`);
      }
      const { error } = await service.from("stock_items").delete().eq("id", itemId);
      if (error) failures.push(`stock_items: ${error.message}`);
    }

    for (const identity of identities) {
      const { error: profileError } = await service.from("profiles").delete().eq("id", identity.id);
      if (profileError) failures.push(`perfil ${identity.role}: ${profileError.message}`);
      const { error } = await service.auth.admin.deleteUser(identity.id);
      if (error) failures.push(`usuario ${identity.role}: ${error.message}`);
    }
    if (failures.length) throw new Error(`Falló el cleanup E2E de stock:\n${failures.join("\n")}`);
  });

  test("Admin agrega material con precio y usa el formulario adaptativo sin mostrar el historial completo", async ({ page }) => {
    await login(page, admin);
    await page.goto("/stock");
    await expect(page.getByRole("heading", { name: "Stock", exact: true })).toBeVisible();

    await page.getByLabel("Nombre del material").fill(fabricName);
    await page.getByLabel("Cantidad (rollos)", { exact: true }).fill("1.5");
    await page.getByLabel("Precio por rollo (ARS)").fill("50,75");
    await page.getByLabel("Fecha", { exact: true }).fill(openingDate);
    await page.getByRole("button", { name: "Agregar material", exact: true }).click();
    const createDialog = page.getByRole("alertdialog", { name: "Agregar material" });
    await expect(createDialog).toContainText(fabricName);
    await createDialog.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(page.getByText("Material agregado correctamente.")).toBeVisible();
    await expect(page.locator("form p[role='status']")).toHaveCount(0);

    const found = await service.from("stock_items").select("id").eq("name", fabricName).single();
    if (found.error || !found.data) throw found.error ?? new Error("No se encontró la tela creada por la interfaz.");
    itemId = found.data.id;
    await page.getByText(fabricName, { exact: true }).click();
    await expect(page.getByText(`Fecha: ${displayDate(openingDate)}`, { exact: true })).toBeVisible();
    await expect(page.getByText("Precio por rollo: $ 50,75", { exact: true })).toBeVisible();

    await page.getByLabel("Cantidad comprada (rollos)").fill("0.5");
    await page.getByLabel("Fecha de compra", { exact: true }).fill(purchaseDate);
    await page.getByRole("region", { name: "Compras y consumo", exact: true }).getByLabel("Precio por rollo (ARS)").fill("1234.50");
    await page.getByRole("button", { name: "Registrar compra", exact: true }).click();
    const purchaseDialog = page.getByRole("alertdialog", { name: "Registrar compra" });
    await expect(purchaseDialog).toContainText("La compra no modifica Caja.");
    await purchaseDialog.getByRole("button", { name: "Confirmar", exact: true }).click();

    await expect(page.getByText("Saldo: 2 rollos", { exact: true })).toBeVisible();
    await expect(page.getByText(`Fecha: ${displayDate(purchaseDate)}`, { exact: true })).toBeVisible();
    await expect(page.getByText("Precio por rollo: $ 1.234,50", { exact: true })).toBeVisible();

    const movementType = page.getByRole("combobox", { name: "Tipo de movimiento" });
    await movementType.click();
    await page.getByRole("option", { name: "Consumo" }).click();
    await page.getByLabel("Cantidad consumida (rollos)").fill("0.5");
    await page.getByLabel("Fecha de salida", { exact: true }).fill(purchaseDate);
    await expect(page.getByText(/Efecto en saldo: −0,5 rollos/)).toBeVisible();
    await page.getByRole("button", { name: "Registrar salida", exact: true }).click();
    const consumptionDialog = page.getByRole("alertdialog", { name: "Registrar salida" });
    await expect(consumptionDialog).toContainText("La salida no modifica Caja ni pedidos.");
    await consumptionDialog.getByRole("button", { name: "Confirmar", exact: true }).click();

    await expect(page.getByText("Saldo: 1,5 rollos", { exact: true })).toBeVisible();
    await expect(page.getByText(`Fecha: ${displayDate(openingDate)}`, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Páginas del historial" })).toHaveCount(0);
    const latestMovements = page.locator('section[aria-labelledby="stock-history-heading"] ol > li');
    await expect(latestMovements).toHaveCount(2);
    await expect(latestMovements.nth(0)).toContainText("Salida");
    await expect(latestMovements.nth(1)).toContainText("Compra");
    await expect(page.getByText(`Fecha: ${displayDate(purchaseDate)}`, { exact: true })).toHaveCount(2);
  });

  for (const identityName of ["attention", "employee"] as const) {
    test(`${identityName} consulta cantidades y fechas sin recibir precios ni acciones`, async ({ page }) => {
      const identity = identityName === "attention" ? attention : employee;
      await login(page, identity);
      await page.goto(`/stock?item=${itemId}`);

      await expect(page.getByRole("heading", { name: fabricName, exact: true })).toBeVisible();
      await expect(page.getByText("Saldo: 1,5 rollos", { exact: true })).toBeVisible();
      await expect(page.getByText(`Fecha: ${displayDate(openingDate)}`, { exact: true })).toHaveCount(0);
      const history = page.locator('section[aria-labelledby="stock-history-heading"]');
      const latestMovements = history.locator("ol > li");
      await expect(latestMovements).toHaveCount(2);
      await expect(latestMovements.nth(0)).toContainText("Salida");
      await expect(latestMovements.nth(1)).toContainText("Compra");
      await expect(history.getByText(`Fecha: ${displayDate(purchaseDate)}`, { exact: true })).toHaveCount(2);
      await expect(page.getByText("Precio por rollo:")).toHaveCount(0);
      await expect(page.getByRole("combobox", { name: "Tipo de movimiento" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Registrar salida", exact: true })).toHaveCount(0);
    });
  }
});
