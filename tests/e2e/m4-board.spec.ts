import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = `M4${randomUUID().replaceAll("-", "")}7`;

test.describe("Tablero M4", () => {
  test.skip(!url || !serviceRoleKey || !publishableKey, "Falta Supabase local para E2E M4.");
  const admin = createClient<Database>(url ?? "http://127.0.0.1:54396", serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const runId = randomUUID().slice(0, 8);
  const email = `super-admin-m4-e2e-${randomUUID()}@digraf.local`;
  const names = {
    success: `Selector exitoso ${runId}`,
    conflict: `Selector conflicto ${runId}`,
    dnd: `DnD exitoso ${runId}`,
    dndConflict: `DnD conflicto ${runId}`,
    network: `Red desconocida ${runId}`,
    unconfirmed: `Estado no confirmado ${runId}`,
  };
  const orderIds: string[] = [];
  let userId = "";
  let stages: Record<string, string> = {};
  let successOrder: { id: string; publicNumber: number };
  let conflictOrder: { id: string; publicNumber: number };
  let dndOrder: { id: string; publicNumber: number };
  let dndConflictOrder: { id: string; publicNumber: number };
  let networkOrder: { id: string; publicNumber: number };
  let unconfirmedOrder: { id: string; publicNumber: number };

  async function createOrder(customerName: string) {
    const { data, error } = await admin
      .from("orders")
      .insert({
        customer_name: customerName,
        quantity: 2,
        order_type: "individual",
        order_date: "2026-07-29",
        promised_delivery_date: "2026-08-02",
        current_stage_id: stages.received,
        created_by: userId,
        idempotency_key: `m4-e2e-${randomUUID()}`,
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      })
      .select("id, public_number")
      .single();
    if (error || !data) throw error ?? new Error("No se pudo crear un pedido E2E M4.");
    orderIds.push(data.id);
    return { id: data.id, publicNumber: data.public_number };
  }

  function publicId(order: { publicNumber: number }) {
    return `PED-${String(order.publicNumber).padStart(6, "0")}`;
  }

  async function login(page: Page) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  async function beginPointerDrag(page: Page, handle: ReturnType<Page["locator"]>) {
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    if (!box) throw new Error("No se encontró el handle DnD.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 16, box.y + box.height / 2 + 16, { steps: 4 });
    await expect(page.getByTestId("drag-overlay")).toBeVisible();
  }

  async function dropOn(page: Page, target: ReturnType<Page["locator"]>) {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("No se encontró el destino DnD.");
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 120), { steps: 8 });
    await page.mouse.up();
  }

  test.beforeAll(async () => {
    const { data: auth, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (authError || !auth.user) throw authError ?? new Error("No se creó el Super admin E2E M4.");
    userId = auth.user.id;
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      display_name: `Super admin M4 ${runId}`,
      role: "super_admin",
      is_active: true,
      must_change_password: false,
    });
    if (profileError) throw profileError;

    const { data: stageRows, error: stageError } = await admin.from("workflow_stages").select("id, code");
    if (stageError) throw stageError;
    stages = Object.fromEntries(stageRows.map((stage) => [stage.code, stage.id]));
    successOrder = await createOrder(names.success);
    conflictOrder = await createOrder(names.conflict);
    dndOrder = await createOrder(names.dnd);
    dndConflictOrder = await createOrder(names.dndConflict);
    networkOrder = await createOrder(names.network);
    unconfirmedOrder = await createOrder(names.unconfirmed);
  });

  test.afterAll(async () => {
    const failures: string[] = [];
    async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await operation;
      if (error) failures.push(`${label}: ${error.message}`);
    }

    if (orderIds.length) {
      await cleanup("order_stage_events", admin.from("order_stage_events").delete().in("order_id", orderIds));
      await cleanup("orders", admin.from("orders").delete().in("id", orderIds));
    }
    if (userId) await cleanup("auth user", admin.auth.admin.deleteUser(userId));
    if (failures.length) throw new Error(`Falló el cleanup E2E M4:\n${failures.join("\n")}`);
  });

  test("muestra ocho etapas, conteos correctos y mueve mediante selector", async ({ page }) => {
    await login(page);
    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "Tablero de pedidos" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(8);
    await expect(page.getByLabel("Tablero de pedidos").getByRole("link", { name: "Nuevo pedido" })).toBeVisible();

    const successCard = page.getByText(names.success).locator("xpath=ancestor::article");
    await successCard.getByLabel(`Mover ${publicId(successOrder)} a`).click();
    await page.getByRole("option", { name: "Diseño", exact: true }).click();
    await successCard.getByRole("button", { name: "Mover pedido" }).click();

    const designColumn = page.getByRole("heading", { name: "Diseño", exact: true }).locator("xpath=ancestor::section");
    await expect(designColumn.getByText(names.success)).toBeVisible();
    await expect(page.getByText(names.success, { exact: true })).toHaveCount(1);
  });

  test("excluye Pagado, reconcilia un conflicto y permite reintentar", async ({ page }) => {
    await login(page);
    await page.goto("/orders");

    const conflictCard = page.getByText(names.conflict).locator("xpath=ancestor::article");
    await conflictCard.getByLabel(`Mover ${publicId(conflictOrder)} a`).click();
    await expect(page.getByRole("option", { name: "Pagado", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");

    const { error: updateError } = await admin
      .from("orders")
      .update({ current_stage_id: stages.cut, updated_at: new Date().toISOString() })
      .eq("id", conflictOrder.id);
    if (updateError) throw updateError;

    await conflictCard.getByLabel(`Mover ${publicId(conflictOrder)} a`).click();
    await page.getByRole("option", { name: "Diseño", exact: true }).click();
    await conflictCard.getByRole("button", { name: "Mover pedido" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "El pedido cambió en otra sesión" })).toBeVisible();

    const cutColumn = page.getByRole("heading", { name: "Corte", exact: true }).locator("xpath=ancestor::section");
    await expect(cutColumn.getByText(names.conflict)).toBeVisible();
    const reconciledCard = cutColumn.getByText(names.conflict).locator("xpath=ancestor::article");
    await reconciledCard.getByLabel(`Mover ${publicId(conflictOrder)} a`).click();
    await page.getByRole("option", { name: "Diseño", exact: true }).click();
    await reconciledCard.getByRole("button", { name: "Mover pedido" }).click();
    await expect(page.getByRole("heading", { name: "Diseño", exact: true }).locator("xpath=ancestor::section").getByText(names.conflict)).toBeVisible();
  });

  test("DnD comparte éxito, no-op, rechazo de Pagado, anuncios, Escape y foco", async ({ page }) => {
    await login(page);
    await page.goto("/orders");

    const handleName = `Arrastrar ${publicId(dndOrder)}`;
    let handle = page.getByRole("button", { name: handleName });
    await beginPointerDrag(page, handle);
    await dropOn(page, page.locator('[data-drop-stage="design"] header'));
    const designColumn = page.locator('[data-drop-stage="design"]');
    await expect(designColumn.getByText(names.dnd)).toBeVisible();
    await expect(page.getByTestId("board-announcement")).toContainText("se movió de Pedido recibido a Diseño");
    handle = designColumn.getByRole("button", { name: handleName });
    await expect(handle).toBeFocused();

    const { count: eventsBeforeNoop } = await admin.from("order_stage_events").select("id", { count: "exact", head: true }).eq("order_id", dndOrder.id);
    await beginPointerDrag(page, handle);
    await dropOn(page, designColumn.locator("header"));
    await expect(page.getByTestId("board-announcement")).toContainText("permanece en Diseño");
    const { count: eventsAfterNoop } = await admin.from("order_stage_events").select("id", { count: "exact", head: true }).eq("order_id", dndOrder.id);
    expect(eventsAfterNoop).toBe(eventsBeforeNoop);

    await beginPointerDrag(page, handle);
    await dropOn(page, page.locator('[data-drop-stage="paid"]'));
    await expect(page.getByRole("alert").filter({ hasText: "Los movimientos hacia o desde Pagado" })).toBeVisible();
    await expect(page.getByTestId("board-announcement")).toContainText("no se movió");
    await expect(designColumn.getByText(names.dnd)).toBeVisible();

    handle = designColumn.getByRole("button", { name: handleName });
    await beginPointerDrag(page, handle);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.getByTestId("board-announcement")).toContainText("Cancelaste el movimiento");
    await expect(designColumn.getByText(names.dnd)).toBeVisible();
    await expect(handle).toBeFocused();
  });

  test("DnD se activa desde la superficie no interactiva de la tarjeta", async ({ page }) => {
    await login(page);
    await page.goto("/orders");

    const card = page.getByText(names.success).locator("xpath=ancestor::article");
    await beginPointerDrag(page, card.locator("dl"));
    await dropOn(page, page.locator('[data-drop-stage="cut"] header'));
    await expect(page.locator('[data-drop-stage="cut"]').getByText(names.success)).toBeVisible();
  });

  test("DnD revierte al estado canónico tras conflicto y permite reintentar", async ({ page }) => {
    await login(page);
    await page.goto("/orders");

    const handleName = `Arrastrar ${publicId(dndConflictOrder)}`;
    const staleHandle = page.getByRole("button", { name: handleName });
    const { error: updateError } = await admin
      .from("orders")
      .update({ current_stage_id: stages.cut, updated_at: new Date().toISOString() })
      .eq("id", dndConflictOrder.id);
    if (updateError) throw updateError;

    await beginPointerDrag(page, staleHandle);
    await dropOn(page, page.locator('[data-drop-stage="design"] header'));
    await expect(page.getByRole("alert").filter({ hasText: "El pedido cambió en otra sesión" })).toBeVisible();
    const cutColumn = page.locator('[data-drop-stage="cut"]');
    await expect(cutColumn.getByText(names.dndConflict)).toBeVisible();
    const reconciledHandle = cutColumn.getByRole("button", { name: handleName });
    await expect(reconciledHandle).toBeFocused();

    await beginPointerDrag(page, reconciledHandle);
    await dropOn(page, page.locator('[data-drop-stage="design"] header'));
    await expect(page.locator('[data-drop-stage="design"]').getByText(names.dndConflict)).toBeVisible();
  });

  test("reconcilia la etapa canónica cuando se pierde la respuesta después del commit", async ({ page }) => {
    await login(page);
    await page.goto("/orders");

    let moveActionId: string | undefined;
    let reconciliationRequested = false;
    await page.route("**/orders", async (route) => {
      const request = route.request();
      const actionId = request.headers()["next-action"];
      if (request.method() === "POST" && actionId) {
        if (!moveActionId) {
          moveActionId = actionId;
          await route.fetch();
          await route.fulfill({ status: 502, contentType: "text/plain", body: "Respuesta de movimiento perdida." });
          return;
        }
        if (actionId === moveActionId) {
          await route.fulfill({ status: 502, contentType: "text/plain", body: "Respuesta de movimiento perdida." });
          return;
        }
        reconciliationRequested = true;
      }
      await route.continue();
    });

    const card = page.getByText(names.network).locator("xpath=ancestor::article");
    await card.getByLabel(`Mover ${publicId(networkOrder)} a`).click();
    await page.getByRole("option", { name: "Diseño", exact: true }).click();
    await card.getByRole("button", { name: "Mover pedido" }).click();

    await expect(page.getByTestId("board-announcement")).toContainText(/se confirmó en Diseño|se movió de Pedido recibido a Diseño/);
    await expect(page.locator('[data-drop-stage="design"]').getByText(names.network)).toBeVisible();
    expect(reconciliationRequested).toBe(true);
    const { data: events, error: eventsError } = await admin
      .from("order_stage_events")
      .select("from_stage_id, to_stage_id")
      .eq("order_id", networkOrder.id);
    expect(eventsError).toBeNull();
    expect(events).toEqual([{ from_stage_id: stages.received, to_stage_id: stages.design }]);
  });

  test("informa estado no confirmado si tampoco puede reconciliarse", async ({ page }) => {
    await login(page);
    await page.goto("/orders");

    let actionRequests = 0;
    await page.route("**/orders", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        actionRequests += 1;
        if (actionRequests === 1) {
          await route.fetch();
          await route.abort("failed");
        } else {
          await route.abort("failed");
        }
        return;
      }
      await route.continue();
    });

    const card = page.getByText(names.unconfirmed).locator("xpath=ancestor::article");
    await card.getByLabel(`Mover ${publicId(unconfirmedOrder)} a`).click();
    await page.getByRole("option", { name: "Diseño", exact: true }).click();
    await card.getByRole("button", { name: "Mover pedido" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Estado no confirmado" })).toBeVisible();
    await expect(page.getByTestId("board-announcement")).toContainText("Recargá el tablero");
  });

  test("mantiene un único enlace activo en una ruta anidada", async ({ page }) => {
    await login(page);
    await page.goto("/orders/new");

    const navigationName = (page.viewportSize()?.width ?? 0) < 1024
      ? "Navegación principal móvil"
      : "Navegación principal";
    const activeLinks = page.getByRole("navigation", { name: navigationName, exact: true }).locator('a[aria-current="page"]');
    await expect(activeLinks).toHaveCount(1);
    await expect(activeLinks).toHaveAttribute("href", "/orders/new");
  });

  test("mantiene selector, contenido y overflow controlado en responsive, zoom y forced colors", async ({ page }) => {
    await login(page);
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/orders");
      await expect(page.getByRole("heading", { name: "Tablero de pedidos" })).toBeVisible();
      await expect(page.getByLabel(/Mover PED-\d{6} a/).first()).toBeVisible();
      expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
    }

    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    await expect(page.getByRole("heading", { name: "Tablero de pedidos" })).toBeVisible();
    expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: /Arrastrar PED-/ }).first()).toBeVisible();
  });
});
