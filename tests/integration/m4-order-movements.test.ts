import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = `M4${randomUUID().replaceAll("-", "")}7`;
const localUrl = url ?? "http://127.0.0.1:54396";

type Role = Database["public"]["Enums"]["app_role"];
type Identity = { email: string; id: string; role: Role };
type OrderSeed = { id: string; current_stage_id: string; updated_at: string };

describe.skipIf(!url || !serviceRoleKey || !publishableKey)("Movimientos auditados M4", () => {
  const admin = createClient<Database>(localUrl, serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const orderIds: string[] = [];
  let stages: Record<string, string> = {};

  async function createIdentity(role: Role, options?: { active?: boolean; mustChangePassword?: boolean }) {
    const email = `${role}-m4-${randomUUID()}@digraf.local`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No se pudo crear una identidad sintética M4.");

    const { error: profileError } = await admin.from("profiles").insert({
      id: data.user.id,
      display_name: `M4 ${role}`,
      role,
      is_active: options?.active ?? true,
      must_change_password: options?.mustChangePassword ?? false,
    });
    if (profileError) throw profileError;

    const identity = { email, id: data.user.id, role };
    identities.push(identity);
    return identity;
  }

  async function signedClient(identity: Pick<Identity, "email">): Promise<SupabaseClient<Database>> {
    const client = createClient<Database>(localUrl, publishableKey ?? "test-key", { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email: identity.email, password });
    if (error) throw error;
    return client;
  }

  async function createOrder(stageCode = "received") {
    const { data, error } = await admin
      .from("orders")
      .insert({
        customer_name: `Pedido M4 ${randomUUID().slice(0, 8)}`,
        quantity: 1,
        order_type: "individual",
        order_date: "2026-07-28",
        promised_delivery_date: "2026-07-29",
        current_stage_id: stages[stageCode]!,
        created_by: identities[0]!.id,
        idempotency_key: `seed-m4-${randomUUID()}`,
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      })
      .select("id, current_stage_id, updated_at")
      .single();
    if (error || !data) throw error ?? new Error("No se pudo crear un pedido sintético M4.");
    if (data.current_stage_id === null) throw new Error("El pedido M4 no devolvió una etapa operativa.");
    orderIds.push(data.id);
    return { ...data, current_stage_id: data.current_stage_id } satisfies OrderSeed;
  }

  async function move(
    client: SupabaseClient<Database>,
    order: { id: string; current_stage_id: string; updated_at: string },
    targetCode: string,
    idempotencyKey = randomUUID(),
  ) {
    return client.rpc("move_order", {
      p_order_id: order.id,
      p_from_stage_id: order.current_stage_id,
      p_to_stage_id: stages[targetCode]!,
      p_expected_updated_at: order.updated_at,
      p_idempotency_key: idempotencyKey,
    });
  }

  beforeAll(async () => {
    const stageResult = await admin.from("workflow_stages").select("id, code");
    if (stageResult.error) throw stageResult.error;
    stages = Object.fromEntries(stageResult.data.map((stage) => [stage.code, stage.id]));

    for (const role of ["super_admin", "admin", "attention", "employee"] as const) {
      await createIdentity(role);
    }
  });

  afterAll(async () => {
    const failures: string[] = [];
    async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await operation;
      if (error) failures.push(`${label}: ${error.message}`);
    }

    if (orderIds.length) {
      await cleanup("order_stage_events", admin.from("order_stage_events").delete().in("order_id", orderIds));
      await cleanup("orders", admin.from("orders").delete().in("id", orderIds));
    }
    for (const identity of identities) await cleanup(`auth user ${identity.id}`, admin.auth.admin.deleteUser(identity.id));
    if (failures.length) throw new Error(`Falló el cleanup M4:\n${failures.join("\n")}`);
  });

  it("permite movimientos no financieros a todos los roles operativos y registra un único evento", async () => {
    for (const identity of identities) {
      const client = await signedClient(identity);
      const order = await createOrder();
      const { data, error } = await move(client, order, "design");

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]).toMatchObject({ order_id: order.id, from_stage_id: stages.received, to_stage_id: stages.design, stage_code: "design" });

      const { data: events, error: eventError } = await admin
        .from("order_stage_events")
        .select("actor_id, from_stage_id, to_stage_id")
        .eq("order_id", order.id);
      expect(eventError).toBeNull();
      expect(events).toEqual([{ actor_id: identity.id, from_stage_id: stages.received, to_stage_id: stages.design }]);
    }
  });

  it("rechaza sesión ausente, perfil inactivo y cambio obligatorio de contraseña", async () => {
    const order = await createOrder();
    const anonymous = createClient<Database>(localUrl, publishableKey ?? "test-key", { auth: { persistSession: false } });
    expect((await move(anonymous, order, "design")).error).not.toBeNull();

    const inactive = await createIdentity("employee", { active: false });
    const requiredChange = await createIdentity("employee", { mustChangePassword: true });
    expect((await move(await signedClient(inactive), order, "design")).error).not.toBeNull();
    expect((await move(await signedClient(requiredChange), order, "design")).error).not.toBeNull();
  });

  it("rechaza entradas a paid y toda salida pagada salvo Entregado", async () => {
    const client = await signedClient(identities[0]!);
    const order = await createOrder();
    const { error } = await move(client, order, "paid");
    expect(error?.message).toContain("Pagado");

    const { data: unchanged, error: orderError } = await admin
      .from("orders")
      .select("current_stage_id, updated_at")
      .eq("id", order.id)
      .single();
    const { count, error: eventError } = await admin
      .from("order_stage_events")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id);
    expect(orderError).toBeNull();
    expect(eventError).toBeNull();
    expect(unchanged).toEqual({ current_stage_id: stages.received, updated_at: order.updated_at });
    expect(count).toBe(0);

    const paidOrder = await createOrder("paid");
    expect((await move(client, paidOrder, "cut")).error?.message).toContain("entregar");
  });

  it("permite Pagado -> Entregado a roles autorizados y conserva un único evento en replay", async () => {
    for (const role of ["super_admin", "admin", "attention"] as const) {
      const client = await signedClient(identities.find((identity) => identity.role === role)!);
      const paidOrder = await createOrder("paid");
      const key = randomUUID();
      const first = await move(client, paidOrder, "delivered", key);
      const replay = await move(client, paidOrder, "delivered", key);
      expect(first.error).toBeNull();
      expect(replay.error).toBeNull();
      expect(replay.data?.[0]?.event_id).toBe(first.data?.[0]?.event_id);
      const { count } = await admin.from("order_stage_events").select("id", { count: "exact", head: true }).eq("order_id", paidOrder.id);
      expect(count).toBe(1);
    }
  });

  it("rechaza a Empleado al mover hacia o desde Pagado", async () => {
    const employee = identities.find((identity) => identity.role === "employee")!;
    const client = await signedClient(employee);
    const receivedOrder = await createOrder();
    const paidOrder = await createOrder("paid");

    expect((await move(client, receivedOrder, "paid")).error?.message).toContain("Pagado");
    expect((await move(client, paidOrder, "delivered")).error?.message).toContain("permiso");
  });

  it("rechaza escrituras directas y preserva los importes fuera del alcance de Empleado", async () => {
    const employee = await signedClient(identities.find((identity) => identity.role === "employee")!);
    const order = await createOrder();
    expect((await employee.from("orders").update({ current_stage_id: stages.design }).eq("id", order.id)).error).not.toBeNull();
    expect((await employee.from("order_stage_events").insert({
      order_id: order.id,
      from_stage_id: stages.received,
      to_stage_id: stages.design,
      actor_id: identities[0]!.id,
    })).error).not.toBeNull();
    expect((await employee.from("order_financials").select("order_id")).data).toEqual([]);
  });

  it("reintenta idempotentemente sin crear otro evento y rechaza reutilizar la clave con otro payload", async () => {
    const client = await signedClient(identities[0]!);
    const order = await createOrder();
    const key = randomUUID();
    const first = await move(client, order, "design", key);
    const retry = await move(client, order, "design", key);
    expect(first.error).toBeNull();
    expect(retry.error).toBeNull();
    expect(retry.data?.[0]?.event_id).toBe(first.data?.[0]?.event_id);

    const { count } = await admin.from("order_stage_events").select("id", { count: "exact", head: true }).eq("order_id", order.id);
    expect(count).toBe(1);
    expect((await move(client, order, "cut", key)).error?.message).toContain("idempotencia");
  });

  it("resuelve dos solicitudes concurrentes con la misma clave como un único movimiento", async () => {
    const client = await signedClient(identities[0]!);
    const order = await createOrder();
    const key = randomUUID();
    const [first, second] = await Promise.all([
      move(client, order, "design", key),
      move(client, order, "design", key),
    ]);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.data?.[0]?.event_id).toBe(second.data?.[0]?.event_id);

    const { count } = await admin.from("order_stage_events").select("id", { count: "exact", head: true }).eq("order_id", order.id);
    expect(count).toBe(1);
  });

  it("rechaza la transición obsoleta cuando compiten actores distintos", async () => {
    const firstClient = await signedClient(identities[0]!);
    const secondClient = await signedClient(identities[1]!);
    const order = await createOrder();
    const [first, second] = await Promise.all([
      move(firstClient, order, "design"),
      move(secondClient, order, "cut"),
    ]);

    expect([first.error, second.error].filter(Boolean)).toHaveLength(1);
    expect([first.data, second.data].filter(Boolean)).toHaveLength(1);

    const { count } = await admin.from("order_stage_events").select("id", { count: "exact", head: true }).eq("order_id", order.id);
    expect(count).toBe(1);
  });

  it("devuelve el timestamp del evento en un replay histórico", async () => {
    const client = await signedClient(identities[0]!);
    const order = await createOrder();
    const key = randomUUID();
    const first = await move(client, order, "design", key);
    const firstEvent = first.data?.[0];
    if (!firstEvent) throw new Error("El primer movimiento M4 no devolvió un evento.");

    const second = await move(client, {
      id: order.id,
      current_stage_id: firstEvent.to_stage_id,
      updated_at: firstEvent.updated_at,
    }, "cut");
    expect(second.error).toBeNull();

    const { data: event, error: eventError } = await admin
      .from("order_stage_events")
      .select("created_at")
      .eq("id", firstEvent.event_id)
      .single();
    expect(eventError).toBeNull();

    const replay = await move(client, order, "design", key);
    expect(replay.error).toBeNull();
    expect(replay.data?.[0]).toMatchObject({
      to_stage_id: stages.design,
      stage_code: "design",
      updated_at: event?.created_at,
      event_id: firstEvent.event_id,
    });
  });

  it("rechaza una transición obsoleta cuando dos movimientos compiten", async () => {
    const client = await signedClient(identities[0]!);
    const order = await createOrder();
    const [first, second] = await Promise.all([
      move(client, order, "design"),
      move(client, order, "cut"),
    ]);
    expect([first.error, second.error].filter(Boolean)).toHaveLength(1);
    expect([first.data, second.data].filter(Boolean)).toHaveLength(1);

    const { count } = await admin.from("order_stage_events").select("id", { count: "exact", head: true }).eq("order_id", order.id);
    expect(count).toBe(1);
  });
});
