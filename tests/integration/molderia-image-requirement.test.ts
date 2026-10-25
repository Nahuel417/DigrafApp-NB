import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const localUrl = url ?? "http://127.0.0.1:54396";
const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const safeLocalUrl = (() => {
  try {
    return localHosts.has(new URL(localUrl).hostname);
  } catch {
    return false;
  }
})();
const password = `Molderia${randomUUID().replaceAll("-", "")}7`;
const missingImageMessage = "El pedido necesita al menos una imagen de diseño vigente para ingresar a Moldería.";

type Client = SupabaseClient<Database>;
type Order = { id: string; current_stage_id: string; updated_at: string };
type Identity = { email: string; id: string };

describe.skipIf(!safeLocalUrl || !serviceRoleKey || !publishableKey)("Requisito de imagen al ingresar a Moldería", () => {
  const service = createClient<Database>(localUrl, serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const orderIds: string[] = [];
  const stageIds: string[] = [];
  let adminIdentity: Identity;
  let adminClient: Client;
  let receivedStageId: string;
  let molderiaStageId: string;
  let stageConfigured = false;

  async function createIdentity() {
    const email = `admin-molderia-${randomUUID()}@digraf.local`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No se pudo crear la identidad sintética de Moldería.");

    const { error: profileError } = await service.from("profiles").insert({
      id: data.user.id,
      display_name: "Admin Moldería",
      role: "admin",
      is_active: true,
      must_change_password: false,
    });
    if (profileError) throw profileError;

    const identity = { email, id: data.user.id };
    identities.push(identity);
    return identity;
  }

  async function signedClient(identity: Identity): Promise<Client> {
    const client = createClient<Database>(localUrl, publishableKey ?? "test-key", { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email: identity.email, password });
    if (error) throw error;
    return client;
  }

  async function createOrder(options: { cancelled?: boolean; withFinancials?: boolean } = {}): Promise<Order> {
    const { data, error } = await service.from("orders").insert({
      customer_name: `Pedido Moldería ${randomUUID().slice(0, 8)}`,
      quantity: 1,
      order_type: "individual",
      order_date: "2026-10-24",
      promised_delivery_date: "2026-10-25",
      current_stage_id: options.cancelled ? molderiaStageId : receivedStageId,
      created_by: adminIdentity.id,
      idempotency_key: `seed-molderia-${randomUUID()}`,
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      ...(options.cancelled ? {
        lifecycle_state: "cancelled",
        cancelled_at: new Date(Date.now() - 60_000).toISOString(),
        cancelled_by: adminIdentity.id,
        cancellation_reason: "Moldería integration test",
      } : {}),
    }).select("id, current_stage_id, updated_at").single();
    if (error || !data) throw error ?? new Error("No se pudo crear el pedido sintético de Moldería.");
    if (data.current_stage_id === null) throw new Error("El pedido sintético no tiene una etapa actual.");
    orderIds.push(data.id);

    if (options.withFinancials) {
      const { error: financialError } = await service.from("order_financials").insert({
        order_id: data.id,
        total_amount: 0,
        deposit_amount: 0,
        deposit_paid: false,
      });
      if (financialError) throw financialError;
    }

    return { id: data.id, current_stage_id: data.current_stage_id, updated_at: data.updated_at };
  }

  async function addNonPrimaryImage(orderId: string) {
    const { error } = await service.from("order_design_images").insert({
      order_id: orderId,
      object_path: `orders/${orderId}/${randomUUID()}.png`,
      content_type: "image/png",
      byte_size: 1,
      uploaded_by: adminIdentity.id,
      is_primary: false,
    });
    if (error) throw error;
  }

  async function move(order: Order, targetStageId = molderiaStageId) {
    return adminClient.rpc("move_order", {
      p_order_id: order.id,
      p_from_stage_id: order.current_stage_id,
      p_to_stage_id: targetStageId,
      p_expected_updated_at: order.updated_at,
      p_idempotency_key: randomUUID(),
    });
  }

  async function countStageEvents(orderId: string) {
    const { count, error } = await service.from("order_stage_events").select("id", { count: "exact", head: true }).eq("order_id", orderId);
    if (error) throw error;
    return count;
  }

  async function orderSnapshot(orderId: string) {
    const { data, error } = await service.from("orders").select("current_stage_id, updated_at, lifecycle_state").eq("id", orderId).single();
    if (error || !data) throw error ?? new Error("No se pudo consultar el pedido sintético de Moldería.");
    return data;
  }

  beforeAll(async () => {
    const { data: stages, error: stagesError } = await service.from("workflow_stages").select("*");
    if (stagesError) throw stagesError;
    const flaggedStages = stages.filter((stage) => (stage as unknown as { requires_design_image?: boolean }).requires_design_image === true);
    if (flaggedStages.length > 1) throw new Error("Hay más de una etapa configurada con requisito de imagen.");

    const received = stages.find((stage) => stage.code === "received");
    if (!received) throw new Error("No se encontró la etapa inicial.");
    receivedStageId = received.id;

    adminIdentity = await createIdentity();
    adminClient = await signedClient(adminIdentity);

    if (flaggedStages[0]) {
      molderiaStageId = flaggedStages[0].id;
      stageConfigured = true;
      return;
    }

    const created = await adminClient.rpc("create_workflow_stage", {
      p_name: `Moldería test ${randomUUID().slice(0, 8)}`,
      p_idempotency_key: randomUUID(),
    });
    const createdStage = created.data?.[0];
    if (created.error || !createdStage) throw created.error ?? new Error("No se pudo crear la etapa sintética de Moldería.");
    molderiaStageId = createdStage.stage_id;
    stageIds.push(molderiaStageId);

    const { error: configureError } = await service.from("workflow_stages")
      .update({ requires_design_image: true } as never)
      .eq("id", molderiaStageId);
    stageConfigured = configureError === null;
  });

  afterAll(async () => {
    const failures: string[] = [];
    async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await operation;
      if (error) failures.push(`${label}: ${error.message}`);
    }

    if (orderIds.length) {
      await cleanup("order_design_images", service.from("order_design_images").delete().in("order_id", orderIds));
      await cleanup("order_design_image_events", service.from("order_design_image_events").delete().in("order_id", orderIds));
      await cleanup("order_stage_events", service.from("order_stage_events").delete().in("order_id", orderIds));
      const { data: payments } = await service.from("order_payments").select("id").in("order_id", orderIds);
      const paymentIds = payments?.map((payment) => payment.id) ?? [];
      if (paymentIds.length) await cleanup("order_payment_events", service.from("order_payment_events").delete().in("order_payment_id", paymentIds));
      if (paymentIds.length) await cleanup("order_payments", service.from("order_payments").delete().in("id", paymentIds));
      await cleanup("order_financials", service.from("order_financials").delete().in("order_id", orderIds));
      await cleanup("orders", service.from("orders").delete().in("id", orderIds));
    }
    if (identities.length) {
      await cleanup("workflow_stage_events", service.from("workflow_stage_events").delete().in("actor_id", identities.map((identity) => identity.id)));
      for (const identity of identities) {
        await cleanup(`profile ${identity.id}`, service.from("profiles").delete().eq("id", identity.id));
        await cleanup(`auth user ${identity.id}`, service.auth.admin.deleteUser(identity.id));
      }
    }
    if (stageIds.length) await cleanup("workflow_stages", service.from("workflow_stages").delete().in("id", stageIds));
    if (failures.length) throw new Error(`Falló el cleanup Moldería:\n${failures.join("\n")}`);
  });

  it("rejects entry without any current image and leaves order and movement audit unchanged", async () => {
    const order = await createOrder();
    const beforeOrder = await orderSnapshot(order.id);
    const beforeEvents = await countStageEvents(order.id);

    const rejected = await move(order);

    expect(rejected.error?.message).toBe(missingImageMessage);
    expect(rejected.data).toBeNull();
    expect(await orderSnapshot(order.id)).toEqual(beforeOrder);
    expect(await countStageEvents(order.id)).toBe(beforeEvents);
  });

  it("accepts a current image even when it is not primary", async () => {
    const order = await createOrder();
    await addNonPrimaryImage(order.id);

    const moved = await move(order);

    expect(moved.error).toBeNull();
    expect(moved.data?.[0]).toMatchObject({ order_id: order.id, to_stage_id: molderiaStageId });
    expect((await orderSnapshot(order.id)).current_stage_id).toBe(molderiaStageId);
    expect(await countStageEvents(order.id)).toBe(1);
  });

  it("rejects payment reversal when restoring the previous Moldería stage without an image", async ({ skip }) => {
    if (!stageConfigured) skip("La migración de requisito de imagen todavía no está aplicada.");

    const order = await createOrder({ withFinancials: true });
    await addNonPrimaryImage(order.id);
    const moved = await move(order);
    expect(moved.error).toBeNull();
    const movedOrder = { ...order, current_stage_id: molderiaStageId, updated_at: moved.data![0]!.updated_at };

    const { error: deleteImageError } = await service.from("order_design_images").delete().eq("order_id", order.id);
    expect(deleteImageError).toBeNull();

    const confirmed = await adminClient.rpc("confirm_order_payment", {
      p_order_id: order.id,
      p_expected_updated_at: movedOrder.updated_at,
      p_idempotency_key: randomUUID(),
    });
    expect(confirmed.error).toBeNull();
    const payment = confirmed.data?.[0];
    expect(payment).toBeDefined();
    const beforeOrder = await orderSnapshot(order.id);
    const beforeStageEvents = await countStageEvents(order.id);
    const beforePaymentEvents = await service.from("order_payment_events").select("id", { count: "exact", head: true }).eq("order_payment_id", payment!.payment_id);
    expect(beforePaymentEvents.error).toBeNull();

    const reversed = await adminClient.rpc("reverse_order_payment", {
      p_order_id: order.id,
      p_payment_id: payment!.payment_id,
      p_expected_updated_at: payment!.updated_at,
      p_idempotency_key: randomUUID(),
    });

    expect(reversed.error?.message).toBe(missingImageMessage);
    expect(reversed.data).toBeNull();
    expect(await orderSnapshot(order.id)).toEqual(beforeOrder);
    expect(await countStageEvents(order.id)).toBe(beforeStageEvents);
    const afterPaymentEvents = await service.from("order_payment_events").select("id", { count: "exact", head: true }).eq("order_payment_id", payment!.payment_id);
    expect(afterPaymentEvents.count).toBe(beforePaymentEvents.count);
    const paymentState = await service.from("order_payments").select("reversed_at").eq("id", payment!.payment_id).single();
    expect(paymentState.data?.reversed_at).toBeNull();
  });

  it("rejects restoring a cancelled Moldería order without an image and leaves lifecycle audit unchanged", async ({ skip }) => {
    if (!stageConfigured) skip("La migración de requisito de imagen todavía no está aplicada.");

    const order = await createOrder({ cancelled: true });
    const beforeOrder = await orderSnapshot(order.id);
    const beforeEvents = await service.from("order_lifecycle_events").select("id", { count: "exact", head: true }).eq("order_id", order.id);
    expect(beforeEvents.error).toBeNull();

    const restored = await adminClient.rpc("restore_order", {
      p_order_id: order.id,
      p_expected_updated_at: order.updated_at,
      p_idempotency_key: randomUUID(),
    });

    expect(restored.error?.message).toBe(missingImageMessage);
    expect(restored.data).toBeNull();
    expect(await orderSnapshot(order.id)).toEqual(beforeOrder);
    const afterEvents = await service.from("order_lifecycle_events").select("id", { count: "exact", head: true }).eq("order_id", order.id);
    expect(afterEvents.count).toBe(beforeEvents.count);
  });
});
