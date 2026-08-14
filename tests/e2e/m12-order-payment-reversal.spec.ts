import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = `M12E2E${randomUUID().replaceAll("-", "")}7`;

type Role = Database["public"]["Enums"]["app_role"];
type Identity = { email: string; id: string; role: Role; displayName: string };
type Order = { id: string; publicNumber: number; updatedAt: string; customerName: string; paymentId?: string };
type SignedClient = SupabaseClient<Database>;

function publicId(order: Pick<Order, "publicNumber">) {
  return `PED-${String(order.publicNumber).padStart(6, "0")}`;
}

test.describe("Reversión de pago M12", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!url || !serviceRoleKey || !publishableKey, "Falta Supabase local para E2E M12.");

  const service = createClient<Database>(url ?? "http://127.0.0.1:54396", serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const runId = randomUUID().slice(0, 8);
  const identities: Identity[] = [];
  const orderIds: string[] = [];
  let receivedStageId = "";
  let admin: Identity;
  let attention: Identity;
  let order: Order;

  async function createIdentity(role: Role) {
    const email = `${role}-m12-e2e-${randomUUID()}@digraf.local`;
    const displayName = `M12 ${role} ${runId}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error(`No se creó la identidad E2E M12 para ${role}.`);
    const identity = { email, id: data.user.id, role, displayName };
    const { error: profileError } = await service.from("profiles").insert({ id: identity.id, display_name: displayName, role, is_active: true, must_change_password: false });
    if (profileError) throw profileError;
    identities.push(identity);
    return identity;
  }

  async function signedClient(identity: Identity): Promise<SignedClient> {
    const client = createClient<Database>(url ?? "http://127.0.0.1:54396", publishableKey ?? "test-key", { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email: identity.email, password });
    if (error) throw error;
    return client;
  }

  async function ensureOpen() {
    const client = await signedClient(attention);
    const { data, error } = await client.rpc("get_current_cash_summary");
    if (error || !data?.[0]) throw error ?? new Error("No se pudo consultar la caja E2E M12.");
    if (data[0].closed_at) {
      const reopened = await client.rpc("reopen_cash_day", { p_cash_day_id: data[0].cash_day_id, p_reason: "Preparación E2E M12", p_idempotency_key: `m12-e2e-open-${randomUUID()}` });
      if (reopened.error) throw reopened.error;
    }
  }

  async function createOrder() {
    const customerName = `Cliente M12 ${runId}`;
    const { data, error } = await service.from("orders").insert({
      customer_name: customerName,
      quantity: 2,
      order_type: "individual",
      order_date: "2026-08-13",
      promised_delivery_date: "2026-08-14",
      current_stage_id: receivedStageId,
      created_by: admin.id,
      idempotency_key: `m12-e2e-${randomUUID()}`,
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    }).select("id, public_number, updated_at").single();
    if (error || !data) throw error ?? new Error("No se creó el pedido E2E M12.");
    orderIds.push(data.id);
    const { error: financialError } = await service.from("order_financials").insert({ order_id: data.id, total_amount: 125.5, deposit_amount: 0, deposit_paid: false });
    if (financialError) throw financialError;
    return { id: data.id, publicNumber: data.public_number, updatedAt: data.updated_at, customerName };
  }

  async function confirmPayment() {
    const client = await signedClient(attention);
    const result = await client.rpc("confirm_order_payment", { p_order_id: order.id, p_expected_updated_at: order.updatedAt, p_idempotency_key: `m12-e2e-confirm-${randomUUID()}` });
    if (result.error || !result.data?.[0]) throw result.error ?? new Error("No se pudo confirmar el pago E2E M12.");
    return { ...order, updatedAt: result.data[0].updated_at, paymentId: result.data[0].payment_id };
  }

  async function login(page: Page, identity: Identity) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(identity.email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  async function openQuickView(page: Page) {
    const card = page.getByText(order.customerName, { exact: true }).locator("xpath=ancestor::article");
    await card.getByRole("button", { name: `Vista rápida de ${publicId(order)}` }).click();
    const panel = page.getByRole("complementary", { name: publicId(order) });
    await expect(panel).toBeVisible();
    return panel;
  }

  async function cleanup() {
    for (const orderId of orderIds) {
      const { data: payments } = await service.from("order_payments").select("id, cash_movement_id, reversal_cash_movement_id").eq("order_id", orderId);
      const paymentIds = (payments ?? []).map((payment) => payment.id);
      const movementIds = (payments ?? []).flatMap((payment) => [payment.cash_movement_id, payment.reversal_cash_movement_id].filter((id): id is string => Boolean(id)));
      if (paymentIds.length) await service.from("order_payment_events").delete().in("order_payment_id", paymentIds);
      if (movementIds.length) await service.from("cash_movement_events").delete().in("movement_id", movementIds);
      if (paymentIds.length) await service.from("order_payments").delete().in("id", paymentIds);
      if (movementIds.length) await service.from("cash_movements").delete().in("id", movementIds);
      await service.from("order_stage_events").delete().eq("order_id", orderId);
      await service.from("order_financials").delete().eq("order_id", orderId);
      await service.from("orders").delete().eq("id", orderId);
    }
    for (const identity of identities) {
      await service.from("profiles").delete().eq("id", identity.id);
      await service.auth.admin.deleteUser(identity.id);
    }
  }

  test.beforeAll(async () => {
    const { data: stage, error } = await service.from("workflow_stages").select("id").eq("code", "received").single();
    if (error || !stage) throw error ?? new Error("No se encontró Pedido recibido para E2E M12.");
    receivedStageId = stage.id;
    admin = await createIdentity("admin");
    attention = await createIdentity("attention");
    await ensureOpen();
    order = await createOrder();
    order = await confirmPayment();
  });

  test.afterAll(cleanup);

  test("Admin descubre, cancela y confirma la reversión con etapa e historial actualizados", async ({ page }) => {
    await login(page, admin);
    await page.goto("/orders");
    let panel = await openQuickView(page);
    await expect(panel.getByRole("button", { name: "Revertir pago", exact: true })).toBeVisible();

    await panel.getByRole("button", { name: "Revertir pago", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Revertir pago" });
    await expect(dialog).toContainText("no elimina el historial");
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const { data: unchanged } = await service.from("orders").select("current_stage_id").eq("id", order.id).single();
    const { data: activePayment } = await service.from("order_payments").select("reversed_at").eq("id", order.paymentId!).single();
    const { data: paidStage } = await service.from("workflow_stages").select("id").eq("code", "paid").single();
    expect(unchanged?.current_stage_id).toBe(paidStage?.id);
    expect(activePayment?.reversed_at).toBeNull();

    panel = await openQuickView(page);
    await panel.getByRole("button", { name: "Revertir pago", exact: true }).click();
    await page.getByRole("alertdialog", { name: "Revertir pago" }).getByRole("button", { name: "Revertir pago", exact: true }).click();
    await expect(page.locator('[data-drop-stage="received"]').getByText(order.customerName, { exact: true })).toBeVisible();

    await page.goto(`/orders/${order.id}`);
    await expect(page.getByText("Pedido recibido", { exact: true }).first()).toBeVisible();
    const timeline = page.getByRole("heading", { name: "Historial" }).locator("xpath=ancestor::section");
    await expect(timeline.getByText("Pago revertido", { exact: true })).toBeVisible();
  });
});
