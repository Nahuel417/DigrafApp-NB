import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = `M15E2E${randomUUID().replaceAll("-", "")}7`;

type Role = Database["public"]["Enums"]["app_role"];
type Identity = { email: string; id: string; role: Role };

test.describe("Anulación, Archivo y restauración M15", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!url || !serviceRoleKey || !publishableKey, "Falta Supabase local para E2E M15.");

  const service = createClient<Database>(url ?? "http://127.0.0.1:54396", serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const orderIds: string[] = [];
  let admin: Identity;
  let superAdmin: Identity;
  let employee: Identity;
  let order: { id: string; publicNumber: number; updatedAt: string; customerName: string };
  let receivedStageId = "";

  async function createIdentity(role: Role) {
    const email = `${role}-m15-e2e-${randomUUID()}@digraf.local`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error(`No se pudo crear la identidad M15 ${role}.`);
    const identity = { email, id: data.user.id, role };
    const { error: profileError } = await service.from("profiles").insert({ id: identity.id, display_name: `M15 E2E ${role}`, role, is_active: true, must_change_password: false });
    if (profileError) throw profileError;
    identities.push(identity);
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
    const { data: stage, error: stageError } = await service.from("workflow_stages").select("id").eq("code", "received").single();
    if (stageError || !stage) throw stageError ?? new Error("No se encontró Pedido recibido para E2E M15.");
    receivedStageId = stage.id;
    admin = await createIdentity("admin");
    superAdmin = await createIdentity("super_admin");
    employee = await createIdentity("employee");
    const customerName = `Cliente M15 E2E ${randomUUID().slice(0, 8)}`;
    const { data: created, error } = await service.from("orders").insert({
      customer_name: customerName,
      quantity: 2,
      order_type: "individual",
      order_date: "2026-08-14",
      promised_delivery_date: "2026-08-20",
      current_stage_id: receivedStageId,
      created_by: admin.id,
      idempotency_key: `m15-e2e-${randomUUID()}`,
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    }).select("id, public_number, updated_at").single();
    if (error || !created) throw error ?? new Error("No se creó el pedido E2E M15.");
    orderIds.push(created.id);
    const { error: financialError } = await service.from("order_financials").insert({ order_id: created.id, total_amount: 1250, deposit_amount: 0, deposit_paid: false });
    if (financialError) throw financialError;
    const { data: line, error: lineError } = await service.from("order_lines").insert({
      order_id: created.id,
      position: 0,
      line_type: "individual",
      product_name_snapshot: "Prenda histórica E2E",
      quantity: 2,
      configuration: { source: "m15-e2e" },
    }).select("id").single();
    if (lineError || !line) throw lineError ?? new Error("No se creó la especificación E2E M15.");
    const { error: shieldError } = await service.from("order_line_shields").insert({
      order_line_id: line.id,
      shield_name_snapshot: "Escudo histórico E2E",
      position: 0,
    });
    if (shieldError) throw shieldError;
    const objectPath = `orders/${created.id}/${randomUUID()}.png`;
    const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const { error: uploadError } = await service.storage.from("order-designs").upload(objectPath, imageBytes, { contentType: "image/png", upsert: false });
    if (uploadError) throw uploadError;
    const { error: imageError } = await service.from("order_design_images").insert({
      order_id: created.id,
      object_path: objectPath,
      content_type: "image/png",
      byte_size: imageBytes.byteLength,
      uploaded_by: admin.id,
      is_primary: true,
    });
    if (imageError) throw imageError;
    order = { id: created.id, publicNumber: created.public_number, updatedAt: created.updated_at, customerName };
  });

  test.afterAll(async () => {
    for (const orderId of orderIds) {
      await service.from("order_financials").delete().eq("order_id", orderId);
      await service.from("orders").delete().eq("id", orderId);
    }
    for (const identity of identities) await service.auth.admin.deleteUser(identity.id);
  });

  test("Admin anula y consulta Archivo con confirmación explícita", async ({ page }) => {
    await login(page, admin);
    await page.goto(`/orders/${order.id}`);
    await page.getByRole("button", { name: "Anular pedido" }).click();
    const cancelDialog = page.getByRole("alertdialog", { name: `Anular PED-${String(order.publicNumber).padStart(6, "0")}` });
    await expect(cancelDialog).toContainText("se conservará en el Archivo");
    await cancelDialog.getByLabel("Motivo de anulación").fill("Cliente pidió pausa");
    await cancelDialog.getByRole("button", { name: "Confirmar anulación" }).click();
    await expect(page.getByText("Anulado", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restaurar pedido" })).toBeVisible();

    await page.goto("/orders/archive");
    await expect(page.getByRole("heading", { name: "Archivo de pedidos" })).toBeVisible();
    await expect(page.getByText(order.customerName, { exact: true })).toBeVisible();
    const archiveCard = page.getByRole("listitem").filter({ hasText: order.customerName });
    await expect(archiveCard.getByRole("button", { name: "Restaurar pedido" })).toBeVisible();
    await archiveCard.getByRole("link", { name: `PED-${String(order.publicNumber).padStart(6, "0")}` }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
    await expect(page.getByRole("heading", { name: `PED-${String(order.publicNumber).padStart(6, "0")}` })).toBeVisible();
    const specifications = page.locator("[data-order-specifications]");
    await expect(specifications.getByText("Prenda histórica E2E", { exact: true })).toBeVisible();
    await expect(specifications.getByText("Escudo histórico E2E", { exact: true })).toBeVisible();
    await expect(page.getByText("Se anuló el pedido", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "Diseño vigente del pedido" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Editar pedido" })).toHaveCount(0);
    await expect(page.getByLabel("Archivo de diseño")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Eliminar diseño" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Reemplazar diseño/ })).toHaveCount(0);
  });

  test("Super admin abre el detalle histórico desde Archivo", async ({ page }) => {
    await login(page, superAdmin);
    await page.goto("/orders/archive");
    const archiveCard = page.getByRole("listitem").filter({ hasText: order.customerName });
    await archiveCard.getByRole("link", { name: `PED-${String(order.publicNumber).padStart(6, "0")}` }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
    await expect(page.locator("[data-order-specifications]").getByText("Prenda histórica E2E", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restaurar pedido" })).toBeVisible();
  });

  test("Empleado no puede filtrar un pedido anulado por acceso directo", async ({ page }) => {
    await login(page, employee);
    await page.goto(`/orders/${order.id}`);
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByText(order.customerName, { exact: true })).toHaveCount(0);
  });

  test("Admin restaura el pedido desde Archivo", async ({ page }) => {
    await login(page, admin);
    await page.goto("/orders/archive");
    const archiveCard = page.getByRole("listitem").filter({ hasText: order.customerName });
    await archiveCard.getByRole("button", { name: "Restaurar pedido" }).click();
    const restoreDialog = page.getByRole("alertdialog", { name: `Restaurar PED-${String(order.publicNumber).padStart(6, "0")}` });
    await restoreDialog.getByRole("button", { name: "Confirmar restauración" }).click();
    await expect(archiveCard).toHaveCount(0);
    await page.goto(`/orders/${order.id}`);
    await expect(page.getByRole("button", { name: "Anular pedido" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Editar pedido" })).toBeVisible();
    await expect(page.getByText("Se restauró el pedido", { exact: true })).toBeVisible();
    await expect(page.locator("[data-order-specifications]").getByText("Prenda histórica E2E", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Eliminar diseño" })).toBeVisible();
  });
});
