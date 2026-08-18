import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = `M3${randomUUID().replaceAll("-", "")}7`;

type Role = Database["public"]["Enums"]["app_role"];
describe.skipIf(!url || !serviceRoleKey || !publishableKey)("Catálogos y alta manual M3", () => {
  const admin = createClient<Database>(url ?? "", serviceRoleKey ?? "", { auth: { persistSession: false } });
  const identities: Array<{ email: string; id: string; role: Role }> = [];
  const catalogIds: string[] = [];
  const orderIds: string[] = [];
  let catalog: Record<string, string> = {};
  let lineProducts: { upper: string; lower: string };

  async function createIdentity(role: Role) {
    const email = `${role}-m3-${randomUUID()}@digraf.local`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error("No se pudo crear una identidad sintética M3.");

    const { error: profileError } = await admin.from("profiles").insert({
      id: data.user.id,
      display_name: `M3 ${role}`,
      role,
      is_active: true,
      must_change_password: false,
    });
    if (profileError) throw profileError;

    const identity = { email, id: data.user.id, role };
    identities.push(identity);
    return identity;
  }

  async function signedClient(identity: { email: string }): Promise<SupabaseClient<Database>> {
    const client = createClient<Database>(url ?? "", publishableKey ?? "", { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email: identity.email, password });
    if (error) throw error;
    return client;
  }

  function orderInput(idempotencyKey: string) {
    return {
      p_client_name: "Cliente M3",
      p_team_name: "Equipo M3",
      p_phone: "3515550000",
      p_order_date: "2026-07-22",
      p_promised_delivery_date: "2026-07-29",
      p_description: "",
      p_total_amount: "1500.00",
      p_deposit_amount: "300.00",
      p_deposit_paid: true,
      p_lines: [{
        position: 0,
        line_type: "set" as const,
        quantity: 12,
        configuration: {
          upper: { product_id: lineProducts.upper, options: [] },
          lower: { product_id: lineProducts.lower, options: [] },
          legacy_options: {
            neckline_id: catalog.neckline,
            upper_pattern_id: catalog.upperPattern,
            lower_pattern_id: catalog.lowerPattern,
            fabric_id: catalog.fabric,
            extra_ids: [catalog.extra],
          },
        },
        shield_product_ids: [],
      }],
      p_idempotency_key: idempotencyKey,
    };
  }

  beforeAll(async () => {
    const [superAdmin, adminUser, attention, employee] = await Promise.all([
      createIdentity("super_admin"), createIdentity("admin"), createIdentity("attention"), createIdentity("employee"),
    ]);

    const items = [
      ["garment", "upper", "Remera"], ["garment", "lower", "Short"], ["neckline", null, "Redondo"],
      ["upper_pattern", null, "Recto"], ["lower_pattern", null, "Clásico"], ["fabric", null, "Microfibra"], ["extra", null, "Bolsillo"],
    ] as const;
    const superClient = await signedClient(superAdmin);
    const createdItems: Array<{ id: string; kind: typeof items[number][0]; garment_layer: typeof items[number][1] }> = [];
    for (const [kind, garment_layer, name] of items) {
      const { data: id, error } = await superClient.rpc("create_catalog_item", {
        target_kind: kind,
        target_garment_layer: garment_layer ?? "",
        target_name: `${name} ${randomUUID().slice(0, 8)}`,
      });
      if (error || !id) throw error ?? new Error("No se pudo crear un catálogo sintético.");
      catalogIds.push(id);
      createdItems.push({ id, kind, garment_layer });
    }
    catalog = {
      garmentUpper: createdItems.find((item) => item.kind === "garment" && item.garment_layer === "upper")!.id,
      garmentLower: createdItems.find((item) => item.kind === "garment" && item.garment_layer === "lower")!.id,
      neckline: createdItems.find((item) => item.kind === "neckline")!.id,
      upperPattern: createdItems.find((item) => item.kind === "upper_pattern")!.id,
      lowerPattern: createdItems.find((item) => item.kind === "lower_pattern")!.id,
      fabric: createdItems.find((item) => item.kind === "fabric")!.id,
      extra: createdItems.find((item) => item.kind === "extra")!.id,
    };

    const projected = await admin.from("catalog_products").select("id, legacy_catalog_item_id, garment_layer").in("legacy_catalog_item_id", [catalog.garmentUpper, catalog.garmentLower]);
    if (projected.error || projected.data.length !== 2) throw projected.error ?? new Error("No se proyectaron las prendas M3.");
    const upperProduct = projected.data.find((product) => product.garment_layer === "upper");
    const lowerProduct = projected.data.find((product) => product.garment_layer === "lower");
    if (!upperProduct || !lowerProduct) throw new Error("Las prendas M3 no conservaron su clasificación.");
    lineProducts = { upper: upperProduct.id, lower: lowerProduct.id };

    Object.assign(globalThis, { __m3Identities: { superAdmin, adminUser, attention, employee } });
  });

  afterAll(async () => {
    const failures: string[] = [];
    async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await operation;
      if (error) failures.push(`${label}: ${error.message}`);
    }

    if (orderIds.length) {
      await cleanup("order_stage_events", admin.from("order_stage_events").delete().in("order_id", orderIds));
      const { data: lines } = await admin.from("order_lines").select("id").in("order_id", orderIds);
      const lineIds = (lines ?? []).map((line) => line.id);
      if (lineIds.length) await cleanup("order_line_shields", admin.from("order_line_shields").delete().in("order_line_id", lineIds));
      await cleanup("order_lines", admin.from("order_lines").delete().in("order_id", orderIds));
      await cleanup("order_catalog_items", admin.from("order_catalog_items").delete().in("order_id", orderIds));
      await cleanup("order_financials", admin.from("order_financials").delete().in("order_id", orderIds));
      await cleanup("orders", admin.from("orders").delete().in("id", orderIds));
    }
    const actorIds = identities.map((identity) => identity.id);
    if (actorIds.length) await cleanup("catalog_item_events", admin.from("catalog_item_events").delete().in("actor_id", actorIds));
    const projectedProductIds: string[] = [];
    if (catalogIds.length) {
      const projectedProducts = await admin.from("catalog_products").select("id").in("legacy_catalog_item_id", catalogIds);
      if (projectedProducts.error) failures.push(`buscar productos proyectados: ${projectedProducts.error.message}`);
      else projectedProductIds.push(...projectedProducts.data.map(({ id }) => id));
    }
    const ownProductIds = projectedProductIds;
    if (ownProductIds.length) await cleanup("catalog_products", admin.from("catalog_products").delete().in("id", [...new Set(ownProductIds)]));
    if (catalogIds.length) {
      await cleanup("catalog_items", admin.from("catalog_items").delete().in("id", catalogIds));
    }
    for (const identity of identities) {
      await cleanup(`auth user ${identity.id}`, admin.auth.admin.deleteUser(identity.id));
    }
    if (failures.length) throw new Error(`Falló el cleanup M3:\n${failures.join("\n")}`);
  });

  it("permite crear pedidos a Super admin, Admin y Atención, de forma idempotente", async () => {
    const identitiesByRole = (globalThis as typeof globalThis & { __m3Identities: Record<string, { email: string }> }).__m3Identities;
    for (const role of ["superAdmin", "adminUser", "attention"] as const) {
      const client = await signedClient(identitiesByRole[role]);
      const input = orderInput(`m3-${role}`);
      const first = await client.rpc("create_order", input);
      if (first.data?.[0]) orderIds.push(first.data[0].order_id);
      expect(first.error).toBeNull();
      expect(first.data).toHaveLength(1);
      expect(first.data?.[0]?.stage_code).toBe("received");

      const retry = await client.rpc("create_order", input);
      expect(retry.error).toBeNull();
      expect(retry.data?.[0]?.order_id).toBe(first.data?.[0]?.order_id);
    }
  });

  it("rechaza a Empleado y protege los importes con RLS", async () => {
    const identitiesByRole = (globalThis as typeof globalThis & { __m3Identities: Record<string, { email: string }> }).__m3Identities;
    const employee = await signedClient(identitiesByRole.employee);
    expect((await employee.rpc("create_order", orderInput("m3-employee"))).error).not.toBeNull();
    expect((await employee.from("order_financials").select("order_id")).data).toEqual([]);
  });

  it("crea prendas individuales superiores e inferiores mediante la RPC", async () => {
    const identitiesByRole = (globalThis as typeof globalThis & { __m3Identities: Record<string, { email: string }> }).__m3Identities;
    const client = await signedClient(identitiesByRole.attention);
    const upper = {
      ...orderInput(`m3-individual-upper-${randomUUID()}`),
       p_lines: [{ position: 0, line_type: "individual" as const, product_id: lineProducts.upper, quantity: 12, options: [], configuration: { legacy_options: { neckline_id: catalog.neckline, upper_pattern_id: catalog.upperPattern, fabric_id: catalog.fabric, extra_ids: [catalog.extra] } }, shield_product_ids: [] }],
    };
    const lower = {
      ...orderInput(`m3-individual-lower-${randomUUID()}`),
       p_lines: [{ position: 0, line_type: "individual" as const, product_id: lineProducts.lower, quantity: 12, options: [], configuration: { legacy_options: { lower_pattern_id: catalog.lowerPattern, fabric_id: catalog.fabric, extra_ids: [catalog.extra] } }, shield_product_ids: [] }],
    };

    for (const input of [upper, lower]) {
      const { data, error } = await client.rpc("create_order", input);
      if (data?.[0]) orderIds.push(data[0].order_id);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    }
  });

  it("revierte atómicamente el alta si un catálogo no existe", async () => {
    const identitiesByRole = (globalThis as typeof globalThis & { __m3Identities: Record<string, { email: string }> }).__m3Identities;
    const client = await signedClient(identitiesByRole.superAdmin);
    const idempotencyKey = `m3-invalid-catalog-${randomUUID()}`;
    const input = { ...orderInput(idempotencyKey), p_lines: [{ ...orderInput(idempotencyKey).p_lines[0], configuration: { upper: { product_id: randomUUID(), options: [] }, lower: { product_id: lineProducts.lower, options: [] } } }] };

    expect((await client.rpc("create_order", input)).error).not.toBeNull();
    const { data, error } = await client.from("orders").select("id").eq("idempotency_key", idempotencyKey);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("rechaza reutilizar una clave idempotente con otro payload", async () => {
    const identitiesByRole = (globalThis as typeof globalThis & { __m3Identities: Record<string, { email: string }> }).__m3Identities;
    const client = await signedClient(identitiesByRole.superAdmin);
    const idempotencyKey = `m3-fingerprint-${randomUUID()}`;
    const input = orderInput(idempotencyKey);
    const { data, error } = await client.rpc("create_order", input);
    if (data?.[0]) orderIds.push(data[0].order_id);
    expect(error).toBeNull();

    const changed = await client.rpc("create_order", { ...input, p_lines: [{ ...input.p_lines[0], quantity: input.p_lines[0].quantity + 1 }] });
    expect(changed.error?.message).toContain("La clave de creación ya fue utilizada para otro pedido.");
    const { count, error: countError } = await client
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("idempotency_key", idempotencyKey);
    expect(countError).toBeNull();
    expect(count).toBe(1);
  });

  it("limita la administración de catálogos a Super admin y Admin", async () => {
    const identitiesByRole = (globalThis as typeof globalThis & { __m3Identities: Record<string, { email: string }> }).__m3Identities;
    const [adminClient, attentionClient, employeeClient] = await Promise.all([
      signedClient(identitiesByRole.adminUser),
      signedClient(identitiesByRole.attention),
      signedClient(identitiesByRole.employee),
    ]);
    const targetName = `Tela permisos ${randomUUID().slice(0, 8)}`;
    const { data: targetId, error } = await adminClient.rpc("create_catalog_item", {
      target_kind: "fabric",
      target_garment_layer: "",
      target_name: targetName,
    });
    expect(error).toBeNull();
    expect(targetId).toBeTruthy();
    if (targetId) catalogIds.push(targetId);

    for (const client of [attentionClient, employeeClient]) {
      expect((await client.rpc("create_catalog_item", {
        target_kind: "fabric",
        target_garment_layer: "",
        target_name: `Sin permiso ${randomUUID().slice(0, 8)}`,
      })).error).not.toBeNull();
      expect((await client.rpc("delete_catalog_item", { target_id: targetId! })).error).not.toBeNull();
    }

    expect((await adminClient.rpc("delete_catalog_item", { target_id: targetId! })).error).toBeNull();
  });

  it("conserva el snapshot al desactivar un producto usado por un pedido", async () => {
    const identitiesByRole = (globalThis as typeof globalThis & { __m3Identities: Record<string, { email: string }> }).__m3Identities;
    const superClient = await signedClient(identitiesByRole.superAdmin);
    const productName = `Prenda M3 ${randomUUID().slice(0, 8)}`;
    const { data: legacyItemId, error: createError } = await superClient.rpc("create_catalog_item", {
      target_kind: "garment",
      target_garment_layer: "upper",
      target_name: productName,
    });
    expect(createError).toBeNull();
    expect(legacyItemId).toBeTruthy();
    if (!legacyItemId) throw new Error("No se pudo crear la prenda sintética.");
    catalogIds.push(legacyItemId);
    const projection = await admin.from("catalog_products").select("id").eq("legacy_catalog_item_id", legacyItemId).single();
    expect(projection.error).toBeNull();
    const productId = projection.data!.id;

    const input = {
      ...orderInput(`m3-deactivate-${randomUUID()}`),
      p_lines: [{ position: 0, line_type: "individual" as const, product_id: productId, quantity: 12, options: [], configuration: { legacy_options: { neckline_id: catalog.neckline, upper_pattern_id: catalog.upperPattern, fabric_id: catalog.fabric, extra_ids: [] } }, shield_product_ids: [] }],
    };
    const { data: created, error: orderError } = await superClient.rpc("create_order", input);
    if (created?.[0]) orderIds.push(created[0].order_id);
    expect(orderError).toBeNull();
    expect(created).toHaveLength(1);
    const orderId = created![0].order_id;

    const { error: deactivateError } = await superClient.rpc("set_catalog_product_active", { target_id: productId, target_is_active: false });
    expect(deactivateError).toBeNull();

    const { data: selection, error: selectionError } = await superClient
      .from("order_lines")
      .select("product_id, product_name_snapshot")
      .eq("order_id", orderId)
      .single();

    expect(selectionError).toBeNull();
    expect(selection).toEqual({ product_id: productId, product_name_snapshot: productName });
  });
});
