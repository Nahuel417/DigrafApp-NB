import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

test("Super admin crea un pedido manual completo", async ({ page }) => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !serviceRoleKey || !publishableKey) throw new Error("Falta Supabase para E2E M3.");

  const admin = createClient<Database>(url, serviceRoleKey, { auth: { persistSession: false } });
  const client = createClient<Database>(url, publishableKey, { auth: { persistSession: false } });
  const runId = randomUUID().slice(0, 8);
  const email = `super-admin-m3-e2e-${randomUUID()}@digraf.local`;
  const password = `M3${randomUUID().replaceAll("-", "")}7`;
  const customerName = `Verificación M3 ${runId}`;
  const catalogItems = [
    ["garment", "upper", `Remera ${runId}`], ["garment", "lower", `Short ${runId}`],
    ["neckline", null, `Cuello ${runId}`], ["upper_pattern", null, `Molde superior ${runId}`],
    ["lower_pattern", null, `Molde inferior ${runId}`], ["fabric", null, `Tela ${runId}`],
    ["extra", null, `Extra ${runId}`],
  ] as const;
  const catalogIds: string[] = [];
  let userId: string | undefined;
  let orderId: string | undefined;

  try {
    const { data: auth, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (authError || !auth.user) throw authError ?? new Error("No se creó el Super admin E2E M3.");
    userId = auth.user.id;
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId, display_name: `Super admin M3 ${runId}`, role: "super_admin", is_active: true, must_change_password: false,
    });
    if (profileError) throw profileError;

    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    for (const [kind, layer, name] of catalogItems) {
      const { data: id, error } = await client.rpc("create_catalog_item", {
        target_kind: kind, target_garment_layer: layer ?? "", target_name: name,
      });
      if (error || !id) throw error ?? new Error("No se creó un catálogo E2E M3.");
      catalogIds.push(id);
    }

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/orders/new");
    await page.getByLabel("Cliente o equipo").fill(customerName);
    await page.getByLabel("Cantidad total de unidades").fill("12");
    await page.getByLabel("Fecha prometida de entrega").fill("2026-08-03");

    const selections = [
      ["Prenda superior", `Remera ${runId}`], ["Prenda inferior", `Short ${runId}`],
      ["Cuello", `Cuello ${runId}`], ["Molde superior", `Molde superior ${runId}`],
      ["Molde de short/pollera", `Molde inferior ${runId}`], ["Tela", `Tela ${runId}`],
    ] as const;
    for (const [label, option] of selections) {
      await page.getByLabel(label, { exact: true }).click();
      await page.getByRole("option", { name: option, exact: true }).click();
    }

    await page.getByLabel(`Extra ${runId}`, { exact: true }).click();
    await page.getByLabel("Precio total del pedido").fill("1500,00");
    await page.getByLabel("Monto de seña").fill("300,00");
    await page.getByLabel("Seña abonada").click();
    await page.getByRole("button", { name: "Crear pedido" }).click();
    await expect(page.getByRole("heading", { name: /PED-\d{6} creado/ })).toBeVisible();

    const { data: order, error: orderError } = await client.from("orders").select("id, current_stage_id").eq("customer_name", customerName).single();
    expect(orderError).toBeNull();
    expect(order).not.toBeNull();
    orderId = order!.id;
    const [financials, specifications, stageEvents] = await Promise.all([
      client.from("order_financials").select("total_amount, deposit_amount, deposit_paid").eq("order_id", orderId).single(),
      client.from("order_catalog_items").select("selection_key").eq("order_id", orderId),
      client.from("order_stage_events").select("from_stage_id, to_stage_id").eq("order_id", orderId).single(),
    ]);
    expect(financials.data).toMatchObject({ total_amount: 1500, deposit_amount: 300, deposit_paid: true });
    expect(specifications.data).toHaveLength(7);
    expect(stageEvents.data).toMatchObject({ from_stage_id: null, to_stage_id: order!.current_stage_id });
  } finally {
    const failures: string[] = [];
    async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await operation;
      if (error) failures.push(`${label}: ${error.message}`);
    }
    if (!orderId) {
      const result = await admin.from("orders").select("id").eq("customer_name", customerName).maybeSingle();
      if (result.error) failures.push(`buscar pedido: ${result.error.message}`);
      orderId = result.data?.id;
    }
    if (orderId) {
      await cleanup("order_stage_events", admin.from("order_stage_events").delete().eq("order_id", orderId));
      await cleanup("order_catalog_items", admin.from("order_catalog_items").delete().eq("order_id", orderId));
      await cleanup("order_financials", admin.from("order_financials").delete().eq("order_id", orderId));
      await cleanup("orders", admin.from("orders").delete().eq("id", orderId));
    }
    if (userId) await cleanup("catalog_item_events", admin.from("catalog_item_events").delete().eq("actor_id", userId));
    if (catalogIds.length) await cleanup("catalog_items", admin.from("catalog_items").delete().in("id", catalogIds));
    if (userId) await cleanup("auth user", admin.auth.admin.deleteUser(userId));
    if (failures.length) throw new Error(`Falló el cleanup E2E M3:\n${failures.join("\n")}`);
  }
});
