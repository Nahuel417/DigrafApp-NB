import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = `P1A${randomUUID().replaceAll("-", "")}7`;
type Identity = { email: string; id: string };
type Role = Database["public"]["Enums"]["app_role"];
describe.skipIf(!url || !serviceRoleKey || !publishableKey)("PR 1A: order_lines, catalogs and options", () => {
  const service = createClient<Database>(url ?? "", serviceRoleKey ?? "", { auth: { persistSession: false } });
  const sectionIds: string[] = [];
  const catalogItemIds: string[] = [];
  const productIds: string[] = [];
  const orderIds: string[] = [];
  const identities: Array<Identity & { role: Role }> = [];
  let identity: (Identity & { role: Role }) | undefined;
  let attentionIdentity: (Identity & { role: Role }) | undefined;
  let employeeIdentity: (Identity & { role: Role }) | undefined;
  let client: SupabaseClient<Database>;

  async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>, failures: string[]) {
    try {
      const result = await operation;
      if (result.error) failures.push(`${label}: ${result.error.message}`);
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  beforeAll(async () => {
    async function createIdentity(role: Role) {
      const email = `pr1a-${role}-${randomUUID()}@example.test`;
      const auth = await service.auth.admin.createUser({ email, password, email_confirm: true });
      if (auth.error || !auth.data.user) throw auth.error ?? new Error(`No se creó la identidad sintética PR1A ${role}.`);
      const created = { email, id: auth.data.user.id, role };
      identities.push(created);
      const profile = await service.from("profiles").insert({ id: created.id, display_name: `PR1A ${role}`, role, is_active: true, must_change_password: false });
      if (profile.error) throw profile.error;
      return created;
    }

    identity = await createIdentity("super_admin");
    attentionIdentity = await createIdentity("attention");
    employeeIdentity = await createIdentity("employee");

    client = createClient<Database>(url ?? "", publishableKey ?? "", { auth: { persistSession: false } });
    const signIn = await client.auth.signInWithPassword({ email: identity.email, password });
    if (signIn.error) throw signIn.error;

    const sections = await service.from("catalog_sections").select("id, code").in("code", ["garments", "flags"]);
    if (sections.error || sections.data.length !== 2) throw sections.error ?? new Error("No se encontraron las secciones canónicas PR1A.");
    const garmentsSection = sections.data.find(({ code }) => code === "garments");
    const flagsSection = sections.data.find(({ code }) => code === "flags");
    if (!garmentsSection || !flagsSection) throw new Error("No se encontraron las secciones canónicas PR1A.");
    sectionIds.push(garmentsSection.id, flagsSection.id);

    const legacyItems = await Promise.all([
      client.rpc("create_catalog_item", { target_kind: "garment", target_garment_layer: "upper", target_name: `PR1A garment ${randomUUID()}` }),
      client.rpc("create_catalog_item", { target_kind: "neckline", target_garment_layer: "", target_name: `PR1A neckline ${randomUUID()}` }),
      client.rpc("create_catalog_item", { target_kind: "upper_pattern", target_garment_layer: "", target_name: `PR1A pattern ${randomUUID()}` }),
      client.rpc("create_catalog_item", { target_kind: "fabric", target_garment_layer: "", target_name: `PR1A fabric ${randomUUID()}` }),
    ]);
    if (legacyItems.some(({ data, error }) => error || !data)) throw legacyItems.find(({ error }) => error)?.error ?? new Error("No se crearon las opciones legacy PR1A.");
    catalogItemIds.push(...legacyItems.map(({ data }) => data!));
    const projection = await service.from("catalog_products").select("id").eq("legacy_catalog_item_id", catalogItemIds[0]!).single();
    if (projection.error) throw projection.error;
    const flag = await client.rpc("create_catalog_product_without_category", { target_section_id: sectionIds[1]!, target_kind: "flag", target_name: `PR1A flag ${randomUUID()}` });
    if (flag.error || !flag.data) throw flag.error ?? new Error("No se creó la bandera PR1A.");
    productIds.push(projection.data.id, flag.data);
  });

  afterAll(async () => {
    const failures: string[] = [];
    if (orderIds.length) {
      await cleanup("order_change_events", service.from("order_change_events").delete().in("order_id", orderIds), failures);
      await cleanup("order_stage_events", service.from("order_stage_events").delete().in("order_id", orderIds), failures);
      const lines = await service.from("order_lines").select("id").in("order_id", orderIds);
      if (lines.error) failures.push(`buscar order_lines: ${lines.error.message}`);
      const lineIds = (lines.data ?? []).map((line) => line.id);
      if (lineIds.length) await cleanup("order_line_shields", service.from("order_line_shields").delete().in("order_line_id", lineIds), failures);
      await cleanup("order_lines", service.from("order_lines").delete().in("order_id", orderIds), failures);
      await cleanup("order_financials", service.from("order_financials").delete().in("order_id", orderIds), failures);
      await cleanup("orders", service.from("orders").delete().in("id", orderIds), failures);
    }
    if (productIds.length) await cleanup("catalog_products", service.from("catalog_products").delete().in("id", productIds), failures);
    if (identities.length) await cleanup("catalog_item_events", service.from("catalog_item_events").delete().in("actor_id", identities.map(({ id }) => id)), failures);
    if (catalogItemIds.length) await cleanup("catalog_items", service.from("catalog_items").delete().in("id", catalogItemIds), failures);
    for (const created of identities) {
      await cleanup("profile", service.from("profiles").delete().eq("id", created.id), failures);
      await cleanup("auth user", service.auth.admin.deleteUser(created.id), failures);
    }
    if (failures.length) throw new Error(`Falló el cleanup PR1A:\n${failures.join("\n")}`);
  });

  it("updates a new multi-line order through the update RPC and persists it", async () => {
    const idempotencyKey = `pr1a-${randomUUID()}`;
    const lines = [
      { position: 0, line_type: "individual", product_id: productIds[0], quantity: 12, color: "Azul", options: [], configuration: { legacy_options: { neckline_id: catalogItemIds[1], upper_pattern_id: catalogItemIds[2], fabric_id: catalogItemIds[3], extra_ids: [] } } },
      { position: 1, line_type: "flag", product_id: productIds[1], quantity: 2, color: "Rojo", options: [] },
    ];

    const created = await client.rpc("create_order", {
      p_client_name: "Cliente PR1A",
      p_team_name: "Equipo PR1A",
      p_phone: "3515550000",
      p_order_date: "2026-08-17",
      p_promised_delivery_date: "2026-08-24",
      p_description: "",
      p_total_amount: "1000.00",
      p_deposit_amount: "0.00",
      p_deposit_paid: false,
      p_lines: lines,
      p_idempotency_key: idempotencyKey,
    });
    expect(created.error).toBeNull();
    const orderId = created.data?.[0]?.order_id;
    expect(orderId).toEqual(expect.any(String));
    orderIds.push(orderId!);

    const order = await service.from("orders").select("updated_at").eq("id", orderId!).single();
    expect(order.error).toBeNull();
    const updateInput = {
      p_order_id: orderId!,
      p_client_name: "Cliente PR1A editado",
      p_team_name: "Equipo PR1A editado",
      p_phone: "3515550001",
      p_order_date: "2026-08-17",
      p_promised_delivery_date: "2026-08-25",
      p_description: "Actualizado PR1A",
      p_total_amount: 1500,
      p_deposit_amount: 300,
      p_deposit_paid: true,
      p_lines: lines,
      p_change_note: "Prueba PR1A",
      p_expected_updated_at: order.data!.updated_at,
      p_idempotency_key: `pr1a-update-${randomUUID()}`,
    };
    const attentionClient = createClient<Database>(url ?? "", publishableKey ?? "", { auth: { persistSession: false } });
    const attentionSignIn = await attentionClient.auth.signInWithPassword({ email: attentionIdentity!.email, password });
    expect(attentionSignIn.error).toBeNull();
    const updated = await attentionClient.rpc("update_order", updateInput);
    expect(updated.error).toBeNull();
    expect(updated.data?.[0]?.order_id).toBe(orderId);

    const afterAttention = await service.from("orders").select("updated_at").eq("id", orderId!).single();
    const employeeClient = createClient<Database>(url ?? "", publishableKey ?? "", { auth: { persistSession: false } });
    const employeeSignIn = await employeeClient.auth.signInWithPassword({ email: employeeIdentity!.email, password });
    expect(employeeSignIn.error).toBeNull();
    const denied = await employeeClient.rpc("update_order", {
      ...updateInput,
      p_expected_updated_at: afterAttention.data!.updated_at,
      p_idempotency_key: `pr1a-employee-${randomUUID()}`,
    });
    expect(denied.error?.message).toContain("permiso");

    const bypass = await service.rpc("update_order", {
      ...updateInput,
      p_expected_updated_at: afterAttention.data!.updated_at,
      p_idempotency_key: `pr1a-bypass-${randomUUID()}`,
    });
    expect(bypass.error).not.toBeNull();

    const persisted = await service.from("orders").select("client_name, team_name, phone, description").eq("id", orderId!).single();
    expect(persisted.data).toMatchObject({ client_name: "Cliente PR1A editado", team_name: "Equipo PR1A editado", phone: "3515550001", description: "Actualizado PR1A" });
    const financials = await service.from("order_financials").select("total_amount, deposit_amount, deposit_paid").eq("order_id", orderId!).single();
    expect(financials.data).toEqual({ total_amount: 1500, deposit_amount: 300, deposit_paid: true });
    const persistedLines = await service.from("order_lines").select("position, product_id, quantity, color").eq("order_id", orderId!).order("position");
    expect(persistedLines.data).toEqual([
      { position: 0, product_id: productIds[0], quantity: 12, color: "Azul" },
      { position: 1, product_id: productIds[1], quantity: 2, color: "Rojo" },
    ]);
  });
});
