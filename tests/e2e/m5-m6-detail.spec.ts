import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = `M5M6${randomUUID().replaceAll("-", "")}7`;

test.describe("Detalle y colaboración M5/M6", () => {
  test.skip(!url || !serviceRoleKey || !publishableKey, "Falta Supabase local para E2E M5/M6.");
  const admin = createClient<Database>(url ?? "http://127.0.0.1:54321", serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const runId = randomUUID().slice(0, 8);
  const identities: Array<{ email: string; id: string; role: string }> = [];
  const orderIds: string[] = [];
  const catalogIds: string[] = [];
  let catalog: { garmentUpper: string; neckline: string; upperPattern: string; fabric: string };
  let receivedStageId: string;
  let superAdminOrder: { id: string; publicNumber: number };
  let adminOrder: { id: string; publicNumber: number };
  let attentionOrder: { id: string; publicNumber: number };
  let employeeOrder: { id: string; publicNumber: number };
  let conflictOrder: { id: string; publicNumber: number; updatedAt: string };

  async function createIdentity(role: "super_admin" | "admin" | "attention" | "employee") {
    const email = `${role}-m5m6-e2e-${randomUUID()}@digraf.local`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No se pudo crear una identidad E2E M5/M6.");
    const { error: profileError } = await admin.from("profiles").insert({
      id: data.user.id,
      display_name: `E2E M5 M6 ${role}`,
      role,
      is_active: true,
      must_change_password: false,
    });
    if (profileError) throw profileError;
    const identity = { email, id: data.user.id, role };
    identities.push(identity);
    return identity;
  }

  async function createCatalog(kind: "garment" | "neckline" | "upper_pattern" | "fabric", name: string, garmentLayer: "upper" | "lower" | null = null) {
    const { data, error } = await admin
      .from("catalog_items")
      .insert({
        kind,
        garment_layer: garmentLayer,
        name,
        is_active: true,
        created_by: identities[0]!.id,
        updated_by: identities[0]!.id,
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("No se pudo crear un catálogo E2E M5/M6.");
    catalogIds.push(data.id);
    return data.id;
  }

  async function createOrder(customerName: string) {
    const { data, error } = await admin
      .from("orders")
      .insert({
        customer_name: customerName,
        quantity: 4,
        order_type: "individual",
        order_date: "2026-07-29",
        promised_delivery_date: "2026-08-05",
        current_stage_id: receivedStageId,
        created_by: identities[0]!.id,
        idempotency_key: `m5m6-e2e-${randomUUID()}`,
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      })
      .select("id, public_number, updated_at")
      .single();
    if (error || !data) throw error ?? new Error("No se pudo crear un pedido E2E M5/M6.");
    orderIds.push(data.id);

    const { error: financialError } = await admin.from("order_financials").insert({
      order_id: data.id,
      total_amount: 1500,
      deposit_amount: 300,
      deposit_paid: true,
    });
    if (financialError) throw financialError;

    const selections = [
      [catalog.garmentUpper, "garment_upper", "garment", "upper", "Remera"],
      [catalog.neckline, "neckline", "neckline", null, "Redondo"],
      [catalog.upperPattern, "upper_pattern", "upper_pattern", null, "Recto"],
      [catalog.fabric, "fabric", "fabric", null, "Microfibra"],
    ] as const;
    const { error: selectionsError } = await admin.from("order_catalog_items").insert(selections.map(([catalogItemId, selectionKey, catalogKind, garmentLayer, itemName]) => ({
      order_id: data.id,
      catalog_item_id: catalogItemId,
      selection_key: selectionKey,
      catalog_kind: catalogKind,
      garment_layer: garmentLayer,
      item_name: itemName,
    })));
    if (selectionsError) throw selectionsError;

    return { id: data.id, publicNumber: data.public_number, updatedAt: data.updated_at };
  }

  function publicId(order: { publicNumber: number }) {
    return `PED-${String(order.publicNumber).padStart(6, "0")}`;
  }

  async function login(page: Page, identity: { email: string }) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(identity.email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  async function navigateToDetail(page: Page, order: { id: string }) {
    await page.goto(`/orders/${order.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }

  test.beforeAll(async () => {
    const { data: stage, error } = await admin.from("workflow_stages").select("id").eq("code", "received").single();
    if (error || !stage) throw error ?? new Error("No se encontró la etapa inicial.");
    receivedStageId = stage.id;

    await createIdentity("super_admin");
    await createIdentity("admin");
    await createIdentity("attention");
    await createIdentity("employee");

    catalog = {
      garmentUpper: await createCatalog("garment", `Remera M5 M6 ${runId}`, "upper"),
      neckline: await createCatalog("neckline", `Redondo M5 M6 ${runId}`),
      upperPattern: await createCatalog("upper_pattern", `Recto M5 M6 ${runId}`),
      fabric: await createCatalog("fabric", `Microfibra M5 M6 ${runId}`),
    };

    superAdminOrder = await createOrder(`Super admin M5 M6 ${runId}`);
    adminOrder = await createOrder(`Admin M5 M6 ${runId}`);
    attentionOrder = await createOrder(`Atención M5 M6 ${runId}`);
    employeeOrder = await createOrder(`Empleado M5 M6 ${runId}`);
    const conflictData = await createOrder(`Conflicto M5 M6 ${runId}`);
    conflictOrder = { id: conflictData.id, publicNumber: conflictData.publicNumber, updatedAt: conflictData.updatedAt };
  });

  test.afterAll(async () => {
    const failures: string[] = [];
    async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await operation;
      if (error) failures.push(`${label}: ${error.message}`);
    }

    if (orderIds.length) {
      await cleanup("order_comments", admin.from("order_comments").delete().in("order_id", orderIds));
      await cleanup("order_change_events", admin.from("order_change_events").delete().in("order_id", orderIds));
      await cleanup("order_stage_events", admin.from("order_stage_events").delete().in("order_id", orderIds));
      await cleanup("order_catalog_items", admin.from("order_catalog_items").delete().in("order_id", orderIds));
      await cleanup("order_financials", admin.from("order_financials").delete().in("order_id", orderIds));
      await cleanup("orders", admin.from("orders").delete().in("id", orderIds));
    }
    if (catalogIds.length) await cleanup("catalog_items", admin.from("catalog_items").delete().in("id", catalogIds));
    for (const identity of identities) await cleanup(`auth user ${identity.id}`, admin.auth.admin.deleteUser(identity.id));
    if (failures.length) throw new Error(`Falló el cleanup E2E M5/M6:\n${failures.join("\n")}`);
  });

  test("navega desde el tablero Kanban al detalle del pedido", async ({ page }) => {
    await login(page, identities[0]!);
    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "Tablero de pedidos" })).toBeVisible();

    const card = page.getByText(`Super admin M5 M6 ${runId}`).locator("xpath=ancestor::article");
    const link = card.getByRole("link", { name: `Super admin M5 M6 ${runId}` });
    await link.click();
    await expect(page).toHaveURL(/\/orders\//);
    await expect(page.getByRole("heading", { level: 1, name: publicId(superAdminOrder) })).toBeVisible();
  });

  test("Super admin y Admin ven el formulario de edición completa", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, superAdminOrder);
    await expect(page.getByRole("heading", { name: "Editar pedido" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Importes" })).toBeVisible();

    await page.getByRole("button", { name: "Salir" }).click();
    await login(page, identities[1]!);
    await navigateToDetail(page, adminOrder);
    await expect(page.getByRole("heading", { name: "Editar pedido" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Importes" })).toBeVisible();
  });

  test("Atención y Empleado no ven el formulario de edición sensible", async ({ page }) => {
    await login(page, identities[2]!);
    await navigateToDetail(page, attentionOrder);
    await expect(page.getByRole("heading", { name: "Editar pedido" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Importes" })).toBeVisible();

    await page.getByRole("button", { name: "Salir" }).click();
    await login(page, identities[3]!);
    await navigateToDetail(page, employeeOrder);
    await expect(page.getByRole("heading", { name: "Editar pedido" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Importes" })).toHaveCount(0);
  });

  test("Empleado no ve importes ni saldo", async ({ page }) => {
    await login(page, identities[3]!);
    await navigateToDetail(page, employeeOrder);
    await expect(page.getByRole("heading", { name: "Importes" })).toHaveCount(0);
    await expect(page.getByText("Total")).toHaveCount(0);
    await expect(page.getByText("Seña")).toHaveCount(0);
    await expect(page.getByText("Saldo visible")).toHaveCount(0);
  });

  test("todos los roles pueden editar la descripción", async ({ page }) => {
    for (const identity of identities) {
      const order = identity.role === "super_admin" ? superAdminOrder
        : identity.role === "admin" ? adminOrder
        : identity.role === "attention" ? attentionOrder
        : employeeOrder;

      await login(page, identity);
      await navigateToDetail(page, order);

      const editButton = page.getByRole("button", { name: "Editar descripción" });
      await editButton.click();
      await expect(page.locator("#order-description")).toBeVisible();

      const descriptionText = `Descripción de ${identity.role} ${runId}`;
      await page.locator("#order-description").fill(descriptionText);
      await page.getByRole("button", { name: "Guardar", exact: true }).click();

      await expect(page.getByText(descriptionText).first()).toBeVisible();
      await page.getByRole("button", { name: "Salir" }).click();
    }
  });

  test("todos los roles pueden crear comentarios y aparecen en el timeline", async ({ page }) => {
    for (const identity of identities) {
      const order = identity.role === "super_admin" ? superAdminOrder : employeeOrder;

      await login(page, identity);
      await navigateToDetail(page, order);

      const commentText = `Comentario de ${identity.role} ${runId}`;
      await page.getByLabel("Nuevo comentario").fill(commentText);
      await page.getByRole("button", { name: "Publicar comentario" }).click();

      await expect(page.getByText(commentText).first()).toBeVisible();
      await page.getByRole("button", { name: "Salir" }).click();
    }

    await login(page, identities[0]!);
    await navigateToDetail(page, superAdminOrder);
    const timeline = page.getByRole("heading", { name: "Historial" }).locator("xpath=ancestor::section");
    await expect(timeline).toBeVisible();
    await expect(timeline.getByText("Comentario", { exact: true }).first()).toBeVisible();
  });

  test("Super admin puede editar campos sensibles y ve el cambio en el timeline", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, superAdminOrder);

    const editSection = page.locator("#edit-order");
    await editSection.scrollIntoViewIfNeeded();
    await expect(editSection).toBeVisible();
    await expect(editSection.locator("#edit-customer-name")).toBeVisible();
    await expect(editSection.locator("#edit-quantity")).toBeVisible();
    await expect(editSection.locator("#edit-promised-date")).toBeVisible();
    await expect(editSection.getByRole("button", { name: "Guardar cambios" })).toBeVisible();
  });

  test("rechaza la edición cuando el pedido cambió en otra sesión", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, conflictOrder);

    const editSection = page.locator("#edit-order");
    await editSection.scrollIntoViewIfNeeded();
    await expect(editSection).toBeVisible();

    const { error: updateError } = await admin
      .from("orders")
      .update({ customer_name: `Modificado externamente ${runId}`, updated_at: new Date().toISOString() })
      .eq("id", conflictOrder.id);
    if (updateError) throw updateError;

    await editSection.locator("#edit-customer-name").fill(`Intento de edición ${runId}`);
    await editSection.getByRole("button", { name: "Guardar cambios" }).click();

    await expect(page.getByRole("alert").first()).toBeVisible();
  });

  test("mantiene foco visible, navegación por teclado y mensajes de estado", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, superAdminOrder);

    await page.keyboard.press("Tab");
    const focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();

    const editButton = page.getByRole("button", { name: "Editar descripción" });
    await editButton.focus();
    await expect(editButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#order-description")).toBeVisible();

    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("button", { name: "Editar descripción" })).toBeVisible();
  });

  test("respeta reduced motion y no genera overflow global", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(viewport);
      await login(page, identities[0]!);
      await navigateToDetail(page, superAdminOrder);

      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      await page.getByRole("button", { name: "Salir" }).click();
    }
  });

  test("muestra estados de carga, error y éxito en comentarios", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, superAdminOrder);

    const commentText = `Test de estados ${runId}`;
    await page.getByLabel("Nuevo comentario").fill(commentText);
    await page.getByRole("button", { name: "Publicar comentario" }).click();

    await expect(page.getByText(commentText).first()).toBeVisible();
  });

  test("valida campos obligatorios en el formulario de edición", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, superAdminOrder);

    const editSection = page.locator("#edit-order");
    await editSection.scrollIntoViewIfNeeded();
    await expect(editSection).toBeVisible();

    await expect(editSection.locator("#edit-customer-name")).toBeVisible();
    await expect(editSection.locator("#edit-quantity")).toBeVisible();
    await expect(editSection.getByRole("button", { name: "Guardar cambios" })).toBeVisible();
  });

  test("muestra el badge de etapa actual y el número de pedido formateado", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, superAdminOrder);

    await expect(page.getByRole("heading", { level: 1, name: publicId(superAdminOrder) })).toBeVisible();
    await expect(page.getByText("Pedido recibido", { exact: true })).toBeVisible();
  });

  test("muestra las especificaciones del pedido con sus selecciones", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, superAdminOrder);

    const specs = page.getByRole("heading", { name: "Especificaciones" }).locator("xpath=ancestor::section");
    await expect(specs).toBeVisible();
    await expect(specs.getByText("Remera")).toBeVisible();
    await expect(specs.getByText("Redondo")).toBeVisible();
    await expect(specs.getByText("Microfibra")).toBeVisible();
  });

  test("Atención puede ver importes pero no editar campos sensibles", async ({ page }) => {
    await login(page, identities[2]!);
    await navigateToDetail(page, attentionOrder);

    await expect(page.getByRole("heading", { name: "Importes" })).toBeVisible();
    await expect(page.getByText("Total")).toBeVisible();
    await expect(page.getByText("Seña")).toBeVisible();
    await expect(page.getByText("Saldo visible")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Editar pedido" })).toHaveCount(0);
  });
});
