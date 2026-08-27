import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const localUrl = url ?? "http://127.0.0.1:54396";
const password = `M16${randomUUID().replaceAll("-", "")}7`;
const execFileAsync = promisify(execFile);

type Role = "super_admin" | "admin" | "attention" | "employee";
type Identity = { email: string; id: string; role: Role };
type Client = SupabaseClient<Database>;
type RpcResult = { data: Array<Record<string, unknown>> | Record<string, unknown> | null; error: { message: string } | null };

async function localSql(sql: string): Promise<unknown[]> {
  const executable = process.platform === "win32" ? "supabase.exe" : "supabase";
  const { stdout } = await execFileAsync(executable, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024,
  });
  const jsonStart = stdout.indexOf("[");
  if (jsonStart < 0) throw new Error(`Local SQL did not return JSON: ${stdout}`);
  return JSON.parse(stdout.slice(jsonStart)) as unknown[];
}

describe.skipIf(!url || !serviceRoleKey || !publishableKey)("M16 delivered archive and cancelled purge", () => {
  const service = createClient<Database>(localUrl, serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const orderIds: string[] = [];
  const cashMovementIds: string[] = [];
  const cashDayIds: string[] = [];
  const catalogItemIds: string[] = [];
  let deliveredStageId = "";
  let receivedStageId = "";
  let paidStageId = "";

  async function createIdentity(role: Role) {
    const email = `${role}-m16-${randomUUID()}@digraf.local`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error(`Could not create M16 ${role} identity.`);
    const { error: profileError } = await service.from("profiles").insert({
      id: data.user.id,
      display_name: `M16 ${role}`,
      role,
      is_active: true,
      must_change_password: false,
    });
    if (profileError) throw profileError;
    const identity = { email, id: data.user.id, role };
    identities.push(identity);
    return identity;
  }

  function identity(role: Role) {
    return identities.find((candidate) => candidate.role === role)!;
  }

  async function signedClient(identity: Identity): Promise<Client> {
    const client = createClient<Database>(localUrl, publishableKey ?? "test-key", { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email: identity.email, password });
    if (error) throw error;
    return client;
  }

  async function invoke(client: Client, name: string, parameters: Record<string, unknown>): Promise<RpcResult> {
    const rpc = client.rpc.bind(client) as unknown as (rpcName: string, args: Record<string, unknown>) => Promise<RpcResult>;
    return rpc(name, parameters);
  }

  async function createOrder(stageId = deliveredStageId) {
    const { data, error } = await service.from("orders").insert({
      customer_name: `M16 ${randomUUID().slice(0, 8)}`,
      quantity: 2,
      order_type: "individual",
      order_date: "2026-08-14",
      promised_delivery_date: "2026-08-20",
      current_stage_id: stageId,
      created_by: identity("super_admin").id,
      idempotency_key: `m16-seed-${randomUUID()}`,
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    }).select("id, updated_at").single();
    if (error || !data) throw error ?? new Error("Could not create M16 order.");
    orderIds.push(data.id);
    return data;
  }

  async function cancelOrder(
    order: { id: string; updated_at: string },
    reason = "M16 local retention fixture",
    idempotencyKey = `m16-cancel-${randomUUID()}`,
  ) {
    const admin = await signedClient(identity("admin"));
    const result = await invoke(admin, "cancel_order", {
      p_order_id: order.id,
      p_expected_updated_at: order.updated_at,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
    if (result.error || !Array.isArray(result.data) || !result.data[0]) throw result.error ?? new Error("Could not cancel M16 fixture.");
    return result;
  }

  async function ageCancelledOrder(orderId: string, age: string) {
    const { data: current, error: readError } = await service.from("orders").select("cancellation_reason").eq("id", orderId).single();
    if (readError || !current) throw readError ?? new Error("Could not read M16 retention fixture.");
    const { error: restoreError } = await service.from("orders").update({ lifecycle_state: "active", cancelled_at: null, cancelled_by: null, cancellation_reason: null }).eq("id", orderId);
    if (restoreError) throw restoreError;
    const { error: cancelError } = await service.from("orders").update({
      lifecycle_state: "cancelled",
      cancelled_at: age,
      cancelled_by: identity("super_admin").id,
      cancellation_reason: current.cancellation_reason ?? "M16 retention fixture",
    }).eq("id", orderId);
    if (cancelError) throw cancelError;
  }

  async function createCancelledOrder(age = "31 days") {
    const order = await createOrder();
    await cancelOrder(order);
    await ageCancelledOrder(order.id, new Date(Date.now() - (age === "29 days" ? 29 : 31) * 24 * 60 * 60 * 1000 - (age === "29 days" ? 60_000 : 0)).toISOString());
    return order.id;
  }

  async function createRetentionFixture(finalState: "cancelled" | "delivered" = "cancelled") {
    const order = await createOrder();
    const cashDate = new Date(Date.UTC(2090, 0, 1 + Math.floor(Math.random() * 300))).toISOString().slice(0, 10);
    const { data: cashDay, error: cashDayError } = await service.from("cash_days").insert({ operational_date: cashDate }).select("id").single();
    if (cashDayError || !cashDay) throw cashDayError ?? new Error("Could not create M16 cash-day fixture.");
    cashDayIds.push(cashDay.id);

    const { data: cashMovement, error: cashMovementError } = await service.from("cash_movements").insert({
      cash_day_id: cashDay.id,
      direction: "income",
      amount: 25,
      description: "M16 retained cash movement",
      actor_id: identity("super_admin").id,
      idempotency_key: `m16-cash-${randomUUID()}`,
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      is_payment_reversal: false,
    }).select("id").single();
    if (cashMovementError || !cashMovement) throw cashMovementError ?? new Error("Could not create M16 cash fixture.");
    cashMovementIds.push(cashMovement.id);

    const superAdminId = identity("super_admin").id;
    const timestamp = new Date().toISOString();
    const { data: catalogItem, error: catalogItemError } = await service.from("catalog_items").insert({
      kind: "garment",
      garment_layer: "upper",
      name: `M16 fixture catalog ${randomUUID().slice(0, 8)}`,
      created_by: superAdminId,
      updated_by: superAdminId,
    }).select("id").single();
    if (catalogItemError || !catalogItem) throw catalogItemError ?? new Error("Could not create M16 catalog fixture.");
    catalogItemIds.push(catalogItem.id);
    const { data: payment, error: paymentError } = await service.from("order_payments").insert({
      order_id: order.id,
      actor_id: superAdminId,
      amount: 25,
      cash_movement_id: cashMovement.id,
      fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      idempotency_key: `m16-payment-${randomUUID()}`,
    }).select("id").single();
    if (paymentError || !payment) throw paymentError ?? new Error("Could not create M16 payment fixture.");
    const { error: reversalError } = await service.from("order_payments").update({ reversed_at: new Date().toISOString() }).eq("id", payment.id);
    if (reversalError) throw reversalError;

    const { error: financialError } = await service.from("order_financials").insert({ order_id: order.id, total_amount: 25, deposit_amount: 10, deposit_paid: true });
    if (financialError) throw financialError;
    const { error: paymentEventError } = await service.from("order_payment_events").insert({
      order_payment_id: payment.id,
      actor_id: superAdminId,
      event_type: "confirmed",
      fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      idempotency_key: `m16-payment-event-${randomUUID()}`,
      order_snapshot: { order_id: order.id },
      payment_snapshot: { amount: 25 },
      stage: "delivered",
    });
    if (paymentEventError) throw paymentEventError;

    const { error: stageEventError } = await service.from("order_stage_events").insert({
      order_id: order.id,
      actor_id: superAdminId,
      from_stage_id: receivedStageId,
      to_stage_id: deliveredStageId,
      idempotency_key: `m16-stage-${randomUUID()}`,
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    });
    if (stageEventError) throw stageEventError;
    const { error: changeEventError } = await service.from("order_change_events").insert({
      order_id: order.id,
      actor_id: superAdminId,
      action: "order_updated",
      details: { source: "m16-test" },
      order_updated_at: order.updated_at,
      idempotency_key: `m16-change-${randomUUID()}`,
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    });
    if (changeEventError) throw changeEventError;
    const { error: commentError } = await service.from("order_comments").insert({
      order_id: order.id,
      actor_id: superAdminId,
      body: "M16 retained comment",
      idempotency_key: `m16-comment-${randomUUID()}`,
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    });
    if (commentError) throw commentError;
    const { error: catalogError } = await service.from("order_catalog_items").insert({
      order_id: order.id,
      catalog_item_id: catalogItem.id,
      catalog_kind: "garment",
      garment_layer: "upper",
      item_name: "M16 fixture garment",
      selection_key: "garment_upper",
    });
    if (catalogError) throw catalogError;

    const { data: line, error: lineError } = await service.from("order_lines").insert({
      order_id: order.id,
      position: 0,
      line_type: "individual",
      quantity: 1,
      product_name_snapshot: "M16 fixture line",
      configuration: {},
    }).select("id").single();
    if (lineError || !line) throw lineError ?? new Error("Could not create M16 line fixture.");
    const { error: shieldError } = await service.from("order_line_shields").insert({
      order_line_id: line.id,
      position: 0,
      shield_name_snapshot: "M16 fixture shield",
    });
    if (shieldError) throw shieldError;

    const imageId = randomUUID();
    const previousPath = `orders/${order.id}/${randomUUID()}.jpg`;
    const currentPath = `orders/${order.id}/${imageId}.png`;
    const { error: imageError } = await service.from("order_design_images").insert({
      id: imageId,
      order_id: order.id,
      object_path: currentPath,
      content_type: "image/png",
      byte_size: 4,
      uploaded_by: superAdminId,
      is_primary: true,
    });
    if (imageError) throw imageError;
    const { error: imageEventError } = await service.from("order_design_image_events").insert({
      order_id: order.id,
      actor_id: superAdminId,
      action: "replaced",
      object_path: currentPath,
      previous_object_path: previousPath,
      image_id: imageId,
      image_updated_at: timestamp,
      idempotency_key: `m16-image-${randomUUID()}`,
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      result: { source: "m16-test" },
    });
    if (imageEventError) throw imageEventError;

    if (finalState === "cancelled") {
      await cancelOrder(order);
      await ageCancelledOrder(order.id, new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString());
    }
    return { orderId: order.id, orderUpdatedAt: order.updated_at, currentPath, previousPath, paymentId: payment.id, cashMovementId: cashMovement.id };
  }

  async function ensureCashOpen() {
    const attention = await signedClient(identity("attention"));
    const summary = await attention.rpc("get_current_cash_summary");
    if (summary.error || !summary.data?.[0]) throw summary.error ?? new Error("Could not prepare the M16 cash day.");
    const cashDayId = summary.data[0].cash_day_id;
    if (summary.data[0].closed_at) {
      const reopened = await attention.rpc("reopen_cash_day", {
        p_cash_day_id: cashDayId,
        p_reason: "M16 retention fixture reopen",
        p_idempotency_key: `m16-reopen-${randomUUID()}`,
      });
      if (reopened.error) throw reopened.error;
    }
    return cashDayId;
  }

  async function closeAndReopenCash() {
    const admin = await signedClient(identity("admin"));
    const summary = await admin.rpc("get_current_cash_summary");
    if (summary.error || !summary.data?.[0]) throw summary.error ?? new Error("Could not read the M16 cash day.");
    const cashDayId = summary.data[0].cash_day_id;
    if (!summary.data[0].closed_at) {
      const closed = await admin.rpc("close_cash_day", { p_cash_day_id: cashDayId, p_idempotency_key: `m16-close-${randomUUID()}` });
      if (closed.error) throw closed.error;
    }
    const attention = await signedClient(identity("attention"));
    const reopened = await attention.rpc("reopen_cash_day", {
      p_cash_day_id: cashDayId,
      p_reason: "M16 retention fixture reopen",
      p_idempotency_key: `m16-reopen-${randomUUID()}`,
    });
    if (reopened.error) throw reopened.error;
    return cashDayId;
  }

  async function createM12RetentionFixture() {
    const cashDayId = await ensureCashOpen();
    const order = await createOrder(receivedStageId);
    const { error: financialError } = await service.from("order_financials").insert({ order_id: order.id, total_amount: 125.5, deposit_amount: 0, deposit_paid: false });
    if (financialError) throw financialError;

    const attention = await signedClient(identity("attention"));
    const confirmed = await attention.rpc("confirm_order_payment", {
      p_order_id: order.id,
      p_expected_updated_at: order.updated_at,
      p_idempotency_key: `m16-m12-confirm-${randomUUID()}`,
    });
    if (confirmed.error || !confirmed.data?.[0]) throw confirmed.error ?? new Error("Could not confirm the M12 retention payment.");
    const payment = confirmed.data[0] as { payment_id: string; updated_at: string; cash_movement_id: string | null };

    const admin = await signedClient(identity("admin"));
    const reversed = await admin.rpc("reverse_order_payment", {
      p_order_id: order.id,
      p_payment_id: payment.payment_id,
      p_expected_updated_at: payment.updated_at,
      p_idempotency_key: `m16-m12-reverse-${randomUUID()}`,
      p_reason: "M16 retention fixture",
    });
    if (reversed.error || !reversed.data?.[0]) throw reversed.error ?? new Error("Could not reverse the M12 retention payment.");
    const reversal = reversed.data[0] as { updated_at: string };

    const { data: paymentRow, error: paymentError } = await service.from("order_payments").select("cash_movement_id, reversal_cash_movement_id").eq("id", payment.payment_id).single();
    if (paymentError || !paymentRow) throw paymentError ?? new Error("Could not read the M12 payment links.");
    const movementIds = [paymentRow.cash_movement_id, paymentRow.reversal_cash_movement_id].filter((movementId): movementId is string => Boolean(movementId));
    for (const movementId of movementIds) {
      if (movementId && !cashMovementIds.includes(movementId)) cashMovementIds.push(movementId);
    }

    await closeAndReopenCash();
    const cancelled = await cancelOrder({ id: order.id, updated_at: reversal.updated_at }, "M16 M12 retention fixture");
    if (cancelled.error) throw new Error(cancelled.error.message);
    return { cashDayId, orderId: order.id, paymentId: payment.payment_id, movementIds };
  }

  async function queryArchivedOrderData(client: Client, orderId: string, paymentId: string) {
    const [payments, paymentEvents, financials, images, imageEvents, lifecycleEvents, stageEvents, changeEvents] = await Promise.all([
      client.from("order_payments").select("*").eq("order_id", orderId),
      client.from("order_payment_events").select("*").eq("order_payment_id", paymentId),
      client.from("order_financials").select("*").eq("order_id", orderId),
      client.from("order_design_images").select("*").eq("order_id", orderId),
      client.from("order_design_image_events").select("*").eq("order_id", orderId),
      client.from("order_lifecycle_events").select("*").eq("order_id", orderId),
      client.from("order_stage_events").select("*").eq("order_id", orderId),
      client.from("order_change_events").select("*").eq("order_id", orderId),
    ]);
    return { payments, paymentEvents, financials, images, imageEvents, lifecycleEvents, stageEvents, changeEvents };
  }

  async function snapshotArchivedOrderData(orderId: string, paymentId: string) {
    const data = await queryArchivedOrderData(service, orderId, paymentId);
    const responses = Object.values(data);
    const failed = responses.find((response) => response.error);
    if (failed?.error) throw failed.error;
    return {
      payments: data.payments.data ?? [],
      paymentEvents: data.paymentEvents.data ?? [],
      financials: data.financials.data ?? [],
      images: data.images.data ?? [],
      imageEvents: data.imageEvents.data ?? [],
      lifecycleEvents: data.lifecycleEvents.data ?? [],
      stageEvents: data.stageEvents.data ?? [],
      changeEvents: data.changeEvents.data ?? [],
    };
  }

  async function snapshotM12RetentionData(fixture: { cashDayId: string; orderId: string; paymentId: string; movementIds: string[] }) {
    const [cashDays, cashMovements, cashMovementEvents, cashLifecycleEvents, payments, paymentEvents, financials, lifecycleEvents, stageEvents, changeEvents] = await Promise.all([
      service.from("cash_days").select("*").eq("id", fixture.cashDayId),
      service.from("cash_movements").select("*").in("id", fixture.movementIds),
      service.from("cash_movement_events").select("*").in("movement_id", fixture.movementIds),
      service.from("cash_day_lifecycle_events").select("*").eq("cash_day_id", fixture.cashDayId),
      service.from("order_payments").select("*").eq("id", fixture.paymentId),
      service.from("order_payment_events").select("*").eq("order_payment_id", fixture.paymentId),
      service.from("order_financials").select("*").eq("order_id", fixture.orderId),
      service.from("order_lifecycle_events").select("*").eq("order_id", fixture.orderId),
      service.from("order_stage_events").select("*").eq("order_id", fixture.orderId),
      service.from("order_change_events").select("*").eq("order_id", fixture.orderId),
    ]);
    const responses = [cashDays, cashMovements, cashMovementEvents, cashLifecycleEvents, payments, paymentEvents, financials, lifecycleEvents, stageEvents, changeEvents];
    const failed = responses.find((response) => response.error);
    if (failed?.error) throw failed.error;
    return {
      cashDays: cashDays.data ?? [],
      cashMovements: cashMovements.data ?? [],
      cashMovementEvents: cashMovementEvents.data ?? [],
      cashLifecycleEvents: cashLifecycleEvents.data ?? [],
      payments: payments.data ?? [],
      paymentEvents: paymentEvents.data ?? [],
      financials: financials.data ?? [],
      lifecycleEvents: lifecycleEvents.data ?? [],
      stageEvents: stageEvents.data ?? [],
      changeEvents: changeEvents.data ?? [],
    };
  }

  beforeAll(async () => {
    const { data, error } = await service.from("workflow_stages").select("id, code").in("code", ["received", "paid", "delivered"]);
    if (error || !data) throw error ?? new Error("M16 workflow stages are not configured.");
    const stageIds = new Map(data.map((stage) => [stage.code, stage.id]));
    receivedStageId = stageIds.get("received") ?? "";
    paidStageId = stageIds.get("paid") ?? "";
    deliveredStageId = stageIds.get("delivered") ?? "";
    if (!receivedStageId || !paidStageId || !deliveredStageId) throw new Error("M16 requires received, paid, and delivered stages.");
    await Promise.all([createIdentity("super_admin"), createIdentity("admin"), createIdentity("attention"), createIdentity("employee")]);
  });

  afterAll(async () => {
    if (orderIds.length) {
      const { data: lines } = await service.from("order_lines").select("id").in("order_id", orderIds);
      if (lines?.length) await service.from("order_line_shields").delete().in("order_line_id", lines.map((line) => line.id));
      await service.from("order_purge_jobs").delete().in("order_id", orderIds);
      await service.from("order_design_image_events").delete().in("order_id", orderIds);
      await service.from("order_design_images").delete().in("order_id", orderIds);
      await service.from("order_comments").delete().in("order_id", orderIds);
      await service.from("order_catalog_items").delete().in("order_id", orderIds);
      await service.from("order_lines").delete().in("order_id", orderIds);
      await service.from("order_payment_events").delete().in("order_payment_id", (await service.from("order_payments").select("id").in("order_id", orderIds)).data?.map((payment) => payment.id) ?? []);
      await service.from("order_payments").delete().in("order_id", orderIds);
      await service.from("order_financials").delete().in("order_id", orderIds);
      await service.from("order_change_events").delete().in("order_id", orderIds);
      await service.from("order_stage_events").delete().in("order_id", orderIds);
      await service.from("order_lifecycle_events").delete().in("order_id", orderIds);
      await service.from("orders").delete().in("id", orderIds);
    }
    if (cashMovementIds.length) await service.from("cash_movement_events").delete().in("movement_id", cashMovementIds);
    if (cashMovementIds.length) await service.from("cash_movements").delete().in("id", cashMovementIds);
    if (cashDayIds.length) await service.from("cash_day_lifecycle_events").delete().in("cash_day_id", cashDayIds);
    if (cashDayIds.length) await service.from("cash_days").delete().in("id", cashDayIds);
    if (catalogItemIds.length) await service.from("catalog_items").delete().in("id", catalogItemIds);
    for (const identity of identities) {
      await service.from("profiles").delete().eq("id", identity.id);
      await service.auth.admin.deleteUser(identity.id);
    }
  });

  it("archives and unarchives only delivered orders for managers", async () => {
    const fixture = await createRetentionFixture("delivered");
    const order = { id: fixture.orderId, updated_at: fixture.orderUpdatedAt };
    const admin = await signedClient(identity("admin"));
    const superAdmin = await signedClient(identity("super_admin"));
    const attention = await signedClient(identity("attention"));
    const employee = await signedClient(identity("employee"));
    const key = `m16-archive-${randomUUID()}`;
    const before = await snapshotArchivedOrderData(fixture.orderId, fixture.paymentId);

    const denied = await invoke(employee, "archive_delivered_order", { p_order_id: order.id, p_expected_updated_at: order.updated_at, p_idempotency_key: key });
    expect(denied.error?.message).toMatch(/permission|permiso/i);

    const archived = await invoke(admin, "archive_delivered_order", { p_order_id: order.id, p_expected_updated_at: order.updated_at, p_idempotency_key: key });
    expect(archived.error).toBeNull();
    expect(archived.data).toMatchObject({ order_id: order.id, lifecycle_state: "archived_delivered" });
    const board = await invoke(admin, "get_order_board", { p_search: "" });
    expect(board.error).toBeNull();
    const boardRows = Array.isArray(board.data) ? board.data : [];
    expect(boardRows.some((row) => row.id === order.id)).toBe(false);

    for (const [role, client, allowed] of [
      ["super_admin", superAdmin, true],
      ["admin", admin, true],
      ["attention", attention, false],
      ["employee", employee, false],
    ] as const) {
      const result = await client.from("archived_delivered_orders").select("id").eq("id", order.id);
      expect(result.error, `${role} view query`).toBeNull();
      expect(result.data?.some((row) => row.id === order.id), `${role} leakage`).toBe(allowed);
    }
    const anonymous = createClient<Database>(localUrl, publishableKey ?? "test-key", { auth: { persistSession: false } });
    expect((await anonymous.from("archived_delivered_orders").select("id").eq("id", order.id)).error).not.toBeNull();

    for (const [role, client, allowed] of [
      ["super_admin", superAdmin, true],
      ["admin", admin, true],
      ["attention", attention, false],
      ["employee", employee, false],
    ] as const) {
      const data = await queryArchivedOrderData(client, fixture.orderId, fixture.paymentId);
      const visible = {
        payments: !data.payments.error && (data.payments.data?.length ?? 0) > 0,
        paymentEvents: !data.paymentEvents.error && (data.paymentEvents.data?.length ?? 0) > 0,
        financials: !data.financials.error && (data.financials.data?.length ?? 0) > 0,
        images: !data.images.error && (data.images.data?.length ?? 0) > 0,
        imageEvents: !data.imageEvents.error && (data.imageEvents.data?.length ?? 0) > 0,
        lifecycleEvents: !data.lifecycleEvents.error && (data.lifecycleEvents.data?.length ?? 0) > 0,
      };
      expect(visible, `${role} archived dependency access`).toEqual({
        payments: allowed,
        paymentEvents: allowed,
        financials: allowed,
        images: allowed,
        imageEvents: allowed,
        lifecycleEvents: allowed,
      });
    }

    const nonDelivered = await createOrder(receivedStageId);
    const rejectedState = await invoke(admin, "archive_delivered_order", {
      p_order_id: nonDelivered.id,
      p_expected_updated_at: nonDelivered.updated_at,
      p_idempotency_key: `m16-archive-non-delivered-${randomUUID()}`,
    });
    expect(rejectedState.error?.message).toMatch(/delivered|entregad|ineligible|eligible|state/i);
    const retainedState = await service.from("orders").select("lifecycle_state, current_stage_id").eq("id", nonDelivered.id).single();
    expect(retainedState.data).toEqual({ lifecycle_state: "active", current_stage_id: receivedStageId });

    const replay = await invoke(admin, "archive_delivered_order", { p_order_id: order.id, p_expected_updated_at: order.updated_at, p_idempotency_key: key });
    expect(replay.data).toEqual(archived.data);
    const unarchived = await invoke(admin, "unarchive_delivered_order", { p_order_id: order.id, p_expected_updated_at: (archived.data as Record<string, string>).updated_at, p_idempotency_key: `m16-unarchive-${randomUUID()}` });
    expect(unarchived.data).toMatchObject({ order_id: order.id, lifecycle_state: "active" });

    const after = await snapshotArchivedOrderData(fixture.orderId, fixture.paymentId);
    expect(after.payments).toEqual(before.payments);
    expect(after.paymentEvents).toEqual(before.paymentEvents);
    expect(after.financials).toEqual(before.financials);
    expect({ images: after.images, imageEvents: after.imageEvents }).toEqual({ images: before.images, imageEvents: before.imageEvents });
    expect({ stageEvents: after.stageEvents, changeEvents: after.changeEvents }).toEqual({ stageEvents: before.stageEvents, changeEvents: before.changeEvents });
    expect(after.lifecycleEvents.filter((event) => !["delivered_archived", "delivered_unarchived"].includes(event.event_type))).toEqual(before.lifecycleEvents);
    expect(after.lifecycleEvents.map((event) => event.event_type)).toEqual(expect.arrayContaining(["delivered_archived", "delivered_unarchived"]));
  });

  it("purges a cancelled order immediately for Admin and preserves the full reason snapshot", async () => {
    const order = await createOrder();
    const cancelled = await cancelOrder(order, "M16 immediate purge fixture");
    expect(cancelled.error).toBeNull();

    const admin = await signedClient(identity("admin"));
    const reason = "  Cliente pidió purgarlo  ";
    const purged = await invoke(admin, "purge_cancelled_order", {
      p_order_id: order.id,
      p_idempotency_key: `m16-immediate-${randomUUID()}`,
      p_reason: reason,
    });
    expect(purged.error).toBeNull();
    expect(purged.data).toMatchObject({ order_id: order.id, lifecycle_state: "purged_cancelled", source: "manual", reason: "Cliente pidió purgarlo" });

    const tombstone = await service.from("orders").select("id, public_number, lifecycle_state, customer_name, client_name, team_name, phone, quantity, order_type, order_date, promised_delivery_date, description, current_stage_id, idempotency_key, idempotency_fingerprint, cancellation_reason, cancelled_by, cancelled_at, created_at").eq("id", order.id).single();
    expect(tombstone.data).toMatchObject({ id: order.id, lifecycle_state: "purged_cancelled", customer_name: null, client_name: null, team_name: null, phone: null, quantity: null, order_type: null, order_date: null, promised_delivery_date: null, description: null, current_stage_id: null, idempotency_key: null, idempotency_fingerprint: null, cancellation_reason: null });
    expect(tombstone.data?.cancelled_by).toBe(identity("admin").id);
  });

  it("rejects invalid manual reasons and denied roles without reserving the request", async () => {
    const order = await createOrder();
    const cancelled = await cancelOrder(order, "M16 reason fixture");
    expect(cancelled.error).toBeNull();
    const admin = await signedClient(identity("admin"));
    const key = `m16-invalid-reason-${randomUUID()}`;

    const invalid = await invoke(admin, "purge_cancelled_order", { p_order_id: order.id, p_idempotency_key: key, p_reason: " " });
    expect(invalid.error?.message).toMatch(/motivo|reason/i);
    for (const role of ["attention", "employee"] as const) {
      const denied = await invoke(await signedClient(identity(role)), "purge_cancelled_order", {
        p_order_id: order.id,
        p_idempotency_key: `m16-denied-purge-${role}-${randomUUID()}`,
        p_reason: "Motivo válido",
      });
      expect(denied.error?.message, `${role} manual purge`).toMatch(/permission|permiso/i);
    }
    const job = await service.from("order_purge_jobs").select("id").eq("order_id", order.id);
    expect(job.data).toHaveLength(0);
    const retained = await service.from("orders").select("lifecycle_state").eq("id", order.id).single();
    expect(retained.data?.lifecycle_state).toBe("cancelled");
  });

  it("enforces the scheduler UTC cutoff just before, exactly at, and after 30 days", async () => {
    const beforeOrder = await createCancelledOrder("29 days");
    const preparedBefore = await service.rpc("prepare_cancelled_order_purge_jobs", { p_limit: 10 });
    expect(preparedBefore.error).toBeNull();
    const beforeDue = await service.rpc("purge_due_cancelled_orders", { p_limit: 10 });
    expect(beforeDue.error).toBeNull();
    expect(beforeDue.data?.some((row) => (row.result as { order_id?: string }).order_id === beforeOrder)).toBe(false);

    const exactOrder = await createOrder();
    await cancelOrder(exactOrder);
    await ageCancelledOrder(exactOrder.id, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    const afterOrder = await createCancelledOrder("31 days");
    const preparedDue = await service.rpc("prepare_cancelled_order_purge_jobs", { p_limit: 10 });
    expect(preparedDue.error).toBeNull();
    const due = await service.rpc("purge_due_cancelled_orders", { p_limit: 10 });
    expect(due.error).toBeNull();
    const purgedIds = (due.data ?? []).map((row) => (row.result as { order_id?: string }).order_id);
    expect(purgedIds).toEqual(expect.arrayContaining([exactOrder.id, afterOrder]));
  }, 30000);

  it("rejects active, paid, delivered, and archived-delivered states regardless of age", async () => {
    const activeId = (await createOrder()).id;
    const paidId = (await createOrder(paidStageId)).id;
    const archivedOrder = await createOrder();
    const admin = await signedClient(identity("admin"));
    const archived = await invoke(admin, "archive_delivered_order", {
      p_order_id: archivedOrder.id,
      p_expected_updated_at: archivedOrder.updated_at,
      p_idempotency_key: `m16-ineligible-archive-${randomUUID()}`,
    });
    expect(archived.error).toBeNull();
    for (const orderId of [activeId, paidId, archivedOrder.id]) {
      const rejected = await invoke(admin, "purge_cancelled_order", {
        p_order_id: orderId,
        p_idempotency_key: `m16-ineligible-${randomUUID()}`,
        p_reason: "Motivo válido",
      });
      expect(rejected.error?.message).toMatch(/anulados|state|estado|purge|purga/i);
    }
  });

  it("rejects every non-cancelled state at manual and scheduler boundaries", async () => {
    const active = await createOrder(receivedStageId);
    const paid = await createOrder(paidStageId);
    const delivered = await createOrder();
    const archivedOrder = await createOrder();
    const admin = await signedClient(identity("admin"));
    const archived = await invoke(admin, "archive_delivered_order", {
      p_order_id: archivedOrder.id,
      p_expected_updated_at: archivedOrder.updated_at,
      p_idempotency_key: `m16-boundary-archive-${randomUUID()}`,
    });
    expect(archived.error).toBeNull();

    const targets = [
      { id: active.id, state: "active" },
      { id: paid.id, state: "active" },
      { id: delivered.id, state: "active" },
      { id: archivedOrder.id, state: "archived_delivered" },
    ];
    for (const target of targets) {
      const rejected = await invoke(admin, "purge_cancelled_order", {
        p_order_id: target.id,
        p_idempotency_key: `m16-boundary-manual-${randomUUID()}`,
        p_reason: "Boundary rejection",
      });
      expect(rejected.error?.message, target.state).toMatch(/anulados|state|estado|purge|purga/i);
    }

    const { error: jobError } = await service.from("order_purge_jobs").insert(targets.map(({ id }) => ({ order_id: id, status: "prepared" as const })));
    expect(jobError).toBeNull();
    const scheduled = await service.rpc("purge_due_cancelled_orders", { p_limit: 50 });
    expect(scheduled.error).toBeNull();
    const returnedIds = (scheduled.data ?? []).map((row) => (row.result as { order_id?: string }).order_id);
    expect(returnedIds).not.toEqual(expect.arrayContaining(targets.map(({ id }) => id)));
    for (const target of targets) {
      const retained = await service.from("orders").select("lifecycle_state").eq("id", target.id).single();
      expect(retained.data?.lifecycle_state, target.state).toBe(target.state);
    }
  });

  it("denies anonymous, inactive, and must-change-password manual purge actors", async () => {
    const order = await createOrder();
    await cancelOrder(order, "M16 actor denial fixture");
    const anonymous = createClient<Database>(localUrl, publishableKey ?? "test-key", { auth: { persistSession: false } });
    const inactiveIdentity = await createIdentity("admin");
    const mustChangeIdentity = await createIdentity("admin");
    expect((await service.from("profiles").update({ is_active: false }).eq("id", inactiveIdentity.id)).error).toBeNull();
    expect((await service.from("profiles").update({ must_change_password: true }).eq("id", mustChangeIdentity.id)).error).toBeNull();
    const inactive = await signedClient(inactiveIdentity);
    const mustChange = await signedClient(mustChangeIdentity);
    for (const [name, client] of [["anonymous", anonymous], ["inactive", inactive], ["must_change_password", mustChange]] as const) {
      const denied = await invoke(client, "purge_cancelled_order", { p_order_id: order.id, p_idempotency_key: `m16-actor-${name}-${randomUUID()}`, p_reason: "Valid reason" });
      expect(denied.error?.message, name).toMatch(/permission|permiso/i);
    }
    expect((await service.from("orders").select("lifecycle_state").eq("id", order.id).single()).data?.lifecycle_state).toBe("cancelled");
  });

  it("conflicts when an idempotency key reuses a different btrimmed reason", async () => {
    const order = await createOrder();
    await cancelOrder(order, "M16 idempotency fixture");
    const admin = await signedClient(identity("admin"));
    const key = `m16-reason-conflict-${randomUUID()}`;
    const first = await invoke(admin, "purge_cancelled_order", { p_order_id: order.id, p_idempotency_key: key, p_reason: "  Motivo   con   espacios  " });
    expect(first.error).toBeNull();
    const conflict = await invoke(admin, "purge_cancelled_order", { p_order_id: order.id, p_idempotency_key: key, p_reason: "Motivo con espacios" });
    expect(conflict.error?.message).toMatch(/idempotencia|idempotency/i);
    expect((await service.from("order_lifecycle_events").select("id").eq("order_id", order.id).eq("event_type", "cancelled_purged")).data).toHaveLength(1);
  });

  it("rolls back the purge and creates no Storage job when the audit write fails", async () => {
    const fixture = await createRetentionFixture("cancelled");
    const { error: jobError } = await service.from("order_purge_jobs").insert({
      order_id: fixture.orderId,
      status: "prepared",
      idempotency_fingerprint: "0".repeat(32),
    });
    expect(jobError).toBeNull();
    try {
      const result = await invoke(await signedClient(identity("admin")), "purge_cancelled_order", {
        p_order_id: fixture.orderId,
        p_idempotency_key: `m16-rollback-${randomUUID()}`,
        p_reason: "Rollback purge",
      });
      expect(result.error?.message).toMatch(/idempotencia|idempotency/i);
    } finally {
      await service.from("order_purge_jobs").delete().eq("order_id", fixture.orderId);
    }
    expect((await service.from("orders").select("lifecycle_state, customer_name").eq("id", fixture.orderId).single()).data).toMatchObject({ lifecycle_state: "cancelled", customer_name: expect.any(String) });
    expect((await service.from("order_design_images").select("id").eq("order_id", fixture.orderId)).data).toHaveLength(1);
    expect((await service.from("order_lifecycle_events").select("id").eq("order_id", fixture.orderId).eq("event_type", "cancelled_purged")).data).toHaveLength(0);
    expect((await service.from("order_purge_jobs").select("id").eq("order_id", fixture.orderId)).data).toHaveLength(0);
  });

  it("records manual audit actor, server time, source, and internal whitespace", async () => {
    const order = await createOrder();
    await cancelOrder(order, "M16 audit fixture");
    const actor = identity("admin");
    const reason = "  Motivo   con   espacios  ";
    const startedAt = Date.now();
    const result = await invoke(await signedClient(actor), "purge_cancelled_order", { p_order_id: order.id, p_idempotency_key: `m16-audit-${randomUUID()}`, p_reason: reason });
    const finishedAt = Date.now();
    expect(result.error).toBeNull();
    const event = await service.from("order_lifecycle_events").select("actor_id, reason, occurred_at, result_snapshot").eq("order_id", order.id).eq("event_type", "cancelled_purged").single();
    expect(event.error).toBeNull();
    expect(event.data).toMatchObject({ actor_id: actor.id, reason: "Motivo   con   espacios", result_snapshot: { source: "manual", reason: "Motivo   con   espacios" } });
    expect(Date.parse(event.data!.occurred_at)).toBeGreaterThanOrEqual(startedAt - 2000);
    expect(Date.parse(event.data!.occurred_at)).toBeLessThanOrEqual(finishedAt + 2000);
  });

  it("prepares day-29 jobs but purges only after the day-30 scheduler boundary", async () => {
    const orderId = await createCancelledOrder("29 days");
    const prepared = await service.rpc("prepare_cancelled_order_purge_jobs", { p_limit: 500 });
    expect(prepared.error).toBeNull();
    expect(prepared.data?.some((job) => job.order_id === orderId)).toBe(true);

    const beforeDue = await service.rpc("purge_due_cancelled_orders", { p_limit: 500 });
    expect(beforeDue.error).toBeNull();
    expect(beforeDue.data?.some((row) => (row.result as { order_id?: string }).order_id === orderId)).toBe(false);

    await ageCancelledOrder(orderId, new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString());
    const due = await service.rpc("purge_due_cancelled_orders", { p_limit: 500 });
    expect(due.error).toBeNull();
    expect(due.data?.some((row) => (row.result as { order_id?: string }).order_id === orderId)).toBe(true);
  });

  it("keeps public grants narrow and creates no Cron job", async () => {
    const grants = await localSql(`
      select
        has_function_privilege('anon', 'public.archive_delivered_order(uuid,timestamptz,text)', 'execute') as anon_archive,
        has_function_privilege('authenticated', 'public.archive_delivered_order(uuid,timestamptz,text)', 'execute') as authenticated_archive,
        has_function_privilege('service_role', 'public.archive_delivered_order(uuid,timestamptz,text)', 'execute') as service_archive,
        has_function_privilege('service_role', 'public.prepare_cancelled_order_purge_jobs(integer)', 'execute') as service_prepare,
        has_function_privilege('authenticated', 'public.prepare_cancelled_order_purge_jobs(integer)', 'execute') as authenticated_prepare,
        has_function_privilege('authenticated', 'public.purge_cancelled_order(uuid,text,text)', 'execute') as authenticated_manual,
        has_function_privilege('service_role', 'public.purge_cancelled_order(uuid,text,text)', 'execute') as service_manual,
        has_function_privilege('service_role', 'public.purge_due_cancelled_orders(integer)', 'execute') as service_scheduler,
        has_function_privilege('authenticated', 'public.purge_due_cancelled_orders(integer)', 'execute') as authenticated_scheduler,
        has_function_privilege('service_role', 'public.m16_purge_cancelled_order_core(uuid,uuid,text,text,text,timestamptz)', 'execute') as service_core,
        to_regprocedure('public.purge_cancelled_order(uuid,text)')::text as old_manual,
        to_regprocedure('public.m16_purge_cancelled_order_core(uuid,uuid,text,text,timestamptz)')::text as old_core,
        to_regprocedure('public.purge_cancelled_order(uuid,text,text)')::text as new_manual,
        to_regprocedure('public.m16_purge_cancelled_order_core(uuid,uuid,text,text,text,timestamptz)')::text as new_core;
    `);
    expect(grants[0]).toMatchObject({ anon_archive: false, authenticated_archive: true, service_archive: false, service_prepare: true, authenticated_prepare: false, authenticated_manual: true, service_manual: false, service_scheduler: true, authenticated_scheduler: false, service_core: false, old_manual: null, old_core: null });
    expect(grants[0]).toMatchObject({ new_manual: expect.stringContaining("purge_cancelled_order"), new_core: expect.stringContaining("m16_purge_cancelled_order_core") });
    const cronRows = await localSql("select to_regclass('cron.job')::text as cron_table");
    expect(cronRows[0]).toEqual({ cron_table: null });

    const client = await signedClient(identity("admin"));
    const serviceCore = await invoke(service, "m16_purge_cancelled_order_core", {});
    const serviceArchive = await invoke(service, "archive_delivered_order", {});
    const anonymous = createClient<Database>(localUrl, publishableKey ?? "test-key", { auth: { persistSession: false } });
    const anonymousArchive = await invoke(anonymous, "archive_delivered_order", {});
    const authenticatedPrepare = await invoke(client, "prepare_cancelled_order_purge_jobs", { p_limit: 1 });
    expect(serviceCore.error).not.toBeNull();
    expect(serviceArchive.error).not.toBeNull();
    expect(anonymousArchive.error).not.toBeNull();
    expect(authenticatedPrepare.error).not.toBeNull();
  });

  it("replays concurrent purge requests once and returns the stable result", async () => {
    const orderId = await createCancelledOrder();
    const superAdmin = await signedClient(identity("super_admin"));
    const key = `m16-concurrent-${randomUUID()}`;
    const [first, second] = await Promise.all([
      invoke(superAdmin, "purge_cancelled_order", { p_order_id: orderId, p_idempotency_key: key, p_reason: "Concurrent purge" }),
      invoke(superAdmin, "purge_cancelled_order", { p_order_id: orderId, p_idempotency_key: key, p_reason: "Concurrent purge" }),
    ]);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data).toEqual(first.data);
    const eventBeforeJobMutation = await service.from("order_lifecycle_events").select("result_snapshot").eq("order_id", orderId).eq("event_type", "cancelled_purged").single();
    const { error: jobMutationError } = await service.from("order_purge_jobs").update({ result: { storage_status: "storage_completed", changed_by_test: true } }).eq("order_id", orderId);
    expect(jobMutationError).toBeNull();
    const replay = await invoke(superAdmin, "purge_cancelled_order", { p_order_id: orderId, p_idempotency_key: key, p_reason: "Concurrent purge" });
    expect(replay.data).toEqual(first.data);
    expect(replay.data).toEqual(eventBeforeJobMutation.data?.result_snapshot);
    const { count: jobs } = await service.from("order_purge_jobs").select("id", { count: "exact", head: true }).eq("order_id", orderId);
    const { count: purges } = await service.from("order_lifecycle_events").select("id", { count: "exact", head: true }).eq("order_id", orderId).eq("event_type", "cancelled_purged");
    expect(jobs).toBe(1);
    expect(purges).toBe(1);
  });

  it("rejects stale leases and durably retries Storage cleanup", async () => {
    const orderId = await createCancelledOrder();
    const superAdmin = await signedClient(identity("super_admin"));
    const purged = await invoke(superAdmin, "purge_cancelled_order", { p_order_id: orderId, p_idempotency_key: `m16-lease-purge-${randomUUID()}`, p_reason: "Lease purge" });
    expect(purged.error).toBeNull();
    const { data: targetJob, error: targetJobError } = await service.from("order_purge_jobs").select("id").eq("order_id", orderId).single();
    expect(targetJobError).toBeNull();
    expect(targetJob).not.toBeNull();

    const [firstClaim, secondClaim] = await Promise.all([
      service.rpc("claim_order_purge_storage_jobs", { p_limit: 10 }),
      service.rpc("claim_order_purge_storage_jobs", { p_limit: 10 }),
    ]);
    expect(firstClaim.error).toBeNull();
    expect(secondClaim.error).toBeNull();
    const claims = [...(firstClaim.data ?? []), ...(secondClaim.data ?? [])];
    const targetClaims = claims.filter((claim) => claim.job_id === targetJob!.id);
    expect(targetClaims).toHaveLength(1);
    const claim = targetClaims[0]!;
    const stale = await service.rpc("finalize_order_purge_storage_job", {
      p_job_id: claim.job_id,
      p_lease_token: randomUUID(),
      p_succeeded: true,
      p_error: "",
    });
    expect(stale.error).not.toBeNull();

    const { error: expireError } = await service.from("order_purge_jobs").update({ lease_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", claim.job_id);
    expect(expireError).toBeNull();
    const expired = await service.rpc("finalize_order_purge_storage_job", {
      p_job_id: claim.job_id,
      p_lease_token: claim.lease_token,
      p_succeeded: true,
      p_error: "",
    });
    expect(expired.error).not.toBeNull();

    const reclaimed = await service.rpc("claim_order_purge_storage_jobs", { p_limit: 1 });
    expect(reclaimed.error).toBeNull();
    expect(reclaimed.data).toHaveLength(1);
    const retry = await service.rpc("finalize_order_purge_storage_job", {
      p_job_id: reclaimed.data![0]!.job_id,
      p_lease_token: reclaimed.data![0]!.lease_token,
      p_succeeded: false,
      p_error: "M16 synthetic Storage failure",
    });
    expect(retry.error).toBeNull();
    const retryState = await service.from("order_purge_jobs").select("status, attempts, last_error").eq("id", claim.job_id).single();
    expect(retryState.data).toMatchObject({ status: "storage_retry", attempts: 1, last_error: "M16 synthetic Storage failure" });

    const { error: readyError } = await service.from("order_purge_jobs").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", claim.job_id);
    expect(readyError).toBeNull();
    const retryClaim = await service.rpc("claim_order_purge_storage_jobs", { p_limit: 1 });
    expect(retryClaim.data).toHaveLength(1);
    const completed = await service.rpc("finalize_order_purge_storage_job", {
      p_job_id: retryClaim.data![0]!.job_id,
      p_lease_token: retryClaim.data![0]!.lease_token,
      p_succeeded: true,
      p_error: "",
    });
    expect(completed.error).toBeNull();
    expect((await service.from("order_purge_jobs").select("status, attempts").eq("id", claim.job_id).single()).data).toEqual({ status: "storage_completed", attempts: 1 });
  });

  it("preserves the complete M12 cash graph and audit snapshots while deleting operational data", async () => {
    const fixture = await createM12RetentionFixture();
    const before = await snapshotM12RetentionData(fixture);
    for (const [name, rows] of [["cashMovements", before.cashMovements], ["payments", before.payments], ["paymentEvents", before.paymentEvents], ["financials", before.financials]] as const) expect(rows.length, name).toBeGreaterThan(0);
    const admin = await signedClient(identity("admin"));
    const result = await invoke(admin, "purge_cancelled_order", {
      p_order_id: fixture.orderId,
      p_idempotency_key: `m16-m12-retention-${randomUUID()}`,
      p_reason: "M12 retention audit",
    });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ source: "manual", reason: "M12 retention audit" });

    const after = await snapshotM12RetentionData(fixture);
    expect(after.cashDays).toEqual(before.cashDays);
    expect(after.cashMovements).toEqual(before.cashMovements);
    expect(after.cashMovementEvents).toEqual(before.cashMovementEvents);
    expect(after.cashLifecycleEvents).toEqual(before.cashLifecycleEvents);
    expect(after.payments).toEqual(before.payments);
    expect(after.paymentEvents).toEqual(before.paymentEvents);
    expect(after.financials).toEqual(before.financials);
    expect(after.stageEvents).toEqual(before.stageEvents);
    expect(after.changeEvents).toEqual(before.changeEvents);
    expect(after.lifecycleEvents.filter((event) => event.event_type !== "cancelled_purged")).toEqual(before.lifecycleEvents);

    const order = await service.from("orders").select("lifecycle_state, customer_name, client_name, team_name, phone, quantity, order_type, order_date, promised_delivery_date, description, current_stage_id, idempotency_key, idempotency_fingerprint, cancellation_reason").eq("id", fixture.orderId).single();
    expect(order.data).toEqual({ lifecycle_state: "purged_cancelled", customer_name: null, client_name: null, team_name: null, phone: null, quantity: null, order_type: null, order_date: null, promised_delivery_date: null, description: null, current_stage_id: null, idempotency_key: null, idempotency_fingerprint: null, cancellation_reason: null });

    const job = await service.from("order_purge_jobs").select("status, object_paths").eq("order_id", fixture.orderId).single();
    expect(job.data?.status).toBe("storage_pending");
  });

  it("denies direct core and scheduler access to authenticated clients", async () => {
    const client = await signedClient(identity("admin"));
    const core = await invoke(client, "m16_purge_cancelled_order_core", {});
    const prepare = await invoke(client, "prepare_cancelled_order_purge_jobs", { p_limit: 10 });
    expect(core.error?.message).toMatch(/permission|not exist|function/i);
    expect(prepare.error?.message).toMatch(/permission|not exist|function/i);
  });
});
