import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const localUrl = url ?? "http://127.0.0.1:54321";
const password = `M5M6${randomUUID().replaceAll("-", "")}7`;

type Role = Database["public"]["Enums"]["app_role"];
type Identity = { email: string; id: string; role: Role };
type RestError = { message: string };
type RestResult<T> = { data: T | null; error: RestError | null };
type OrderSeed = { id: string; updatedAt: string };
type Catalog = Record<"garmentUpper" | "neckline" | "upperPattern" | "fabric", string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorFrom(value: unknown): RestError {
  return isRecord(value) && typeof value.message === "string"
    ? { message: value.message }
    : { message: "La solicitud no devolvió un error legible." };
}

describe.skipIf(!url || !serviceRoleKey || !publishableKey)("Colaboración de pedidos M5/M6", () => {
  const admin = createClient<Database>(localUrl, serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const orderIds: string[] = [];
  const catalogIds: string[] = [];
  let catalog: Catalog;
  let receivedStageId: string;

  async function createIdentity(role: Role, options?: { active?: boolean; mustChangePassword?: boolean }) {
    const email = `${role}-m5m6-${randomUUID()}@digraf.local`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No se pudo crear una identidad sintética M5/M6.");

    const { error: profileError } = await admin.from("profiles").insert({
      id: data.user.id,
      display_name: `M5 M6 ${role}`,
      role,
      is_active: options?.active ?? true,
      must_change_password: options?.mustChangePassword ?? false,
    });
    if (profileError) throw profileError;

    const identity = { email, id: data.user.id, role };
    identities.push(identity);
    return identity;
  }

  async function tokenFor(identity: Pick<Identity, "email">) {
    const client = createClient<Database>(localUrl, publishableKey ?? "test-key", { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: identity.email, password });
    if (error || !data.session) throw error ?? new Error("No se pudo iniciar una sesión sintética M5/M6.");
    return data.session.access_token;
  }

  async function request<T>(path: string, options: { body?: unknown; method?: "DELETE" | "GET" | "PATCH" | "POST"; token?: string } = {}): Promise<RestResult<T>> {
    const response = await fetch(`${localUrl}${path}`, {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        apikey: publishableKey ?? "test-key",
        Authorization: `Bearer ${options.token ?? publishableKey ?? "test-key"}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      method: options.method ?? "POST",
    });
    const text = await response.text();
    const parsed: unknown = text ? JSON.parse(text) : null;
    return response.ok
      ? { data: parsed as T, error: null }
      : { data: null, error: errorFrom(parsed) };
  }

  async function createCatalog(kind: Database["public"]["Enums"]["catalog_item_kind"], name: string, garmentLayer: "upper" | "lower" | null = null) {
    const { data, error } = await admin
      .from("catalog_items")
      .insert({
        kind,
        garment_layer: garmentLayer,
        name,
        created_by: identities[0]!.id,
        updated_by: identities[0]!.id,
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("No se pudo crear un catálogo sintético M5/M6.");
    catalogIds.push(data.id);
    return data.id;
  }

  async function createOrder(): Promise<OrderSeed> {
    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        customer_name: `Pedido M5 M6 ${randomUUID().slice(0, 8)}`,
        quantity: 4,
        order_type: "individual",
        order_date: "2026-07-29",
        promised_delivery_date: "2026-08-05",
        current_stage_id: receivedStageId,
        created_by: identities[0]!.id,
        idempotency_key: `seed-m5m6-${randomUUID()}`,
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      })
      .select("id, updated_at")
      .single();
    if (orderError || !order) throw orderError ?? new Error("No se pudo crear un pedido sintético M5/M6.");
    orderIds.push(order.id);

    const { error: financialError } = await admin.from("order_financials").insert({
      order_id: order.id,
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
      order_id: order.id,
      catalog_item_id: catalogItemId,
      selection_key: selectionKey,
      catalog_kind: catalogKind,
      garment_layer: garmentLayer,
      item_name: itemName,
    })));
    if (selectionsError) throw selectionsError;

    return { id: order.id, updatedAt: order.updated_at };
  }

  function sensitiveInput(order: OrderSeed, overrides: Record<string, unknown> = {}) {
    return {
      p_order_id: order.id,
      p_customer_name: "Equipo M5 M6",
      p_quantity: 8,
      p_order_type: "individual",
      p_order_date: "2026-07-29",
      p_promised_delivery_date: "2026-08-07",
      p_description: "Detalle actualizado",
      p_total_amount: 2000,
      p_deposit_amount: 500,
      p_deposit_paid: true,
      p_garment_upper_id: catalog.garmentUpper,
      p_garment_lower_id: null,
      p_neckline_id: catalog.neckline,
      p_upper_pattern_id: catalog.upperPattern,
      p_lower_pattern_id: null,
      p_fabric_id: catalog.fabric,
      p_extra_ids: [],
      p_expected_updated_at: order.updatedAt,
      p_idempotency_key: randomUUID(),
      ...overrides,
    };
  }

  beforeAll(async () => {
    const { data: stage, error } = await admin.from("workflow_stages").select("id").eq("code", "received").single();
    if (error || !stage) throw error ?? new Error("No se encontró la etapa inicial.");
    receivedStageId = stage.id;

    for (const role of ["super_admin", "admin", "attention", "employee"] as const) await createIdentity(role);
    catalog = {
      garmentUpper: await createCatalog("garment", "Remera M5 M6", "upper"),
      neckline: await createCatalog("neckline", "Redondo M5 M6"),
      upperPattern: await createCatalog("upper_pattern", "Recto M5 M6"),
      fabric: await createCatalog("fabric", "Microfibra M5 M6"),
    };
  });

  afterAll(async () => {
    const failures: string[] = [];
    async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await operation;
      if (error) failures.push(`${label}: ${error.message}`);
    }

    if (orderIds.length) {
      const ids = orderIds.join(",");
      await request<unknown[]>(`/rest/v1/order_comments?order_id=in.(${ids})`, { method: "DELETE", token: serviceRoleKey });
      await request<unknown[]>(`/rest/v1/order_change_events?order_id=in.(${ids})`, { method: "DELETE", token: serviceRoleKey });
      await cleanup("order_stage_events", admin.from("order_stage_events").delete().in("order_id", orderIds));
      await cleanup("order_catalog_items", admin.from("order_catalog_items").delete().in("order_id", orderIds));
      await cleanup("order_financials", admin.from("order_financials").delete().in("order_id", orderIds));
      await cleanup("orders", admin.from("orders").delete().in("id", orderIds));
    }
    if (catalogIds.length) await cleanup("catalog_items", admin.from("catalog_items").delete().in("id", catalogIds));
    for (const identity of identities) await cleanup(`auth user ${identity.id}`, admin.auth.admin.deleteUser(identity.id));
    if (failures.length) throw new Error(`Falló el cleanup M5/M6:\n${failures.join("\n")}`);
  });

  it("permite a todos los roles editar solo la descripción y comentar sin cambiar updated_at", async () => {
    for (const identity of identities) {
      const order = await createOrder();
      const token = await tokenFor(identity);
      const description = await request<Array<{ event_id: string; order_id: string; updated_at: string }>>("/rest/v1/rpc/update_order_description", {
        body: {
          p_order_id: order.id,
          p_description: `Descripción de ${identity.role}`,
          p_expected_updated_at: order.updatedAt,
          p_idempotency_key: randomUUID(),
        },
        token,
      });
      expect(description.error).toBeNull();
      expect(description.data?.[0]?.order_id).toBe(order.id);

      const updatedAt = description.data?.[0]?.updated_at;
      const commentKey = randomUUID();
      const commentBody = `Comentario de ${identity.role}`;
      const comment = await request<Array<{ comment_id: string }>>("/rest/v1/rpc/create_order_comment", {
        body: { p_order_id: order.id, p_body: commentBody, p_idempotency_key: commentKey },
        token,
      });
      expect(comment.error).toBeNull();
      const replay = await request<Array<{ comment_id: string }>>("/rest/v1/rpc/create_order_comment", {
        body: { p_order_id: order.id, p_body: commentBody, p_idempotency_key: commentKey },
        token,
      });
      expect(replay.error).toBeNull();
      expect(replay.data?.[0]?.comment_id).toBe(comment.data?.[0]?.comment_id);

      const { data: persisted, error } = await admin.from("orders").select("description, updated_at").eq("id", order.id).single();
      expect(error).toBeNull();
      expect(persisted).toEqual({ description: `Descripción de ${identity.role}`, updated_at: updatedAt });
    }
  });

  it("limita la edición sensible a Super admin y Admin, audita la fecha y preserva snapshots eliminados", async () => {
    const order = await createOrder();
    const superAdmin = identities.find((identity) => identity.role === "super_admin")!;
    const adminIdentity = identities.find((identity) => identity.role === "admin")!;
    const attention = identities.find((identity) => identity.role === "attention")!;
    const employee = identities.find((identity) => identity.role === "employee")!;

    const deletedFabric = await createCatalog("fabric", "Microfibra eliminada M5 M6");
    const { error: removeCurrentFabricError } = await admin
      .from("order_catalog_items")
      .delete()
      .eq("order_id", order.id)
      .eq("selection_key", "fabric");
    expect(removeCurrentFabricError).toBeNull();
    const { error: insertDeletedFabricError } = await admin.from("order_catalog_items").insert({
      order_id: order.id,
      catalog_item_id: deletedFabric,
      selection_key: "fabric",
      catalog_kind: "fabric",
      item_name: "Microfibra eliminada M5 M6",
    });
    expect(insertDeletedFabricError).toBeNull();
    const { error: deleteCatalogError } = await admin.from("catalog_items").delete().eq("id", deletedFabric);
    expect(deleteCatalogError).toBeNull();

    const input = sensitiveInput(order, { p_fabric_id: null });
    const first = await request<Array<{ event_id: string; updated_at: string }>>("/rest/v1/rpc/update_order", { body: input, token: await tokenFor(superAdmin) });
    expect(first.error).toBeNull();

    const replay = await request<Array<{ event_id: string }>>("/rest/v1/rpc/update_order", { body: input, token: await tokenFor(superAdmin) });
    expect(replay.error).toBeNull();
    expect(replay.data?.[0]?.event_id).toBe(first.data?.[0]?.event_id);

    const { data: changeEvents, error: eventError } = await request<Array<{ action: string; details: { previous_promised_delivery_date: string; next_promised_delivery_date: string } }>>(
      `/rest/v1/order_change_events?order_id=eq.${order.id}&select=action,details`,
      { method: "GET", token: serviceRoleKey },
    );
    expect(eventError).toBeNull();
    expect(changeEvents).toEqual([{
      action: "promised_delivery_date_changed",
      details: { previous_promised_delivery_date: "2026-08-05", next_promised_delivery_date: "2026-08-07" },
    }]);

    const { data: preserved, error: preservedError } = await admin
      .from("order_catalog_items")
      .select("catalog_item_id, item_name")
      .eq("order_id", order.id)
      .eq("selection_key", "fabric")
      .single();
    expect(preservedError).toBeNull();
    expect(preserved).toEqual({ catalog_item_id: null, item_name: "Microfibra eliminada M5 M6" });

    const current = { ...order, updatedAt: first.data?.[0]?.updated_at ?? "" };
    for (const identity of [attention, employee]) {
      const denied = await request<unknown[]>("/rest/v1/rpc/update_order", {
        body: sensitiveInput(current, { p_fabric_id: null, p_idempotency_key: randomUUID() }),
        token: await tokenFor(identity),
      });
      expect(denied.error?.message).toContain("datos sensibles");
    }

    const adminUpdate = await request<Array<{ order_id: string }>>("/rest/v1/rpc/update_order", {
      body: sensitiveInput(current, { p_fabric_id: null, p_idempotency_key: randomUUID() }),
      token: await tokenFor(adminIdentity),
    });
    expect(adminUpdate.error).toBeNull();
  });

  it("rechaza escrituras directas, actores no válidos y conserva la frontera financiera", async () => {
    const order = await createOrder();
    const employee = identities.find((identity) => identity.role === "employee")!;
    const employeeToken = await tokenFor(employee);
    const anonymous = await request<unknown[]>("/rest/v1/rpc/create_order_comment", {
      body: { p_order_id: order.id, p_body: "Sin sesión", p_idempotency_key: randomUUID() },
    });
    expect(anonymous.error).not.toBeNull();

    const directComment = await request<unknown[]>("/rest/v1/order_comments", {
      body: { order_id: order.id, actor_id: employee.id, body: "Escritura directa", idempotency_key: randomUUID(), idempotency_fingerprint: randomUUID().replaceAll("-", "") },
      token: employeeToken,
    });
    expect(directComment.error).not.toBeNull();

    const finances = await request<Array<{ order_id: string }>>("/rest/v1/order_financials?select=order_id", { method: "GET", token: employeeToken });
    expect(finances.error).toBeNull();
    expect(finances.data).toEqual([]);

    const inactive = await createIdentity("employee", { active: false });
    const requiredChange = await createIdentity("employee", { mustChangePassword: true });
    for (const identity of [inactive, requiredChange]) {
      const denied = await request<unknown[]>("/rest/v1/rpc/create_order_comment", {
        body: { p_order_id: order.id, p_body: "No permitido", p_idempotency_key: randomUUID() },
        token: await tokenFor(identity),
      });
      expect(denied.error).not.toBeNull();
    }
  });

  it("publica una timeline determinista con actores sin habilitar lectura general de perfiles", async () => {
    const order = await createOrder();
    const superAdmin = identities.find((identity) => identity.role === "super_admin")!;
    const employee = identities.find((identity) => identity.role === "employee")!;
    const superToken = await tokenFor(superAdmin);
    const employeeToken = await tokenFor(employee);

    const change = await request<unknown[]>("/rest/v1/rpc/update_order_description", {
      body: {
        p_order_id: order.id,
        p_description: "Cambio para timeline",
        p_expected_updated_at: order.updatedAt,
        p_idempotency_key: randomUUID(),
      },
      token: superToken,
    });
    expect(change.error).toBeNull();

    const comment = await request<unknown[]>("/rest/v1/rpc/create_order_comment", {
      body: { p_order_id: order.id, p_body: "Comentario para timeline", p_idempotency_key: randomUUID() },
      token: superToken,
    });
    expect(comment.error).toBeNull();

    const timeline = await request<Array<{ actor_display_name: string; event_id: string; event_type: string; occurred_at: string }>>(
      "/rest/v1/rpc/get_order_timeline",
      { body: { p_order_id: order.id }, token: employeeToken },
    );
    expect(timeline.error).toBeNull();
    expect(timeline.data?.map((event) => event.event_type)).toEqual(["commented", "order_updated"]);
    expect(timeline.data?.[0]).toMatchObject({ actor_display_name: "M5 M6 super_admin", event_type: "commented" });
    for (let index = 1; index < (timeline.data?.length ?? 0); index += 1) {
      const previous = timeline.data![index - 1]!;
      const current = timeline.data![index]!;
      if (previous.occurred_at === current.occurred_at) {
        if (previous.event_type === current.event_type) {
          expect(previous.event_id <= current.event_id).toBe(true);
        } else {
          expect(previous.event_type <= current.event_type).toBe(true);
        }
      } else {
        expect(previous.occurred_at > current.occurred_at).toBe(true);
      }
    }

    const profiles = await request<Array<{ id: string }>>("/rest/v1/profiles?select=id", { method: "GET", token: employeeToken });
    expect(profiles.error).toBeNull();
    expect(profiles.data).toEqual([{ id: employee.id }]);
  });

  it("serializa ediciones concurrentes y rechaza la versión perdedora", async () => {
    const order = await createOrder();
    const superAdmin = identities.find((identity) => identity.role === "super_admin")!;
    const adminIdentity = identities.find((identity) => identity.role === "admin")!;
    const [superToken, adminToken] = await Promise.all([tokenFor(superAdmin), tokenFor(adminIdentity)]);

    const updates = await Promise.all([
      request<Array<{ event_id: string }>>("/rest/v1/rpc/update_order_description", {
        body: {
          p_order_id: order.id,
          p_description: "Edición concurrente A",
          p_expected_updated_at: order.updatedAt,
          p_idempotency_key: randomUUID(),
        },
        token: superToken,
      }),
      request<Array<{ event_id: string }>>("/rest/v1/rpc/update_order_description", {
        body: {
          p_order_id: order.id,
          p_description: "Edición concurrente B",
          p_expected_updated_at: order.updatedAt,
          p_idempotency_key: randomUUID(),
        },
        token: adminToken,
      }),
    ]);

    expect(updates.filter((result) => result.error === null)).toHaveLength(1);
    expect(updates.filter((result) => result.error?.message.includes("cambió en otra sesión"))).toHaveLength(1);

    const { count, error } = await admin
      .from("order_change_events")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id);
    expect(error).toBeNull();
    expect(count).toBe(1);
  });
});
