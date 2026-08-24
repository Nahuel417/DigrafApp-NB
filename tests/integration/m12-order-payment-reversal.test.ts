import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const localUrl = url ?? "http://127.0.0.1:54396";
const password = `M12${randomUUID().replaceAll("-", "")}7`;

type Role = Database["public"]["Enums"]["app_role"];
type Identity = { email: string; id: string; role: Role };
type Client = SupabaseClient<Database>;
type Order = { id: string; public_number: number; current_stage_id: string; updated_at: string };
type RpcRow = Record<string, unknown>;

describe.skipIf(!url || !serviceRoleKey || !publishableKey)("Reversión de pago M12", () => {
  const service = createClient<Database>(localUrl, serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const orderIds: string[] = [];
  const paymentIds: string[] = [];
  const movementIds: string[] = [];
  const stageIds: Record<string, string> = {};

  async function createIdentity(role: Role) {
    const email = `${role}-m12-${randomUUID()}@digraf.local`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error(`No se pudo crear identidad M12 ${role}.`);
    const { error: profileError } = await service.from("profiles").insert({ id: data.user.id, display_name: `M12 ${role}`, role, is_active: true, must_change_password: false });
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

  async function invoke(client: Client, args: Record<string, unknown>) {
    const rpc = client.rpc.bind(client) as unknown as (name: string, parameters: Record<string, unknown>) => Promise<{ data: RpcRow[] | null; error: { message: string } | null }>;
    const result = await rpc("reverse_order_payment", args);
    if (result.error) throw new Error(result.error.message);
    return result.data?.[0] ?? null;
  }

  async function createOrder(totalAmount: number, stageCode = "received"): Promise<Order> {
    const { data, error } = await service.from("orders").insert({
      customer_name: `Pedido M12 ${randomUUID().slice(0, 8)}`,
      quantity: 1,
      order_type: "individual",
      order_date: "2026-08-13",
      promised_delivery_date: "2026-08-14",
      current_stage_id: stageIds[stageCode]!,
      created_by: identities.find((identity) => identity.role === "super_admin")!.id,
      idempotency_key: `seed-m12-${randomUUID()}`,
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    }).select("id, public_number, current_stage_id, updated_at").single();
    if (error || !data) throw error ?? new Error("No se pudo crear pedido M12.");
    if (data.current_stage_id === null) throw new Error("El pedido M12 no devolvió una etapa operativa.");
    const { error: financialError } = await service.from("order_financials").insert({ order_id: data.id, total_amount: totalAmount, deposit_amount: 0, deposit_paid: false });
    if (financialError) throw financialError;
    orderIds.push(data.id);
    return { ...data, current_stage_id: data.current_stage_id };
  }

  async function confirm(order: Order) {
    const attention = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const result = await attention.rpc("confirm_order_payment", { p_order_id: order.id, p_expected_updated_at: order.updated_at, p_idempotency_key: `m12-confirm-${randomUUID()}` });
    if (result.error || !result.data?.[0]) throw result.error ?? new Error("No se pudo confirmar pago M12.");
    const payment = result.data[0] as { payment_id: string; cash_movement_id: string | null; updated_at: string };
    paymentIds.push(payment.payment_id);
    if (payment.cash_movement_id) movementIds.push(payment.cash_movement_id);
    return { ...order, updated_at: payment.updated_at, paymentId: payment.payment_id };
  }

  async function ensureOpen() {
    const client = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const { data, error } = await client.rpc("get_current_cash_summary");
    if (error || !data?.[0]) throw error ?? new Error("No se pudo consultar la caja M12.");
    if (data[0].closed_at) {
      const reopened = await client.rpc("reopen_cash_day", { p_cash_day_id: data[0].cash_day_id, p_reason: "Preparación M12", p_idempotency_key: `m12-open-${randomUUID()}` });
      if (reopened.error) throw reopened.error;
    }
  }

  async function closeCash() {
    const client = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const { data, error } = await client.rpc("get_current_cash_summary");
    if (error || !data?.[0]) throw error ?? new Error("No se pudo consultar la caja M12.");
    if (!data[0].closed_at) {
      const closed = await client.rpc("close_cash_day", { p_cash_day_id: data[0].cash_day_id, p_idempotency_key: `m12-close-${randomUUID()}` });
      if (closed.error) throw closed.error;
    }
  }

  beforeAll(async () => {
    const { data, error } = await service.from("workflow_stages").select("id, code");
    if (error) throw error;
    Object.assign(stageIds, Object.fromEntries(data.map((stage) => [stage.code, stage.id])));
    await Promise.all(["super_admin", "admin", "attention", "employee"].map((role) => createIdentity(role as Role)));
    await ensureOpen();
  });

  afterAll(async () => {
    if (paymentIds.length) await service.from("order_payment_events").delete().in("order_payment_id", paymentIds);
    if (movementIds.length) await service.from("cash_movement_events").delete().in("movement_id", movementIds);
    if (paymentIds.length) await service.from("order_payments").delete().in("id", paymentIds);
    if (movementIds.length) await service.from("cash_movements").delete().in("id", movementIds);
    if (orderIds.length) {
      await service.from("order_stage_events").delete().in("order_id", orderIds);
      await service.from("order_financials").delete().in("order_id", orderIds);
      await service.from("orders").delete().in("id", orderIds);
    }
    for (const identity of identities) {
      await service.from("profiles").delete().eq("id", identity.id);
      await service.auth.admin.deleteUser(identity.id);
    }
  });

  it("revierte un pago positivo, restaura etapa y protege el timeline financiero", async () => {
    await ensureOpen();
    const order = await confirm(await createOrder(125.5));
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const result = await invoke(admin, { p_order_id: order.id, p_payment_id: order.paymentId, p_expected_updated_at: order.updated_at, p_idempotency_key: `m12-reverse-${randomUUID()}`, p_reason: "Corrección" });
    expect(result).toMatchObject({ order_id: order.id, payment_id: order.paymentId });
    const { data: payment } = await service.from("order_payments").select("id, amount, cash_movement_id, reversed_at, reversal_cash_movement_id").eq("id", order.paymentId).single();
    expect(payment).toMatchObject({ amount: 125.5, cash_movement_id: expect.any(String), reversal_cash_movement_id: expect.any(String), reversed_at: expect.any(String) });
    movementIds.push(payment!.reversal_cash_movement_id!);
    const { data: timeline } = await admin.rpc("get_order_timeline", { p_order_id: order.id });
    expect(timeline?.find((event) => event.event_type === "payment_reversed")?.details).toMatchObject({ amount: 125.5 });
    const employee = await signedClient(identities.find((identity) => identity.role === "employee")!);
    const { data: privateTimeline } = await employee.rpc("get_order_timeline", { p_order_id: order.id });
    expect(privateTimeline?.find((event) => event.event_type === "payment_reversed")?.details).toEqual({ version: 1, payment_reversed: true });
  });

  it("autoriza Atención, rechaza Empleado y rechaza el bypass sin efectos adicionales", async () => {
    await ensureOpen();
    const order = await confirm(await createOrder(20));
    const attention = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const reversed = await invoke(attention, { p_order_id: order.id, p_payment_id: order.paymentId, p_expected_updated_at: order.updated_at, p_idempotency_key: `m12-attention-${randomUUID()}` });
    expect(reversed).toMatchObject({ order_id: order.id, payment_id: order.paymentId, amount: 20, stage_code: "received" });

    const employee = await signedClient(identities.find((identity) => identity.role === "employee")!);
    await expect(invoke(employee, { p_order_id: order.id, p_payment_id: order.paymentId, p_expected_updated_at: order.updated_at, p_idempotency_key: `m12-denied-employee-${randomUUID()}` })).rejects.toThrow("permiso");
    await expect(invoke(service, { p_order_id: order.id, p_payment_id: order.paymentId, p_expected_updated_at: order.updated_at, p_idempotency_key: `m12-bypass-${randomUUID()}` })).rejects.toThrow(/permiso|permission denied/);

    const { data: payment, error } = await service.from("order_payments").select("reversal_cash_movement_id, reversed_at").eq("id", order.paymentId).single();
    expect(error).toBeNull();
    expect(payment).toMatchObject({ reversal_cash_movement_id: expect.any(String), reversed_at: expect.any(String) });
  });

  it("rechaza pago positivo con caja cerrada sin reabrir ni mutar", async () => {
    await ensureOpen();
    const order = await confirm(await createOrder(25));
    await closeCash();
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    await expect(invoke(admin, { p_order_id: order.id, p_payment_id: order.paymentId, p_expected_updated_at: order.updated_at, p_idempotency_key: `m12-closed-${randomUUID()}` })).rejects.toThrow("caja está cerrada");
    await ensureOpen();
  });

  it("revierte monto cero sin exigir caja ni crear movimientos", async () => {
    await closeCash();
    const order = await confirm(await createOrder(0));
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    await invoke(admin, { p_order_id: order.id, p_payment_id: order.paymentId, p_expected_updated_at: order.updated_at, p_idempotency_key: `m12-zero-${randomUUID()}` });
    const { data: payment } = await service.from("order_payments").select("reversed_at, reversal_cash_movement_id").eq("id", order.paymentId).single();
    expect(payment).toEqual(expect.objectContaining({ reversal_cash_movement_id: null, reversed_at: expect.any(String) }));
    await ensureOpen();
  });

  it("reproduce el replay equivalente y rechaza fingerprint conflictivo", async () => {
    await ensureOpen();
    const order = await confirm(await createOrder(50));
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const args = { p_order_id: order.id, p_payment_id: order.paymentId, p_expected_updated_at: order.updated_at, p_idempotency_key: `m12-replay-${randomUUID()}`, p_reason: "  Ajuste  " };
    const first = await invoke(admin, args);
    const replay = await invoke(admin, args);
    expect(replay).toEqual(first);
    await expect(invoke(admin, { ...args, p_reason: "Otro" })).rejects.toThrow("idempotencia");
  });

  it("serializa dos reversiones concurrentes en una sola contrapartida", async () => {
    await ensureOpen();
    const order = await confirm(await createOrder(75));
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const superAdmin = await signedClient(identities.find((identity) => identity.role === "super_admin")!);
    const args = (key: string) => ({ p_order_id: order.id, p_payment_id: order.paymentId, p_expected_updated_at: order.updated_at, p_idempotency_key: key });
    const results = await Promise.all([invoke(admin, args(`m12-race-a-${randomUUID()}`)).then((data) => ({ data, error: null })).catch((error) => ({ data: null, error })), invoke(superAdmin, args(`m12-race-b-${randomUUID()}`)).then((data) => ({ data, error: null })).catch((error) => ({ data: null, error }))]);
    expect(results.filter((item) => item.data)).toHaveLength(1);
    expect(results.filter((item) => item.error)).toHaveLength(1);
    const { count } = await service.from("order_payments").select("id", { count: "exact", head: true }).eq("id", order.paymentId).not("reversal_cash_movement_id", "is", null);
    expect(count).toBe(1);
  });

  it("restaura exactamente una etapa previa de entrega", async () => {
    await ensureOpen();
    const order = await confirm(await createOrder(30, "delivered"));
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    await invoke(admin, { p_order_id: order.id, p_payment_id: order.paymentId, p_expected_updated_at: order.updated_at, p_idempotency_key: `m12-delivery-${randomUUID()}` });
    const { data } = await service.from("orders").select("current_stage_id").eq("id", order.id).single();
    expect(data?.current_stage_id).toBe(stageIds.delivered);
  });

  it("permite reconfirmar después de revertir con un pago activo nuevo", async () => {
    await ensureOpen();
    const order = await confirm(await createOrder(40));
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    await invoke(admin, { p_order_id: order.id, p_payment_id: order.paymentId, p_expected_updated_at: order.updated_at, p_idempotency_key: `m12-reconfirm-reverse-${randomUUID()}` });
    const { data: current } = await service.from("orders").select("updated_at, current_stage_id").eq("id", order.id).single();
    const reconfirmed = await (await signedClient(identities.find((identity) => identity.role === "attention")!)).rpc("confirm_order_payment", { p_order_id: order.id, p_expected_updated_at: current!.updated_at, p_idempotency_key: `m12-reconfirm-${randomUUID()}` });
    expect(reconfirmed.error).toBeNull();
    expect(reconfirmed.data?.[0]).toMatchObject({ stage_code: "paid", payment_id: expect.not.stringMatching(order.paymentId) });
  });

  it("impide corregir o anular movimientos vinculados a pagos", async () => {
    await ensureOpen();
    const order = await confirm(await createOrder(60));
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    await invoke(admin, { p_order_id: order.id, p_payment_id: order.paymentId, p_expected_updated_at: order.updated_at, p_idempotency_key: `m12-protect-${randomUUID()}` });
    const { data: payment } = await service.from("order_payments").select("cash_movement_id, reversal_cash_movement_id").eq("id", order.paymentId).single();
    for (const movementId of [payment!.cash_movement_id, payment!.reversal_cash_movement_id].filter((id): id is string => Boolean(id))) {
      await expect(admin.rpc("correct_cash_movement", { p_movement_id: movementId, p_direction: "expense", p_amount: 1, p_description: "No", p_expense_category_id: "11111111-1111-4111-8111-111111111111", p_idempotency_key: `m12-correct-${randomUUID()}` }).then((result) => { if (result.error) throw new Error(result.error.message); })).rejects.toThrow("vinculado");
      await expect(admin.rpc("void_cash_movement", { p_movement_id: movementId, p_reason: "No", p_idempotency_key: `m12-void-${randomUUID()}` }).then((result) => { if (result.error) throw new Error(result.error.message); })).rejects.toThrow("vinculado");
    }
  });
});
