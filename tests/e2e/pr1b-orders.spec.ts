import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

test("PR1B completa alta multiítem, edición, búsqueda y detalle", async ({ page }) => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Falta Supabase para E2E PR1B.");
  const service = createClient<Database>(url, serviceRoleKey, { auth: { persistSession: false } });
  const email = `pr1b-e2e-${randomUUID()}@example.test`;
  const password = `P1B${randomUUID().replaceAll("-", "")}7`;
  const runId = randomUUID().slice(0, 8);
  let userId: string | undefined;
  let orderId: string | undefined;
  const legacyIds: string[] = [];
  const productIds: string[] = [];
  const cleanupFailures: string[] = [];

  async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>) {
    try {
      const result = await operation;
      if (result.error) cleanupFailures.push(`${label}: ${result.error.message}`);
    } catch (error) {
      cleanupFailures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const { data: auth, error: authError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (authError || !auth.user) throw authError ?? new Error("No se creó la identidad E2E PR1B.");
    const actorId = auth.user.id;
    userId = actorId;
    const { error: profileError } = await service.from("profiles").insert({ id: actorId, display_name: `PR1B E2E ${runId}`, role: "super_admin", is_active: true, must_change_password: false });
    if (profileError) throw profileError;
    const sections = await service.from("catalog_sections").select("id, code").in("code", ["garments", "flags"]);
    if (sections.error || !sections.data || sections.data.length !== 2) throw sections.error ?? new Error("Faltan secciones PR1B.");
    const sectionByCode = new Map(sections.data.map((section) => [section.code, section.id]));
    const legacy = await service.from("catalog_items").insert([
      { kind: "garment", garment_layer: "upper", name: `Remera PR1B ${runId}`, created_by: actorId, updated_by: actorId },
      { kind: "neckline", garment_layer: null, name: `Cuello PR1B ${runId}`, created_by: actorId, updated_by: actorId },
      { kind: "upper_pattern", garment_layer: null, name: `Molde superior PR1B ${runId}`, created_by: actorId, updated_by: actorId },
      { kind: "fabric", garment_layer: null, name: `Tela PR1B ${runId}`, created_by: actorId, updated_by: actorId },
    ]).select("id, kind");
    if (legacy.error || !legacy.data) throw legacy.error ?? new Error("No se creó el catálogo legacy PR1B.");
    legacyIds.push(...legacy.data.map((item) => item.id));
    const legacyByKind = new Map(legacy.data.map((item) => [item.kind, item.id]));
    const garment = await service.from("catalog_products").select("id").eq("legacy_catalog_item_id", legacyByKind.get("garment")!).single();
    if (garment.error || !garment.data) throw garment.error ?? new Error("No se proyectó la prenda PR1B.");
    productIds.push(garment.data.id);

    const flagSectionId = sectionByCode.get("flags");
    if (!flagSectionId) throw new Error("No se encontró la sección flags PR1B.");
    const flag = await service.from("catalog_products").insert({ section_id: flagSectionId, kind: "flag", name: `Bandera PR1B ${runId}`, created_by: actorId, updated_by: actorId }).select("id").single();
    if (flag.error || !flag.data) throw flag.error ?? new Error("No se creó el producto bandera PR1B.");
    productIds.push(flag.data.id);
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/orders/new");
    await page.getByLabel("Cliente").fill(`Cliente PR1B ${runId}`);
    await page.getByLabel("Equipo").fill(`Equipo PR1B ${runId}`);
    await page.getByLabel("Teléfono").fill("+54 351 5550199");
    await page.getByLabel("Cantidad").first().fill("4");
    const orderDate = await page.getByLabel("Fecha del pedido").inputValue();
    const promisedDate = new Date(`${orderDate}T00:00:00`);
    promisedDate.setDate(promisedDate.getDate() + 1);
    const promisedDateValue = [promisedDate.getFullYear(), String(promisedDate.getMonth() + 1).padStart(2, "0"), String(promisedDate.getDate()).padStart(2, "0")].join("-");
    await page.getByLabel("Fecha prometida de entrega").fill(promisedDateValue);
    await page.getByLabel("Producto de catálogo").first().selectOption(productIds[0]!);
    await page.getByLabel("Cuello").selectOption(legacyByKind.get("neckline")!);
    await page.getByLabel("Molde superior").selectOption(legacyByKind.get("upper_pattern")!);
    await page.getByLabel("Tela").selectOption(legacyByKind.get("fabric")!);
    await page.getByRole("button", { name: "Agregar renglón" }).click();
    await page.getByLabel("Tipo de renglón").nth(1).selectOption("flag");
    await page.getByLabel("Producto de catálogo").nth(1).selectOption(productIds[1]!);
    await page.getByLabel("Total del pedido").fill("1200,00");
    await page.getByLabel("Monto de seña").fill("0");
    await page.getByRole("button", { name: "Crear pedido" }).click();
    await expect(page.getByRole("heading", { name: /PED-\d{6} creado/ })).toBeVisible();
    const created = await service.from("orders").select("id").eq("client_name", `Cliente PR1B ${runId}`).single();
    if (created.error || !created.data) throw created.error ?? new Error("No se encontró el pedido PR1B.");
    orderId = created.data.id;
    const lineCount = await service.from("order_lines").select("id", { count: "exact", head: true }).eq("order_id", orderId);
    expect(lineCount.error).toBeNull();
    expect(lineCount.count).toBe(2);
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByText(`Equipo PR1B ${runId}`, { exact: true })).toBeVisible();
    await expect(page.locator('dt:has-text("Teléfono") + dd')).toHaveText("+54 351 5550199");
    const specifications = page.getByRole("heading", { name: "Especificaciones", exact: true }).locator("xpath=ancestor::section[1]");
    await expect(specifications.getByText("Renglón 1", { exact: true })).toBeVisible();
    await page.getByLabel("Equipo").last().fill(`Equipo editado PR1B ${runId}`);
     await page.getByRole("button", { name: "Guardar cambios" }).click();
     await page.getByRole("button", { name: "Confirmar cambios" }).click();
      await expect(page.getByLabel("Notifications alt+T").getByRole("listitem").filter({ hasText: "Pedido actualizado." })).toBeVisible();
     await page.goto(`/orders?search=${encodeURIComponent(`Equipo editado PR1B ${runId}`)}`);
    await expect(page.getByText(`Equipo editado PR1B ${runId}`, { exact: true })).toBeVisible();
  } finally {
    if (orderId) {
      const lineIds = (await service.from("order_lines").select("id").eq("order_id", orderId)).data?.map((line) => line.id) ?? [];
      await cleanup("order_change_events", service.from("order_change_events").delete().eq("order_id", orderId));
      await cleanup("order_stage_events", service.from("order_stage_events").delete().eq("order_id", orderId));
      if (lineIds.length) await cleanup("order_line_shields", service.from("order_line_shields").delete().in("order_line_id", lineIds));
      await cleanup("order_lines", service.from("order_lines").delete().eq("order_id", orderId));
      await cleanup("order_catalog_items", service.from("order_catalog_items").delete().eq("order_id", orderId));
      await cleanup("order_financials", service.from("order_financials").delete().eq("order_id", orderId));
      await cleanup("orders", service.from("orders").delete().eq("id", orderId));
    }
    if (productIds.length) await cleanup("catalog_products", service.from("catalog_products").delete().in("id", productIds));
    if (legacyIds.length) await cleanup("catalog_items", service.from("catalog_items").delete().in("id", legacyIds));
    if (userId) {
      await cleanup("profile", service.from("profiles").delete().eq("id", userId));
      await cleanup("auth user", service.auth.admin.deleteUser(userId));
    }
    if (cleanupFailures.length) throw new Error(`Falló el cleanup E2E PR1B:\n${cleanupFailures.join("\n")}`);
  }
});
