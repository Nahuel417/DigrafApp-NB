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
  const admin = createClient<Database>(url ?? "http://127.0.0.1:54396", serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const runId = randomUUID().slice(0, 8);
  const identities: Array<{ email: string; id: string; role: string }> = [];
  const orderIds: string[] = [];
  const catalogIds: string[] = [];
  const catalogProductIds: string[] = [];
  let catalog: { garmentUpper: string; garmentUpperProduct: string; neckline: string; upperPattern: string; fabric: string };
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
    if (kind === "garment") {
      const projection = await admin.from("catalog_products").select("id").eq("legacy_catalog_item_id", data.id).single();
      if (projection.error || !projection.data) throw projection.error ?? new Error("No se proyectó el catálogo E2E M5/M6.");
      catalogProductIds.push(projection.data.id);
    }
    return data.id;
  }

  async function createOrder(customerName: string) {
    const { data, error } = await admin
      .from("orders")
      .insert({
        customer_name: customerName,
        client_name: customerName,
        team_name: `Equipo ${customerName}`,
        phone: "3515550199",
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

    const { error: lineError } = await admin.from("order_lines").insert({
      order_id: data.id,
      position: 0,
      line_type: "individual",
      product_id: catalog.garmentUpperProduct,
      product_name_snapshot: "Remera",
      quantity: 4,
      configuration: {
        legacy_options: {
          neckline: { id: catalog.neckline, name: "Redondo" },
          upper_pattern: { id: catalog.upperPattern, name: "Recto" },
          fabric: { id: catalog.fabric, name: "Microfibra" },
          extras: [],
        },
      },
    });
    if (lineError) throw lineError;

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

    const garmentUpper = await createCatalog("garment", `Remera M5 M6 ${runId}`, "upper");
    const garmentUpperProduct = catalogProductIds.at(-1);
    if (!garmentUpperProduct) throw new Error("No se obtuvo la prenda proyectada M5/M6.");
    catalog = {
      garmentUpper,
      garmentUpperProduct,
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
      const lines = await admin.from("order_lines").select("id").in("order_id", orderIds);
      const lineIds = (lines.data ?? []).map((line) => line.id);
      if (lineIds.length) await cleanup("order_line_shields", admin.from("order_line_shields").delete().in("order_line_id", lineIds));
      await cleanup("order_lines", admin.from("order_lines").delete().in("order_id", orderIds));
      await cleanup("order_catalog_items", admin.from("order_catalog_items").delete().in("order_id", orderIds));
      await cleanup("order_financials", admin.from("order_financials").delete().in("order_id", orderIds));
      await cleanup("orders", admin.from("orders").delete().in("id", orderIds));
    }
    if (catalogProductIds.length) await cleanup("catalog_products", admin.from("catalog_products").delete().in("id", catalogProductIds));
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
    await expect(page.getByText(publicId(superAdminOrder), { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Volver al tablero" })).toHaveAttribute("href", "/orders");
  });

  test("Empleado abre una vista rápida operativa sin importes", async ({ page }) => {
    await login(page, identities[3]!);
    await page.goto("/orders");
    const card = page.getByText(`Empleado M5 M6 ${runId}`).locator("xpath=ancestor::article");
    await card.getByRole("button", { name: `Vista rápida de ${publicId(employeeOrder)}` }).click();
    const quickView = page.getByRole("dialog", { name: `Vista rápida de ${publicId(employeeOrder)}` });
    await expect(quickView).toBeVisible();
    await expect(quickView.getByRole("heading", { name: `Equipo Empleado M5 M6 ${runId}` })).toBeVisible();
    await expect(quickView.getByText("Último movimiento")).toBeVisible();
    await expect(quickView.getByRole("heading", { name: "Último comentario" })).toBeVisible();
    await expect(quickView.getByText("Total")).toHaveCount(0);
    await quickView.getByRole("button", { name: "Cerrar vista rápida" }).click();
    await expect(quickView).toHaveCount(0);
  });

  test("Super admin y Admin ven el formulario de edición completa", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, superAdminOrder);
    await page.getByRole("tab", { name: "Editar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Editar pedido" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Importes" })).toBeVisible();

    await page.getByRole("button", { name: "Salir" }).click();
    await login(page, identities[1]!);
    await navigateToDetail(page, adminOrder);
    await page.getByRole("tab", { name: "Editar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Editar pedido" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Importes" })).toBeVisible();
  });

  test("Atención puede editar y Empleado no recibe ese permiso", async ({ page }) => {
    await login(page, identities[2]!);
    await navigateToDetail(page, attentionOrder);
    await page.getByRole("tab", { name: "Editar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Editar pedido" })).toBeVisible();
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
    await expect(page.getByText("Saldo pendiente")).toHaveCount(0);
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

  test("todos los roles pueden crear comentarios y aparecen en Comentarios", async ({ page }) => {
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
    const comments = page.getByRole("heading", { name: "Comentarios" }).locator("xpath=ancestor::section");
    await expect(comments).toBeVisible();
    await expect(comments.getByText(`Comentario de super_admin ${runId}`, { exact: true })).toBeVisible();
  });

  test("Super admin puede editar campos sensibles y ve el cambio en el timeline", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, superAdminOrder);

    await page.getByRole("tab", { name: "Editar", exact: true }).click();
    const editSection = page.locator("#edit-order");
    await editSection.scrollIntoViewIfNeeded();
    const updatedCustomer = `Equipo actualizado ${runId}`;
    await editSection.locator("#edit-team-name").fill(updatedCustomer);
    await editSection.getByLabel("Cantidad").fill("8");
    await editSection.locator("#edit-promised-date").fill("2026-08-10");
    await editSection.getByRole("button", { name: "Guardar cambios" }).click();

    const confirmation = page.getByRole("alertdialog", { name: "Confirmar edición del pedido" });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Confirmar cambios" }).click();
    await expect(page.getByLabel("Notifications alt+T")).toContainText("Pedido actualizado.");

    await page.getByRole("tab", { name: "Detalles", exact: true }).click();
    const orderData = page.getByRole("heading", { name: "Datos generales" }).locator("xpath=ancestor::section");
    await expect(orderData.getByText(updatedCustomer)).toBeVisible();
    const timeline = page.getByRole("heading", { name: "Historial de etapas" }).locator("xpath=ancestor::section");
    await expect(timeline.getByText("Se actualizó el pedido", { exact: true }).first()).toBeVisible();
    await expect(timeline.getByText("Se actualizó la fecha prometida", { exact: true })).toBeVisible();
  });

  test("rechaza la edición cuando el pedido cambió en otra sesión", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, conflictOrder);

    await page.getByRole("tab", { name: "Editar", exact: true }).click();
    const editSection = page.locator("#edit-order");
    await editSection.scrollIntoViewIfNeeded();
    await expect(editSection).toBeVisible();

    const { error: updateError } = await admin
      .from("orders")
      .update({ customer_name: `Modificado externamente ${runId}`, updated_at: new Date().toISOString() })
      .eq("id", conflictOrder.id);
    if (updateError) throw updateError;

    await editSection.locator("#edit-client-name").fill(`Intento de edición ${runId}`);
    await editSection.getByRole("button", { name: "Guardar cambios" }).click();
    await page.getByRole("alertdialog", { name: "Confirmar edición del pedido" }).getByRole("button", { name: "Confirmar cambios" }).click();

    await expect(page.getByLabel("Notifications alt+T")).toContainText("El pedido cambió en otra sesión. Actualizalo e intentá nuevamente.");
    await expect(editSection.getByRole("alert").filter({ hasText: "El pedido cambió en otra sesión. Actualizalo e intentá nuevamente." })).toBeVisible();
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
    await expect(page.locator("#order-description")).toBeFocused();

    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("button", { name: "Editar descripción" })).toBeFocused();
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

      await page.getByRole("tab", { name: "Editar", exact: true }).click();
      await expect(page.locator("#edit-order")).toBeVisible();
      expect(await page.evaluate(() => window.location.hash)).toBe("");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      if (viewport.width >= 1024) {
        const scrollMetrics = await page.locator("#main-content").locator("..").evaluate((element) => {
          element.scrollTop = element.scrollHeight;
          return {
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            scrollTop: element.scrollTop,
          };
        });
        expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
        expect(scrollMetrics.scrollTop).toBeGreaterThan(0);
        expect(Math.abs(scrollMetrics.scrollHeight - scrollMetrics.clientHeight - scrollMetrics.scrollTop)).toBeLessThanOrEqual(1);
      }

      await page.getByRole("button", { name: "Salir" }).click();
    }
  });

  test("muestra estados de carga, error y éxito en comentarios", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, superAdminOrder);

    const commentField = page.getByLabel("Nuevo comentario");
    await page.getByRole("button", { name: "Publicar comentario" }).click();
    await expect(page.locator("#comment-body-error")).toHaveText("El comentario debe tener al menos 1 carácter.");
    await expect(commentField).toBeFocused();

    const commentText = `Test de estados ${runId}`;
    await commentField.fill(commentText);
    await page.getByRole("button", { name: "Publicar comentario" }).click();

    await expect(page.getByText(commentText).first()).toBeVisible();
    await expect(page.getByText("Comentario publicado.").first()).toBeVisible();
  });

  test("valida campos obligatorios en el formulario de edición", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, superAdminOrder);

    await page.getByRole("tab", { name: "Editar", exact: true }).click();
    const editSection = page.locator("#edit-order");
    await editSection.scrollIntoViewIfNeeded();
    const customerField = editSection.locator("#edit-client-name");
    await customerField.fill("");
    await editSection.getByLabel("Cantidad").fill("0");
    await editSection.getByRole("button", { name: "Guardar cambios" }).click();

    await expect(page.getByRole("alertdialog", { name: "Confirmar edición del pedido" })).toHaveCount(0);
    await expect(customerField).toBeFocused();
  });

  test("muestra el badge de etapa actual y el número de pedido formateado", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, superAdminOrder);

    await expect(page.getByText(publicId(superAdminOrder), { exact: true })).toBeVisible();
    await expect(page.getByText("Pedido recibido", { exact: true })).toBeVisible();
  });

  test("muestra las especificaciones del pedido con sus selecciones", async ({ page }) => {
    await login(page, identities[0]!);
    await navigateToDetail(page, superAdminOrder);

    const specs = page.getByRole("heading", { name: "Especificaciones" }).locator("xpath=ancestor::section");
    await expect(specs).toBeVisible();
    await expect(specs.getByText("Remera").first()).toBeVisible();
    await expect(specs.getByText("Redondo").first()).toBeVisible();
    await expect(specs.getByText("Microfibra").first()).toBeVisible();
  });

  test("Atención puede ver importes y editar campos sensibles", async ({ page }) => {
    await login(page, identities[2]!);
    await navigateToDetail(page, attentionOrder);

    const financials = page.getByRole("heading", { name: "Importes" }).locator("xpath=ancestor::section");
    await expect(financials).toBeVisible();
    await expect(financials.getByText("Total", { exact: true })).toBeVisible();
    await expect(financials.getByText("Seña", { exact: true })).toBeVisible();
    await expect(financials.getByText("Saldo pendiente", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Editar pedido" })).toBeVisible();
  });
});
