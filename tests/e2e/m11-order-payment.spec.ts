import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = `M11E2E${randomUUID().replaceAll("-", "")}7`;

type Role = Database["public"]["Enums"]["app_role"];
type Identity = { email: string; id: string; role: Role; displayName: string };
type Order = { id: string; publicNumber: number; updatedAt: string; customerName: string };

function publicId(order: Pick<Order, "publicNumber">) {
  return `PED-${String(order.publicNumber).padStart(6, "0")}`;
}

test.describe("Pago M11 desde Kanban", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!url || !serviceRoleKey || !publishableKey, "Falta Supabase local para E2E M11.");

  const admin = createClient<Database>(url ?? "http://127.0.0.1:54396", serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const runId = randomUUID().slice(0, 8);
  const identities: Identity[] = [];
  const orderIds: string[] = [];
  let receivedStageId = "";
  let authorized: Identity;
  let employee: Identity;
  let authorizedOrder: Order;
  let employeeOrder: Order;

  async function createIdentity(role: Role) {
    const email = `${role}-m11-e2e-${randomUUID()}@digraf.local`;
    const displayName = `M11 ${role} ${runId}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error(`No se creó la identidad E2E M11 para ${role}.`);

    const identity = { email, id: data.user.id, role, displayName };
    const { error: profileError } = await admin.from("profiles").insert({
      id: identity.id,
      display_name: identity.displayName,
      role,
      is_active: true,
      must_change_password: false,
    });
    if (profileError) throw profileError;
    identities.push(identity);
    return identity;
  }

  async function createOrder(customerName: string, createdBy: string) {
    const { data, error } = await admin
      .from("orders")
      .insert({
        customer_name: customerName,
        quantity: 2,
        order_type: "individual",
        order_date: "2026-08-01",
        promised_delivery_date: "2026-08-10",
        current_stage_id: receivedStageId,
        created_by: createdBy,
        idempotency_key: `m11-e2e-${randomUUID()}`,
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      })
      .select("id, public_number, updated_at")
      .single();
    if (error || !data) throw error ?? new Error("No se creó el pedido E2E M11.");
    orderIds.push(data.id);

    const { error: financialError } = await admin.from("order_financials").insert({
      order_id: data.id,
      total_amount: 0,
      deposit_amount: 0,
      deposit_paid: false,
    });
    if (financialError) throw financialError;

    return { id: data.id, publicNumber: data.public_number, updatedAt: data.updated_at, customerName };
  }

  async function login(page: Page, identity: Identity) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(identity.email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  async function openPaymentDialog(page: Page, order: Order) {
    const card = page.getByText(order.customerName, { exact: true }).locator("xpath=ancestor::article");
    await card.locator("details").locator("summary").click();
    await card.getByLabel(`Mover ${publicId(order)} a`).click();
    await page.getByRole("option", { name: "Pagado", exact: true }).click();
    await card.getByRole("button", { name: "Mover pedido" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Confirmar cobro" });
    await expect(dialog).toBeVisible();
    return { card, dialog };
  }

  async function cleanupOrder(orderId: string) {
    const { data: payments, error: paymentsError } = await admin.from("order_payments").select("id, cash_movement_id").eq("order_id", orderId);
    if (paymentsError) throw paymentsError;
    const paymentIds = (payments ?? []).map((payment) => payment.id);
    const movementIds = (payments ?? []).flatMap((payment) => payment.cash_movement_id ? [payment.cash_movement_id] : []);

    if (paymentIds.length) {
      const { error } = await admin.from("order_payment_events").delete().in("order_payment_id", paymentIds);
      if (error) throw error;
    }
    if (movementIds.length) {
      const { error } = await admin.from("cash_movements").delete().in("id", movementIds);
      if (error) throw error;
    }
    const { error: paymentError } = await admin.from("order_payments").delete().eq("order_id", orderId);
    if (paymentError) throw paymentError;
    const { error: stageError } = await admin.from("order_stage_events").delete().eq("order_id", orderId);
    if (stageError) throw stageError;
    const { error: financialError } = await admin.from("order_financials").delete().eq("order_id", orderId);
    if (financialError) throw financialError;
    const { error: orderError } = await admin.from("orders").delete().eq("id", orderId);
    if (orderError) throw orderError;
  }

  test.beforeAll(async () => {
    const { data: stage, error: stageError } = await admin.from("workflow_stages").select("id").eq("code", "received").single();
    if (stageError || !stage) throw stageError ?? new Error("No se encontró Pedido recibido para E2E M11.");
    receivedStageId = stage.id;

    authorized = await createIdentity("attention");
    employee = await createIdentity("employee");
    authorizedOrder = await createOrder(`Cliente autorizado M11 ${runId}`, authorized.id);
    employeeOrder = await createOrder(`Cliente empleado M11 ${runId}`, employee.id);
  });

  test.afterAll(async () => {
    const failures: string[] = [];
    for (const orderId of orderIds) {
      try {
        await cleanupOrder(orderId);
      } catch (error) {
        failures.push(`pedido ${orderId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    for (const identity of identities) {
      const { error } = await admin.auth.admin.deleteUser(identity.id);
      if (error) failures.push(`usuario ${identity.role}: ${error.message}`);
    }
    if (failures.length) throw new Error(`Falló el cleanup E2E M11:\n${failures.join("\n")}`);
  });

  test("rol autorizado confirma desde el diálogo y ve el pago en el pedido", async ({ page }) => {
    await login(page, authorized);
    await page.goto("/orders");

    const { dialog } = await openPaymentDialog(page, authorizedOrder);
    await expect(dialog).toContainText(publicId(authorizedOrder));
    await expect(dialog).toContainText(authorizedOrder.customerName);
    await expect(dialog).toContainText("Importe total");
    await expect(dialog).toContainText("$ 0,00");
    await expect(dialog).toContainText("Destino");
    await expect(dialog).toContainText("Pagado");

    await dialog.getByRole("button", { name: "Confirmar cobro", exact: true }).click();
    await expect(page.getByTestId("board-announcement")).toContainText(`${publicId(authorizedOrder)} quedó confirmado como Pagado.`);

    const paidColumn = page.locator('[data-drop-stage="paid"]');
    await expect(paidColumn.getByText(authorizedOrder.customerName, { exact: true })).toBeVisible();
    await paidColumn.getByRole("link", { name: authorizedOrder.customerName, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${authorizedOrder.id}$`));

    const timeline = page.getByRole("heading", { name: "Historial" }).locator("xpath=ancestor::section");
    const paymentEvent = timeline.getByText("Pago confirmado", { exact: true }).locator("xpath=ancestor::li");
    await expect(paymentEvent).toBeVisible();
    await expect(paymentEvent.getByText(authorized.displayName, { exact: true })).toBeVisible();
  });

  test("employee ve Pagado pero no tiene destino ni acción de cobro", async ({ page }) => {
    await login(page, employee);
    await page.goto("/orders");

    const paidColumn = page.locator('[data-drop-stage="paid"]');
    await expect(paidColumn.getByText(authorizedOrder.customerName, { exact: true })).toBeVisible();

    const card = page.getByText(employeeOrder.customerName, { exact: true }).locator("xpath=ancestor::article");
    await card.locator("details").locator("summary").click();
    const selector = card.getByLabel(`Mover ${publicId(employeeOrder)} a`);
    await selector.click();
    await expect(page.getByRole("option", { name: "Pagado", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(card.getByRole("button", { name: "Mover pedido" })).toBeDisabled();
    await expect(card).toBeVisible();
    await expect(paidColumn.getByText(employeeOrder.customerName, { exact: true })).toHaveCount(0);
  });
});
