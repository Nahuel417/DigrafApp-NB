import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const localUrl = url ?? "http://127.0.0.1:54396";
const password = `M15${randomUUID().replaceAll("-", "")}7`;
const dayMs = 30 * 24 * 60 * 60 * 1000;

type Role = "super_admin" | "admin" | "attention" | "employee";
type Identity = { email: string; id: string; role: Role };
type RpcResult = { data: Array<Record<string, unknown>> | null; error: { message: string } | null };
type Order = { id: string; current_stage_id: string; updated_at: string; public_number: number };
type Client = SupabaseClient<Database>;

describe.skipIf(!url || !serviceRoleKey || !publishableKey)("Anulación, Archivo y restauración M15", () => {
  const service = createClient<Database>(localUrl, serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const orderIds: string[] = [];
  const stageIds: Record<string, string> = {};

  async function createIdentity(role: Role, suffix = role) {
    const email = `${role}-m15-${suffix}-${randomUUID()}@digraf.local`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error(`No se pudo crear identidad M15 ${role}.`);
    const { error: profileError } = await service.from("profiles").insert({
      id: data.user.id,
      display_name: `M15 ${role}`,
      role,
      is_active: true,
      must_change_password: false,
    });
    if (profileError) throw profileError;
    const identity = { email, id: data.user.id, role };
    identities.push(identity);
    return identity;
  }

  async function signedClient(identity: Identity): Promise<Client> {
    const client = createClient<Database>(localUrl, publishableKey ?? "test-key", { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email: identity.email, password });
    if (error) throw error;
    return client;
  }

  async function invoke(client: Client, name: "cancel_order" | "restore_order", args: Record<string, unknown>): Promise<RpcResult> {
    const rpc = client.rpc.bind(client) as unknown as (rpcName: string, parameters: Record<string, unknown>) => Promise<RpcResult>;
    return rpc(name, args);
  }

  async function createOrder(stageCode = "received"): Promise<Order> {
    const { data, error } = await service.from("orders").insert({
      customer_name: `Pedido M15 ${randomUUID().slice(0, 8)}`,
      quantity: 2,
      order_type: "individual",
      order_date: "2026-08-14",
      promised_delivery_date: "2026-08-20",
      current_stage_id: stageIds[stageCode],
      created_by: identities.find((identity) => identity.role === "super_admin")!.id,
      idempotency_key: `seed-m15-${randomUUID()}`,
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    }).select("id, public_number, current_stage_id, updated_at").single();
    if (error || !data) throw error ?? new Error("No se pudo crear el pedido M15.");
    const { error: financialError } = await service.from("order_financials").insert({
      order_id: data.id,
      total_amount: 1250,
      deposit_amount: 250,
      deposit_paid: false,
    });
    if (financialError) throw financialError;
    orderIds.push(data.id);
    return data;
  }

  async function cancel(client: Client, order: Order, reason: string, key: string = randomUUID()) {
    return invoke(client, "cancel_order", {
      p_order_id: order.id,
      p_expected_updated_at: order.updated_at,
      p_reason: reason,
      p_idempotency_key: key,
    });
  }

  async function restore(client: Client, order: Order, key: string = randomUUID()) {
    return invoke(client, "restore_order", {
      p_order_id: order.id,
      p_expected_updated_at: order.updated_at,
      p_idempotency_key: key,
    });
  }

  async function currentOrder(orderId: string) {
    const { data, error } = await service.from("orders").select("*").eq("id", orderId).single();
    if (error || !data) throw error ?? new Error("No se pudo leer el pedido M15.");
    return data as Record<string, unknown>;
  }

  beforeAll(async () => {
    const { data, error } = await service.from("workflow_stages").select("id, code");
    if (error) throw error;
    Object.assign(stageIds, Object.fromEntries(data.map((stage) => [stage.code, stage.id])));
    await Promise.all([
      createIdentity("super_admin"),
      createIdentity("admin"),
      createIdentity("attention"),
      createIdentity("employee"),
    ]);
  });

  afterAll(async () => {
    if (orderIds.length) {
      const { error: restoreError } = await service.from("orders").update({
        lifecycle_state: "active",
        cancelled_at: null,
        cancelled_by: null,
        cancellation_reason: null,
      }).in("id", orderIds).eq("lifecycle_state", "cancelled");
      if (restoreError) throw restoreError;
      await service.from("order_design_images").delete().in("order_id", orderIds);
      const { data: lines } = await service.from("order_lines").select("id").in("order_id", orderIds);
      if (lines?.length) await service.from("order_line_shields").delete().in("order_line_id", lines.map((line) => line.id));
      await service.from("order_lines").delete().in("order_id", orderIds);
      await service.from("order_financials").delete().in("order_id", orderIds);
      await service.from("orders").delete().in("id", orderIds);
    }
    for (const identity of identities) {
      await service.from("profiles").delete().eq("id", identity.id);
      await service.auth.admin.deleteUser(identity.id);
    }
  });

  it("rechaza anulación y Archivo sin filtrar para sesión ausente, perfiles inválidos y roles operativos", async () => {
    const order = await createOrder();
    const anonymous = createClient<Database>(localUrl, publishableKey ?? "test-key", { auth: { persistSession: false } });
    const employee = await signedClient(identities.find((identity) => identity.role === "employee")!);
    const attention = await signedClient(identities.find((identity) => identity.role === "attention")!);

    for (const client of [anonymous, employee, attention]) {
      const result = await cancel(client, order, "Motivo válido");
      expect(result.error?.message.toLowerCase()).toMatch(/permiso|permission denied/);
    }

    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    expect((await cancel(admin, order, "Motivo válido")).error).toBeNull();
    const { data: directData, error: directError } = await employee.from("orders").select("id").eq("id", order.id).maybeSingle();
    expect(directError).toBeNull();
    expect(directData).toBeNull();
  });

  it("normaliza el motivo, exige 2–500 caracteres y reproduce el replay idéntico", async () => {
    const order = await createOrder();
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const key = `m15-replay-${randomUUID()}`;
    const args = { p_order_id: order.id, p_expected_updated_at: order.updated_at, p_reason: "  Cliente   pidió   pausa  ", p_idempotency_key: key };
    const first = await cancel(admin, order, args.p_reason, key);
    expect(first.error).toBeNull();
    expect(first.data?.[0]).toMatchObject({ order_id: order.id, lifecycle_state: "cancelled" });
    const replay = await cancel(admin, order, args.p_reason, key);
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(first.data);

    const stored = await currentOrder(order.id);
    expect(stored.cancellation_reason).toBe("Cliente pidió pausa");
    await expect(cancel(admin, { ...order, updated_at: String(stored.updated_at) }, "Otro motivo", key)).resolves.toMatchObject({
      error: expect.objectContaining({ message: expect.stringContaining("idempotencia") }),
    });

    const shortOrder = await createOrder();
    const short = await cancel(admin, shortOrder, " ");
    expect(short.error?.message).toContain("2 y 500");
    const long = await cancel(admin, shortOrder, "x".repeat(501));
    expect(long.error?.message).toContain("2 y 500");
  });

  it("bloquea un pago activo y orienta a M12 sin crear evento de anulación", async () => {
    const order = await createOrder();
    const attention = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const payment = await attention.rpc("confirm_order_payment", {
      p_order_id: order.id,
      p_expected_updated_at: order.updated_at,
      p_idempotency_key: `m15-payment-${randomUUID()}`,
    });
    expect(payment.error).toBeNull();
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const current = await currentOrder(order.id);
    const result = await cancel(admin, { ...order, updated_at: String(current.updated_at) }, "No continúa");
    expect(result.error?.message).toContain("M12");
    const unchanged = await currentOrder(order.id);
    expect(unchanged.lifecycle_state).toBe("active");
    const { count } = await service.from("order_lifecycle_events").select("id", { count: "exact", head: true }).eq("order_id", order.id);
    expect(count).toBe(0);
  });

  it("anula, excluye del tablero, conserva relaciones y expone un único evento en timeline", async () => {
    const order = await createOrder("received");
    const { error: imageError } = await service.from("order_design_images").insert({
      order_id: order.id,
      object_path: `orders/${order.id}/${randomUUID()}.png`,
      content_type: "image/png",
      byte_size: 128,
      uploaded_by: identities.find((identity) => identity.role === "admin")!.id,
    });
    expect(imageError).toBeNull();
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const result = await cancel(admin, order, "El cliente canceló el trabajo");
    expect(result.error).toBeNull();

    const archived = await admin.from("orders").select("id, lifecycle_state").eq("lifecycle_state", "cancelled").eq("id", order.id);
    expect(archived.data).toEqual([{ id: order.id, lifecycle_state: "cancelled" }]);
    const board = await admin.rpc("get_order_board");
    expect(board.error).toBeNull();
    expect((board.data ?? []).some((item) => item.id === order.id)).toBe(false);

    const { data: image } = await service.from("order_design_images").select("order_id, object_path").eq("order_id", order.id).single();
    expect(image).toMatchObject({ order_id: order.id });
    const { data: timeline } = await admin.rpc("get_order_timeline", { p_order_id: order.id });
    const cancellations = (timeline ?? []).filter((event) => event.event_type === "order_cancelled");
    expect(cancellations).toHaveLength(1);
    expect(cancellations[0]?.details).toMatchObject({ reason: "El cliente canceló el trabajo" });
  });

  it("restaura dentro de 30 días, conserva etapa y rechaza el vencimiento exacto en UTC", async () => {
    const order = await createOrder("received");
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const cancelled = await cancel(admin, order, "Pausa temporal");
    expect(cancelled.error).toBeNull();
    const cancelledState = await currentOrder(order.id);
    const restored = await restore(admin, { ...order, updated_at: String(cancelledState.updated_at) });
    expect(restored.error).toBeNull();
    expect(restored.data?.[0]).toMatchObject({ order_id: order.id, lifecycle_state: "active", current_stage_id: stageIds.received });
    const { data: restoredTimeline } = await admin.rpc("get_order_timeline", { p_order_id: order.id });
    expect(restoredTimeline?.find((event) => event.event_type === "order_restored")?.details).toMatchObject({ reason: "Pausa temporal" });

    const expiring = await createOrder("received");
    const expiredAt = new Date(Date.now() - dayMs).toISOString();
    const { error: forceExpiryError } = await service.from("orders").update({
      lifecycle_state: "cancelled",
      cancelled_at: expiredAt,
      cancelled_by: identities.find((identity) => identity.role === "admin")!.id,
      cancellation_reason: "Se agotó la ventana",
    }).eq("id", expiring.id);
    expect(forceExpiryError).toBeNull();
    const expiringState = await currentOrder(expiring.id);
    const rejected = await restore(admin, { ...expiring, updated_at: String(expiringState.updated_at) });
    expect(rejected.error?.message).toContain("30 días");
    expect((await currentOrder(expiring.id)).lifecycle_state).toBe("cancelled");
  });

  it("serializa carreras, conserva eventos append-only y rechaza updates/deletes incluso con service_role", async () => {
    const order = await createOrder();
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const results = await Promise.all([
      cancel(admin, order, "Carrera A", `m15-race-a-${randomUUID()}`),
      cancel(admin, order, "Carrera B", `m15-race-b-${randomUUID()}`),
    ]);
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(results.filter((result) => result.error)).toHaveLength(1);

    const { data: event } = await service.from("order_lifecycle_events").select("id, reason").eq("order_id", order.id).single();
    expect(event).toMatchObject({ reason: expect.any(String) });
    const update = await service.from("order_lifecycle_events").update({ reason: "alterado" }).eq("id", event!.id);
    expect(update.error?.message).toContain("inmutable");
    const deletion = await service.from("order_lifecycle_events").delete().eq("id", event!.id);
    expect(deletion.error?.message).toContain("inmutable");
  });

  it("rechaza mutaciones service_role sobre relaciones de pedidos anulados", async () => {
    const order = await createOrder();
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    expect((await cancel(admin, order, "Congelamiento service role")).error).toBeNull();

    const mutation = await service.from("order_financials").update({ total_amount: 9999 }).eq("order_id", order.id);
    expect(mutation.error?.message).toContain("congelado");

    const comment = await service.from("order_comments").insert({
      order_id: order.id,
      actor_id: identities.find((identity) => identity.role === "super_admin")!.id,
      body: "No debe publicarse",
      idempotency_key: `m15-service-role-${randomUUID()}`,
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    });
    expect(comment.error?.message).toContain("congelado");

    const cancelled = await currentOrder(order.id);
    const restored = await restore(admin, { ...order, updated_at: String(cancelled.updated_at) });
    expect(restored.error).toBeNull();
    expect(restored.data?.[0]).toMatchObject({ lifecycle_state: "active", current_stage_id: order.current_stage_id });
  });

  it("protege especificaciones y escudos de pedidos anulados sin alterar pedidos activos", async () => {
    const order = await createOrder();
    const line = await service.from("order_lines").insert({
      order_id: order.id,
      position: 0,
      line_type: "individual",
      product_name_snapshot: "Remera histórica",
      quantity: 2,
      configuration: { source: "m15" },
    }).select("id").single();
    expect(line.error).toBeNull();
    const shield = await service.from("order_line_shields").insert({
      order_line_id: line.data!.id,
      shield_name_snapshot: "Escudo histórico",
      position: 0,
    }).select("id").single();
    expect(shield.error).toBeNull();

    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    expect((await cancel(admin, order, "Preservar especificaciones")).error).toBeNull();

    for (const role of ["admin", "super_admin"] as const) {
      const manager = await signedClient(identities.find((identity) => identity.role === role)!);
      const [managerLine, managerShield] = await Promise.all([
        manager.from("order_lines").select("id, product_name_snapshot").eq("order_id", order.id),
        manager.from("order_line_shields").select("id, shield_name_snapshot").eq("order_line_id", line.data!.id),
      ]);
      expect(managerLine.error).toBeNull();
      expect(managerLine.data).toEqual([{ id: line.data!.id, product_name_snapshot: "Remera histórica" }]);
      expect(managerShield.error).toBeNull();
      expect(managerShield.data).toEqual([{ id: shield.data!.id, shield_name_snapshot: "Escudo histórico" }]);
    }

    for (const role of ["attention", "employee"] as const) {
      const operational = await signedClient(identities.find((identity) => identity.role === role)!);
      const [operationalLine, operationalShield] = await Promise.all([
        operational.from("order_lines").select("id").eq("order_id", order.id),
        operational.from("order_line_shields").select("id").eq("order_line_id", line.data!.id),
      ]);
      expect(operationalLine.error).toBeNull();
      expect(operationalLine.data).toEqual([]);
      expect(operationalShield.error).toBeNull();
      expect(operationalShield.data).toEqual([]);
    }

    const activeOrder = await createOrder();
    const activeLine = await service.from("order_lines").insert({
      order_id: activeOrder.id,
      position: 1,
      line_type: "individual",
      product_name_snapshot: "Especificación activa",
      quantity: 1,
    }).select("id").single();
    expect(activeLine.error).toBeNull();
    const activeShield = await service.from("order_line_shields").insert({
      order_line_id: activeLine.data!.id,
      shield_name_snapshot: "Escudo activo",
      position: 0,
    }).select("id").single();
    expect(activeShield.error).toBeNull();
    const attention = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const activeRead = await attention.from("order_lines").select("id").eq("order_id", activeOrder.id);
    expect(activeRead.error).toBeNull();
    expect(activeRead.data).toEqual([{ id: activeLine.data!.id }]);

    const cancelledLineToActive = await service.from("order_lines").update({ order_id: activeOrder.id }).eq("id", line.data!.id);
    expect(cancelledLineToActive.error).not.toBeNull();
    expect(cancelledLineToActive.error?.message).toContain("congelado");
    const activeLineToCancelled = await service.from("order_lines").update({ order_id: order.id }).eq("id", activeLine.data!.id);
    expect(activeLineToCancelled.error).not.toBeNull();
    expect(activeLineToCancelled.error?.message).toContain("congelado");
    const cancelledShieldToActive = await service.from("order_line_shields").update({ order_line_id: activeLine.data!.id }).eq("id", shield.data!.id);
    expect(cancelledShieldToActive.error).not.toBeNull();
    expect(cancelledShieldToActive.error?.message).toContain("congelado");
    const activeShieldToCancelled = await service.from("order_line_shields").update({ order_line_id: line.data!.id }).eq("id", activeShield.data!.id);
    expect(activeShieldToCancelled.error).not.toBeNull();
    expect(activeShieldToCancelled.error?.message).toContain("congelado");

    const serviceUpdate = await service.from("order_lines").update({ quantity: 3 }).eq("id", line.data!.id);
    expect(serviceUpdate.error?.message).toContain("congelado");
    const serviceInsert = await service.from("order_lines").insert({
      order_id: order.id,
      position: 1,
      line_type: "individual",
      product_name_snapshot: "No debe insertarse",
      quantity: 1,
    });
    expect(serviceInsert.error?.message).toContain("congelado");
    const serviceDelete = await service.from("order_lines").delete().eq("id", line.data!.id);
    expect(serviceDelete.error?.message).toContain("congelado");

    const shieldUpdate = await service.from("order_line_shields").update({ shield_name_snapshot: "No debe cambiar" }).eq("id", shield.data!.id);
    expect(shieldUpdate.error?.message).toContain("congelado");
    const shieldInsert = await service.from("order_line_shields").insert({
      order_line_id: line.data!.id,
      shield_name_snapshot: "No debe insertarse",
      position: 1,
    });
    expect(shieldInsert.error?.message).toContain("congelado");
    const shieldDelete = await service.from("order_line_shields").delete().eq("id", shield.data!.id);
    expect(shieldDelete.error?.message).toContain("congelado");

    const cancelled = await currentOrder(order.id);
    const restored = await restore(admin, { ...order, updated_at: String(cancelled.updated_at) });
    expect(restored.error).toBeNull();
    const restoredRead = await attention.from("order_lines").select("id").eq("id", line.data!.id);
    expect(restoredRead.error).toBeNull();
    expect(restoredRead.data).toEqual([{ id: line.data!.id }]);
  });

  it("congela movimientos, ediciones y comentarios hasta una restauración autorizada", async () => {
    const order = await createOrder();
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    expect((await cancel(admin, order, "Operación detenida")).error).toBeNull();
    const cancelled = await currentOrder(order.id);

    const move = await admin.rpc("move_order", {
      p_order_id: order.id,
      p_from_stage_id: order.current_stage_id,
      p_to_stage_id: stageIds.design,
      p_expected_updated_at: String(cancelled.updated_at),
      p_idempotency_key: `m15-frozen-move-${randomUUID()}`,
    });
    expect(move.error?.message).toContain("congelado");

    const edit = await admin.rpc("update_order_description", {
      p_order_id: order.id,
      p_description: "No debe guardarse",
      p_change_note: "Prueba de congelamiento",
      p_expected_updated_at: String(cancelled.updated_at),
      p_idempotency_key: `m15-frozen-edit-${randomUUID()}`,
    });
    expect(edit.error?.message).toContain("congelado");

    const comment = await admin.rpc("create_order_comment", {
      p_order_id: order.id,
      p_body: "No debe publicarse",
      p_idempotency_key: `m15-frozen-comment-${randomUUID()}`,
    });
    expect(comment.error?.message).toContain("congelado");

    const attention = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const deniedRestore = await restore(attention, { ...order, updated_at: String(cancelled.updated_at) });
    expect(deniedRestore.error?.message).toMatch(/permission denied|permiso/);
    const hiddenTimeline = await attention.rpc("get_order_timeline", { p_order_id: order.id });
    expect(hiddenTimeline.error?.message).toContain("no existe");
  });
});
