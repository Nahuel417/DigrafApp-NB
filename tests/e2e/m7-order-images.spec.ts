import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const localUrl = url ?? "http://127.0.0.1:54396";
const password = `M7UI${randomUUID().replaceAll("-", "")}7`;
const bucketId = "order-designs";

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function createPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.from([0, 42, 112, 52, 255]))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const pngBytes = createPng();

type Role = Database["public"]["Enums"]["app_role"];
type Identity = { email: string; id: string; role: Role };

test.describe("Diseño vigente M7", () => {
  test.skip(!url || !serviceRoleKey || !publishableKey, "Falta Supabase local para E2E M7.");

  const service = createClient<Database>(localUrl, serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const orderIds: string[] = [];
  const objectPaths: string[] = [];
  let receivedStageId: string;

  async function createIdentity(role: Role) {
    const email = `${role}-m7-ui-${randomUUID()}@digraf.local`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No se pudo crear una identidad E2E M7.");
    const { error: profileError } = await service.from("profiles").insert({
      id: data.user.id,
      display_name: `M7 UI ${role}`,
      role,
      is_active: true,
      must_change_password: false,
    });
    if (profileError) throw profileError;
    const identity = { email, id: data.user.id, role };
    identities.push(identity);
    return identity;
  }

  async function signedClient(identity: Identity): Promise<SupabaseClient<Database>> {
    const client = createClient<Database>(localUrl, publishableKey ?? "test-key", { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email: identity.email, password });
    if (error) throw error;
    return client;
  }

  async function createOrder(label: string) {
    const { data, error } = await service.from("orders").insert({
      customer_name: `${label} ${randomUUID().slice(0, 8)}`,
      quantity: 1,
      order_type: "individual",
      order_date: "2026-08-03",
      promised_delivery_date: "2026-08-04",
      current_stage_id: receivedStageId,
      created_by: identities[0]!.id,
      idempotency_key: `m7-ui-${randomUUID()}`,
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    }).select("id").single();
    if (error || !data) throw error ?? new Error("No se pudo crear un pedido E2E M7.");
    orderIds.push(data.id);
    return data.id;
  }

  async function seedImage(orderId: string, identity = identities[0]!) {
    const client = await signedClient(identity);
    const objectPath = `orders/${orderId}/${randomUUID()}.png`;
    const upload = await client.storage.from(bucketId).upload(objectPath, pngBytes, { contentType: "image/png", upsert: false });
    if (upload.error) throw upload.error;
    objectPaths.push(objectPath);
    const finalized = await service.rpc("finalize_order_design_image", {
      p_actor_id: identity.id,
      p_order_id: orderId,
      p_object_path: objectPath,
      p_idempotency_key: randomUUID(),
    });
    if (finalized.error) throw finalized.error;
  }

  async function seedImageCollection(orderId: string, count = 3, identity = identities[0]!) {
    const client = await signedClient(identity);
    for (let index = 0; index < count; index += 1) {
      const objectPath = `orders/${orderId}/${randomUUID()}.png`;
      const upload = await client.storage.from(bucketId).upload(objectPath, pngBytes, { contentType: "image/png", upsert: false });
      if (upload.error) throw upload.error;
      objectPaths.push(objectPath);
      const added = await service.rpc("mutate_order_design_image", {
        p_action: "add",
        p_actor_id: identity.id,
        p_idempotency_key: `m7-ui-add-${randomUUID()}`,
        p_make_primary: index === 0,
        p_object_path: objectPath,
        p_order_id: orderId,
      });
      if (added.error) throw added.error;
    }
  }

  async function login(page: Page, identity: Identity) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(identity.email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  async function logout(page: Page) {
    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/login$/);
  }

  async function openDetail(page: Page, orderId: string) {
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByRole("heading", { name: "Diseño vigente" })).toBeVisible();
  }

  function designPanel(page: Page) {
    return page.getByRole("region", { name: "Diseño vigente" });
  }

  async function selectPng(page: Page, name: string) {
    await page.getByLabel("Archivo de diseño").setInputFiles({ name, mimeType: "image/png", buffer: pngBytes });
  }

  test.beforeAll(async () => {
    const { data: stage, error } = await service.from("workflow_stages").select("id").eq("code", "received").single();
    if (error || !stage) throw error ?? new Error("No se encontró la etapa inicial.");
    receivedStageId = stage.id;
    for (const role of ["super_admin", "admin", "attention", "employee"] as const) await createIdentity(role);
  });

  test.afterAll(async () => {
    const failures: string[] = [];
    async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await operation;
      if (error) failures.push(`${label}: ${error.message}`);
    }

    if (orderIds.length) {
      const { data: events, error: eventsError } = await service
        .from("order_design_image_events")
        .select("object_path, previous_object_path")
        .in("order_id", orderIds);
      if (eventsError) failures.push(`buscar objetos: ${eventsError.message}`);
      for (const event of events ?? []) {
        objectPaths.push(event.object_path);
        if (event.previous_object_path) objectPaths.push(event.previous_object_path);
      }
    }
    if (objectPaths.length) await cleanup("storage objects", service.storage.from(bucketId).remove([...new Set(objectPaths)]));
    if (orderIds.length) {
      await cleanup("order design events", service.from("order_design_image_events").delete().in("order_id", orderIds));
      await cleanup("order design metadata", service.from("order_design_images").delete().in("order_id", orderIds));
      await cleanup("orders", service.from("orders").delete().in("id", orderIds));
    }
    for (const identity of identities) await cleanup(`auth user ${identity.id}`, service.auth.admin.deleteUser(identity.id));
    if (failures.length) throw new Error(`Falló el cleanup E2E M7:\n${failures.join("\n")}`);
  });

  test("muestra el estado vacío y limita la carga por rol", async ({ page }) => {
    const orderId = await createOrder("Vacío M7");
    await login(page, identities[0]!);
    await openDetail(page, orderId);
    await expect(page.getByText("Todavía no hay un diseño cargado.")).toBeVisible();
    await expect(page.getByLabel("Archivo de diseño")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cargar diseño" })).toBeVisible();

    await logout(page);
    await login(page, identities[3]!);
    await openDetail(page, orderId);
    await expect(page.getByText("Todavía no hay un diseño cargado.")).toBeVisible();
    await expect(page.getByLabel("Archivo de diseño")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cargar diseño" })).toHaveCount(0);
  });

  test("carga y muestra una preview privada sin paths visibles", async ({ page }) => {
    const orderId = await createOrder("Carga M7");
    await login(page, identities[0]!);
    await openDetail(page, orderId);
    await selectPng(page, "design.png");
    await page.route("**/storage/v1/object/order-designs/**", async (route) => {
      if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await page.getByRole("button", { name: "Cargar diseño" }).click();
    await expect(page.getByRole("button", { name: "Procesando diseño..." })).toBeDisabled();
    await expect(designPanel(page).getByRole("status").filter({ hasText: "Diseño cargado" })).toBeFocused();
    await expect(page.getByRole("img", { name: "Diseño adicional del pedido 1" })).toBeVisible();
    await expect(designPanel(page).getByText("No hay un diseño principal seleccionado.")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("orders/");
  });

  test("permite reemplazar a los roles autorizados y Empleado solo visualiza", async ({ page }) => {
    const orderId = await createOrder("Roles M7");
    await seedImage(orderId);

    for (const identity of identities.slice(1, 3)) {
      await login(page, identity);
      await openDetail(page, orderId);
      await expect(page.getByRole("img", { name: "Diseño vigente del pedido" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Reemplazar diseño" })).toBeVisible();
      await logout(page);
    }

    await login(page, identities[3]!);
    await openDetail(page, orderId);
    await expect(page.getByRole("img", { name: "Diseño vigente del pedido" })).toBeVisible();
    await expect(page.getByLabel("Archivo de diseño")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reemplazar diseño" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Importes" })).toHaveCount(0);
  });

  test("rechaza un archivo inválido, conserva foco y permite reintentar el reemplazo", async ({ page }) => {
    const orderId = await createOrder("Reemplazo M7");
    await seedImage(orderId);
    await login(page, identities[2]!);
    await openDetail(page, orderId);

    const input = page.getByLabel("Archivo de diseño");
    await input.setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
    await page.getByRole("button", { name: "Reemplazar diseño" }).click();
    await expect(page.getByText("Elegí una imagen JPEG, PNG o WebP.").first()).toBeVisible();
    await expect(input).toBeFocused();

    await selectPng(page, "replacement.png");
    const replace = page.getByRole("button", { name: "Reemplazar diseño" });
    await replace.dblclick();
    await expect(designPanel(page).getByRole("status").filter({ hasText: "Diseño reemplazado" })).toBeFocused();
    const { count, error } = await service.from("order_design_image_events").select("id", { count: "exact", head: true }).eq("order_id", orderId);
    expect(error).toBeNull();
    expect(count).toBe(2);
  });

  test("renueva la URL ante error y también mediante teclado", async ({ page }) => {
    const orderId = await createOrder("Renovación M7");
    await seedImage(orderId);
    await login(page, identities[3]!);
    await openDetail(page, orderId);

    const image = page.getByRole("img", { name: "Diseño vigente del pedido" });
    await expect(image).toBeVisible();
    await expect(image).toHaveJSProperty("complete", true);
    await expect(image).toHaveJSProperty("naturalWidth", 1);
    await image.dispatchEvent("error");
    const renewedFeedback = designPanel(page).locator('[tabindex="-1"]').filter({ hasText: "Vista renovada" });
    await expect(renewedFeedback).toBeVisible();
    await expect(renewedFeedback).toBeFocused();

    await page.route(`**/orders/${orderId}`, async (route) => {
      if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    const renew = page.getByRole("button", { name: "Renovar vista" });
    await renew.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Renovando vista..." })).toBeDisabled();
    const renewedFeedbackAfterKeyboard = designPanel(page).locator('[tabindex="-1"]').filter({ hasText: "Vista renovada" });
    await expect(renewedFeedbackAfterKeyboard).toBeVisible();
    await expect(renewedFeedbackAfterKeyboard).toBeFocused();
  });

  test("mantiene lectura y acciones sin overflow en mobile", async ({ page }) => {
    const orderId = await createOrder("Mobile M7");
    await seedImage(orderId);
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, identities[1]!);
    await openDetail(page, orderId);
    await expect(page.getByRole("img", { name: "Diseño vigente del pedido" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reemplazar diseño" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("muestra miniatura en la tarjeta del tablero para roles operativos", async ({ page }) => {
    const orderId = await createOrder("Tablero M7");
    await seedImage(orderId);
    await login(page, identities[0]!);
    await page.goto("/orders");
    const card = page.locator(`[data-order-id="${orderId}"]`);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    const thumbnail = card.locator('img[loading="lazy"]');
    await expect(thumbnail).toHaveCount(1, { timeout: 30_000 });
    await expect(thumbnail).toBeVisible();
    await expect(thumbnail).toHaveAttribute("loading", "lazy");
  });

  test("Empleado ve miniatura en la tarjeta del tablero pero no acciones de carga", async ({ page }) => {
    const orderId = await createOrder("Tablero Empleado M7");
    await seedImage(orderId);
    await login(page, identities[3]!);
    await page.goto("/orders");
    const card = page.locator(`[data-order-id="${orderId}"]`);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    await expect(card.locator('img[loading="lazy"]')).toBeVisible({ timeout: 15_000 });
    await expect(card.getByRole("button", { name: /Cargar diseño|Reemplazar diseño/ })).toHaveCount(0);
  });

  test("muestra miniatura en la vista rápida del pedido", async ({ page }) => {
    const orderId = await createOrder("Vista rápida M7");
    await seedImage(orderId);
    await login(page, identities[1]!);
    await page.goto("/orders");
    const card = page.locator(`[data-order-id="${orderId}"]`);
    await card.scrollIntoViewIfNeeded();
     await card.getByRole("button", { name: /Vista rápida/ }).click();
     const quickView = page.getByRole("dialog", { name: /Vista rápida de PED-/ });
     await expect(quickView).toBeVisible({ timeout: 10_000 });
     const thumbnail = quickView.getByRole("button", { name: /Abrir diseño/ });
     await thumbnail.scrollIntoViewIfNeeded();
     await expect(quickView.locator('[role="img"]')).toBeVisible({ timeout: 10_000 });
     await thumbnail.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: /Diseño de/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("img", { name: /Diseño ampliado/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(thumbnail).toBeFocused();

    await thumbnail.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cerrar imagen ampliada" }).click();
    await expect(dialog).toBeHidden();
    await expect(thumbnail).toBeFocused();
  });

  test("gestiona tres imágenes, exige selección primaria y no promociona al borrar", async ({ page }) => {
    const orderId = await createOrder("Colección M7");
    await login(page, identities[2]!);
    await openDetail(page, orderId);

    await selectPng(page, "first.png");
    await page.getByRole("button", { name: "Cargar diseño" }).click();
    await expect(designPanel(page).getByRole("status").filter({ hasText: "Diseño cargado" })).toBeFocused();

    for (const name of ["second.png", "third.png"]) {
      await selectPng(page, name);
      await page.getByRole("button", { name: "Agregar diseño" }).click();
      await expect(designPanel(page).getByRole("status").filter({ hasText: "Diseño agregado" })).toBeFocused();
    }

    await expect(designPanel(page).locator("[data-design-image]")).toHaveCount(3);
    await expect(designPanel(page).getByText("Principal", { exact: true })).toHaveCount(0);
    await expect(designPanel(page).getByText("No hay un diseño principal seleccionado.")).toBeVisible();

    await designPanel(page).locator("[data-design-image]").first().getByRole("button", { name: "Seleccionar como principal" }).click();
    await expect(designPanel(page).getByRole("status").filter({ hasText: "Diseño principal actualizado" })).toBeFocused();
    await expect(designPanel(page).getByText("Principal", { exact: true })).toHaveCount(1);

    await designPanel(page).getByRole("button", { name: "Quitar como principal" }).click();
    await expect(designPanel(page).getByRole("status").filter({ hasText: "Diseño principal actualizado" })).toBeFocused();
    await expect(designPanel(page).getByText("No hay un diseño principal seleccionado.")).toBeVisible();

    const firstImage = designPanel(page).locator("[data-design-image]").first();
    await firstImage.getByRole("button", { name: "Eliminar diseño" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar diseño", exact: true }).click();
    await expect(designPanel(page).getByRole("status").filter({ hasText: "Diseño eliminado" })).toBeFocused();
    await expect(designPanel(page).locator("[data-design-image]")).toHaveCount(2);
    await expect(designPanel(page).getByText("No hay un diseño principal seleccionado.")).toBeVisible();
  });

  test("reemplaza la imagen primaria sin cambiarla y mantiene privacidad por rol", async ({ page }) => {
    const orderId = await createOrder("Reemplazo colección M7");
    await seedImageCollection(orderId);

    await login(page, identities[2]!);
    await openDetail(page, orderId);
    const primary = designPanel(page).locator("[data-design-image]").first();
    await expect(primary.getByText("Principal", { exact: true })).toBeVisible();
    await selectPng(page, "replacement-primary.png");
    await primary.getByRole("button", { name: "Reemplazar diseño" }).click();
    await expect(designPanel(page).getByRole("status").filter({ hasText: "Diseño reemplazado" })).toBeFocused();
    await expect(designPanel(page).locator("[data-design-image]")).toHaveCount(3);
    await expect(designPanel(page).getByText("Principal", { exact: true })).toHaveCount(1);
    await expect(page.locator("body")).not.toContainText("orders/");

    await logout(page);
    await login(page, identities[3]!);
    await openDetail(page, orderId);
    await expect(designPanel(page).locator("[data-design-image]")).toHaveCount(3);
    await expect(page.getByLabel("Archivo de diseño")).toHaveCount(0);
    await expect(designPanel(page).getByRole("button", { name: /Eliminar diseño|Seleccionar como principal|Quitar como principal|Reemplazar diseño/ })).toHaveCount(0);
  });

  test("muestra placeholder en tablero y vista rápida cuando no hay primaria", async ({ page }) => {
    const orderId = await createOrder("Placeholder M7");
    await seedImageCollection(orderId, 2);
    const client = await signedClient(identities[0]!);
    const { data: images, error } = await client.from("order_design_images").select("id").eq("order_id", orderId).order("created_at").order("id");
    if (error || !images?.[0]) throw error ?? new Error("No se encontraron imágenes para limpiar la primaria.");
    const cleared = await service.rpc("mutate_order_design_image", {
      p_action: "clear_primary",
      p_actor_id: identities[0]!.id,
      p_idempotency_key: `m7-ui-clear-${randomUUID()}`,
      p_order_id: orderId,
    });
    if (cleared.error) throw cleared.error;

    await login(page, identities[3]!);
    await page.goto("/orders");
    const card = page.locator(`[data-order-id="${orderId}"]`);
    await expect(card.getByRole("img", { name: "No hay diseño principal" })).toBeVisible();
    await card.getByRole("button", { name: /Vista rápida/ }).click();
    const quickView = page.getByRole("dialog", { name: /Vista rápida de PED-/ });
    await expect(quickView.getByRole("img", { name: "No hay diseño principal" })).toBeVisible();
  });
});
