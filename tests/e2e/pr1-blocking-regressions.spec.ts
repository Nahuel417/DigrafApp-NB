import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

test("PR1 conserva catálogos, opciones legacy, pedidos mixtos y saldo", async ({ page }) => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Falta Supabase para E2E PR1.");
  const service = createClient<Database>(url, serviceRoleKey, { auth: { persistSession: false } });
  const runId = randomUUID().slice(0, 8);
  const email = `pr1-regressions-${runId}@example.test`;
  const password = `P1${randomUUID().replaceAll("-", "")}7`;
  let userId: string | undefined;
  const orderIds: string[] = [];
  const legacyIds: string[] = [];
  const productIds: string[] = [];
  const categoryIds: string[] = [];
  const optionIds: string[] = [];
  const optionValueIds: string[] = [];

  async function createOrderAndRemember(clientName: string) {
    await page.getByRole("button", { name: "Crear pedido" }).click();
    await expect(page.getByRole("heading", { name: /PED-\d{6} creado/ })).toBeVisible();
    const order = await service.from("orders").select("id").eq("client_name", clientName).single();
    if (order.error) throw order.error;
    orderIds.push(order.data.id);
  }

  async function fillBase(clientName: string) {
    await page.goto("/orders/new");
    await page.getByLabel("Cliente").fill(clientName);
    await page.getByLabel("Equipo").fill(`Equipo ${runId}`);
    await page.getByLabel("Teléfono").fill("3515550199");
    const orderDate = await page.getByLabel("Fecha del pedido").inputValue();
    const promised = new Date(`${orderDate}T00:00:00`);
    promised.setDate(promised.getDate() + 1);
    await page.getByLabel("Fecha prometida de entrega").fill([promised.getFullYear(), String(promised.getMonth() + 1).padStart(2, "0"), String(promised.getDate()).padStart(2, "0")].join("-"));
  }

  try {
    const auth = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (auth.error || !auth.data.user) throw auth.error ?? new Error("No se creó el usuario PR1.");
    userId = auth.data.user.id;
    const profile = await service.from("profiles").insert({ id: userId, display_name: `PR1 ${runId}`, role: "super_admin", is_active: true, must_change_password: false });
    if (profile.error) throw profile.error;

    const sections = await service.from("catalog_sections").select("id, code").in("code", ["garments", "flags", "bags", "shields"]);
    if (sections.error || sections.data.length !== 4) throw sections.error ?? new Error("Faltan secciones canónicas PR1.");
    const sectionByCode = new Map(sections.data.map((section) => [section.code, section.id]));
    const legacyRows: Database["public"]["Tables"]["catalog_items"]["Insert"][] = [
      { kind: "garment", garment_layer: "upper", name: `Superior ${runId}`, created_by: userId, updated_by: userId },
      { kind: "garment", garment_layer: "lower", name: `Inferior ${runId}`, created_by: userId, updated_by: userId },
      { kind: "neckline", garment_layer: null, name: `Cuello ${runId}`, created_by: userId, updated_by: userId },
      { kind: "upper_pattern", garment_layer: null, name: `Molde superior ${runId}`, created_by: userId, updated_by: userId },
      { kind: "lower_pattern", garment_layer: null, name: `Molde inferior ${runId}`, created_by: userId, updated_by: userId },
      { kind: "fabric", garment_layer: null, name: `Tela ${runId}`, created_by: userId, updated_by: userId },
      { kind: "extra", garment_layer: null, name: `Extra ${runId}`, created_by: userId, updated_by: userId },
    ];
    const legacy = await service.from("catalog_items").insert(legacyRows).select("id, kind, garment_layer, name");
    if (legacy.error) throw legacy.error;
    legacyIds.push(...legacy.data.map((item) => item.id));
    const legacyByKind = new Map(legacy.data.map((item) => [`${item.kind}:${item.garment_layer ?? ""}`, item]));
    const projections = await service.from("catalog_products").select("id, legacy_catalog_item_id, garment_layer").in("legacy_catalog_item_id", legacyIds);
    if (projections.error || projections.data.length !== 2) throw projections.error ?? new Error("No se proyectaron las prendas PR1.");
    const upperProduct = projections.data.find((product) => product.garment_layer === "upper");
    const lowerProduct = projections.data.find((product) => product.garment_layer === "lower");
    if (!upperProduct || !lowerProduct) throw new Error("Las capas de prendas PR1 no son válidas.");
    productIds.push(upperProduct.id, lowerProduct.id);

    const category = await service.from("catalog_categories").insert({ section_id: sectionByCode.get("shields")!, name: `Categoría ${runId}`, created_by: userId, updated_by: userId }).select("id").single();
    if (category.error) throw category.error;
    categoryIds.push(category.data.id);
    for (const [code, kind, name, categoryId] of [
      ["flags", "flag", `Bandera ${runId}`, null],
      ["bags", "bag", `Bolso ${runId}`, null],
      ["shields", "shield", `Escudo A ${runId}`, category.data.id],
      ["shields", "shield", `Escudo B ${runId}`, category.data.id],
    ] as const) {
      const product = await service.from("catalog_products").insert({ section_id: sectionByCode.get(code)!, kind, category_id: categoryId, name, created_by: userId, updated_by: userId }).select("id").single();
      if (product.error) throw product.error;
      productIds.push(product.data.id);
    }
    const option = await service.from("catalog_product_options").insert({ product_id: upperProduct.id, code: `acabado_${runId}`, name: `Acabado ${runId}`, selection_mode: "single", created_by: userId, updated_by: userId }).select("id").single();
    if (option.error) throw option.error;
    optionIds.push(option.data.id);
    const optionValue = await service.from("catalog_product_option_values").insert({ option_id: option.data.id, value: `Mate ${runId}`, created_by: userId, updated_by: userId }).select("id").single();
    if (optionValue.error) throw optionValue.error;
    optionValueIds.push(optionValue.data.id);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/catalogs");
    for (const tab of ["Banderas", "Bolsos", "Escudos"]) await expect(page.getByRole("button", { name: tab })).toBeVisible();
    await page.getByRole("button", { name: "Escudos" }).click();
    await expect(page.locator(`input[value="Categoría ${runId}"]`)).toBeVisible();
    await expect(page.locator(`input[value="Escudo A ${runId}"]`)).toBeVisible();

    const simpleClient = `Simple ${runId}`;
    await fillBase(simpleClient);
    await page.getByLabel("Producto de catálogo").selectOption(upperProduct.id);
    await page.getByLabel("Cuello").selectOption(legacyByKind.get("neckline:")!.id);
    await page.getByLabel("Molde superior").selectOption(legacyByKind.get("upper_pattern:")!.id);
    await page.getByLabel("Tela").selectOption(legacyByKind.get("fabric:")!.id);
    await page.getByLabel(`Extra ${runId}`).check();
    await page.getByLabel(new RegExp(`Acabado ${runId}`)).selectOption(optionValue.data.id);
    await page.getByLabel(`Escudo A ${runId}`).check();
    await page.getByLabel(`Escudo B ${runId}`).check();
    await page.getByLabel("Total del pedido").fill("20000");
    await page.getByLabel("Monto de seña").fill("10000");
    await expect(page.getByText("Total $ 20.000,00 · Seña $ 10.000,00 · Saldo $ 10.000,00", { exact: true })).toBeVisible();
    await createOrderAndRemember(simpleClient);

    const setClient = `Conjunto ${runId}`;
    await fillBase(setClient);
    await page.getByLabel("Tipo de renglón").selectOption("set");
    await page.getByLabel("Parte superior").selectOption(upperProduct.id);
    await page.getByLabel("Parte inferior").selectOption(lowerProduct.id);
    await page.getByLabel("Cuello").selectOption(legacyByKind.get("neckline:")!.id);
    await page.getByLabel("Molde superior").selectOption(legacyByKind.get("upper_pattern:")!.id);
    await page.getByLabel("Molde de short/pollera").selectOption(legacyByKind.get("lower_pattern:")!.id);
    await page.getByLabel("Tela").selectOption(legacyByKind.get("fabric:")!.id);
    await page.getByLabel("Total del pedido").fill("30000");
    await page.getByLabel("Monto de seña").fill("5000");
    await createOrderAndRemember(setClient);

    const mixedClient = `Mixto ${runId}`;
    await fillBase(mixedClient);
    await page.getByLabel("Producto de catálogo").selectOption(upperProduct.id);
    await page.getByLabel("Cuello").selectOption(legacyByKind.get("neckline:")!.id);
    await page.getByLabel("Molde superior").selectOption(legacyByKind.get("upper_pattern:")!.id);
    await page.getByLabel("Tela").selectOption(legacyByKind.get("fabric:")!.id);
    await page.getByRole("button", { name: "Agregar renglón" }).click();
    await page.getByLabel("Tipo de renglón").nth(1).selectOption("flag");
    await page.getByLabel("Producto de catálogo").nth(1).selectOption(productIds[2]!);
    await page.getByLabel("Total del pedido").fill("40000");
    await page.getByLabel("Monto de seña").fill("10000");
    await createOrderAndRemember(mixedClient);
  } finally {
    for (const orderId of orderIds) {
      const lines = await service.from("order_lines").select("id").eq("order_id", orderId);
      const lineIds = (lines.data ?? []).map((line) => line.id);
      await service.from("order_change_events").delete().eq("order_id", orderId);
      await service.from("order_stage_events").delete().eq("order_id", orderId);
      if (lineIds.length) await service.from("order_line_shields").delete().in("order_line_id", lineIds);
      await service.from("order_lines").delete().eq("order_id", orderId);
      await service.from("order_financials").delete().eq("order_id", orderId);
      await service.from("orders").delete().eq("id", orderId);
    }
    if (optionValueIds.length) await service.from("catalog_product_option_values").delete().in("id", optionValueIds);
    if (optionIds.length) await service.from("catalog_product_options").delete().in("id", optionIds);
    if (productIds.length) await service.from("catalog_products").delete().in("id", productIds);
    if (categoryIds.length) await service.from("catalog_categories").delete().in("id", categoryIds);
    if (userId) await service.from("catalog_item_events").delete().eq("actor_id", userId);
    if (legacyIds.length) await service.from("catalog_items").delete().in("id", legacyIds);
    if (userId) {
      await service.from("profiles").delete().eq("id", userId);
      await service.auth.admin.deleteUser(userId);
    }
  }
});
