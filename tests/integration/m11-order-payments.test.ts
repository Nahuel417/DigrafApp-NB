import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const localUrl = url ?? "http://127.0.0.1:54396";
const password = `M11${randomUUID().replaceAll("-", "")}7`;

type Role = Database["public"]["Enums"]["app_role"];
type Uuid = `${string}-${string}-${string}-${string}-${string}`;
type Identity = { email: string; id: string; role: Role };
type Client = SupabaseClient<Database>;
type PaymentResult = {
  amount: number;
  cash_movement_id: string | null;
  confirmed_at: string;
  event_id: string;
  from_stage_id: string;
  order_id: string;
  payment_id: string;
  public_number: number;
  stage_code: string;
  to_stage_id: string;
  updated_at: string;
};

describe.skipIf(!url || !serviceRoleKey || !publishableKey)("Pago atómico M11", () => {
  const service = createClient<Database>(localUrl, serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const orderIds: string[] = [];
  const paymentIds: string[] = [];
  const paymentEventIds: string[] = [];
  const stageEventIds: string[] = [];
  const cashMovementIds: string[] = [];
  let stages: Record<string, string> = {};

  async function createIdentity(role: Role) {
    const email = `${role}-m11-${randomUUID()}@digraf.local`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No se pudo crear una identidad sintética M11.");

    const { error: profileError } = await service.from("profiles").insert({
      id: data.user.id,
      display_name: `M11 ${role}`,
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

  async function createOrder(totalAmount: string, stageCode = "received") {
    const { data, error } = await service
      .from("orders")
      .insert({
        customer_name: `Pedido M11 ${randomUUID().slice(0, 8)}`,
        quantity: 1,
        order_type: "individual",
        order_date: "2026-08-12",
        promised_delivery_date: "2026-08-13",
        current_stage_id: stages[stageCode]!,
        created_by: identities.find((identity) => identity.role === "super_admin")!.id,
        idempotency_key: `seed-m11-${randomUUID()}`,
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      })
      .select("id, public_number, current_stage_id, updated_at")
      .single();
    if (error || !data) throw error ?? new Error("No se pudo crear el pedido M11.");
    if (data.current_stage_id === null) throw new Error("El pedido M11 no devolvió una etapa operativa.");

    const { error: financialError } = await service.from("order_financials").insert({
      order_id: data.id,
      total_amount: Number(totalAmount),
      deposit_amount: totalAmount === "0.00" ? 0 : 10,
      deposit_paid: true,
    });
    if (financialError) throw financialError;
    orderIds.push(data.id);
    return { ...data, current_stage_id: data.current_stage_id };
  }

  async function confirm(client: Client, order: { id: string; updated_at: string }, key: string = randomUUID(), expectedUpdatedAt = order.updated_at) {
    const result = await client.rpc("confirm_order_payment", {
      p_order_id: order.id as Uuid,
      p_expected_updated_at: expectedUpdatedAt,
      p_idempotency_key: key,
    });
    const payment = result.data?.[0] as PaymentResult | undefined;
    if (payment) {
      paymentIds.push(payment.payment_id);
      paymentEventIds.push(payment.event_id);
      if (payment.cash_movement_id) cashMovementIds.push(payment.cash_movement_id);
    }
    return { ...result, payment };
  }

  async function ensureCashOpen() {
    const attention = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const summary = await attention.rpc("get_current_cash_summary");
    if (summary.error || !summary.data?.[0]) throw summary.error ?? new Error("No se pudo preparar la caja M11.");
    if (summary.data[0].closed_at) {
      const reopened = await attention.rpc("reopen_cash_day", {
        p_cash_day_id: summary.data[0].cash_day_id,
        p_reason: "Preparación de pruebas M11",
        p_idempotency_key: `m11-reopen-${randomUUID()}`,
      });
      if (reopened.error) throw reopened.error;
    }
    return summary.data[0].cash_day_id;
  }

  async function closeCash() {
    const manager = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const summary = await manager.rpc("get_current_cash_summary");
    if (summary.error || !summary.data?.[0]) throw summary.error ?? new Error("No se pudo consultar la caja M11.");
    if (!summary.data[0].closed_at) {
      const closed = await manager.rpc("close_cash_day", {
        p_cash_day_id: summary.data[0].cash_day_id,
        p_idempotency_key: `m11-close-${randomUUID()}`,
      });
      if (closed.error) throw closed.error;
    }
    return summary.data[0].cash_day_id;
  }

  beforeAll(async () => {
    const stageResult = await service.from("workflow_stages").select("id, code");
    if (stageResult.error) throw stageResult.error;
    stages = Object.fromEntries(stageResult.data.map((stage) => [stage.code, stage.id]));

    await Promise.all([
      createIdentity("super_admin"),
      createIdentity("admin"),
      createIdentity("attention"),
      createIdentity("employee"),
    ]);
  });

  afterAll(async () => {
    if (stageEventIds.length) await service.from("order_stage_events").delete().in("id", stageEventIds);
    if (paymentEventIds.length) await service.from("order_payment_events").delete().in("id", paymentEventIds);
    if (paymentIds.length) await service.from("order_payments").delete().in("id", paymentIds);
    if (cashMovementIds.length) await service.from("cash_movement_events").delete().in("movement_id", cashMovementIds);
    if (cashMovementIds.length) await service.from("cash_movements").delete().in("id", cashMovementIds);
    if (orderIds.length) await service.from("order_financials").delete().in("order_id", orderIds);
    if (orderIds.length) await service.from("order_stage_events").delete().in("order_id", orderIds);
    if (orderIds.length) await service.from("orders").delete().in("id", orderIds);

    for (const identity of identities) {
      await service.from("profiles").delete().eq("id", identity.id);
      await service.auth.admin.deleteUser(identity.id);
    }
  });

  it("rechaza a Empleado y reconoce a los tres roles autorizados", async () => {
    const orderId = randomUUID() as Uuid;
    const expectedUpdatedAt = "2026-08-12T19:00:00.000Z";

    const employee = await signedClient(identities.find((identity) => identity.role === "employee")!);
    const rejected = await employee.rpc("confirm_order_payment", {
      p_order_id: orderId,
      p_expected_updated_at: expectedUpdatedAt,
      p_idempotency_key: randomUUID(),
    });
    expect(rejected.error?.message).toContain("permiso");

    for (const role of ["super_admin", "admin", "attention"] as const) {
      const client = await signedClient(identities.find((identity) => identity.role === role)!);
      const result = await client.rpc("confirm_order_payment", {
        p_order_id: orderId,
        p_expected_updated_at: expectedUpdatedAt,
        p_idempotency_key: randomUUID(),
      });
      expect(result.error?.message).not.toContain("permiso");
    }
  });

  it("confirma el total completo, ignora la seña y registra un ingreso fijo", async () => {
    await ensureCashOpen();
    const order = await createOrder("125.50");
    const client = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const result = await confirm(client, order, `m11-positive-${randomUUID()}`);

    expect(result.error).toBeNull();
    expect(result.payment).toMatchObject({
      amount: 125.5,
      cash_movement_id: expect.any(String),
      from_stage_id: stages.received,
      order_id: order.id,
      stage_code: "paid",
      to_stage_id: stages.paid,
    });

    const { data: movement, error: movementError } = await service
      .from("cash_movements")
      .select("amount, description, direction")
      .eq("id", result.payment!.cash_movement_id!)
      .single();
    expect(movementError).toBeNull();
    expect(movement).toEqual({ amount: 125.5, description: `Cobro PED-${String(order.public_number).padStart(6, "0")}`, direction: "income" });

    const board = await client.rpc("get_order_board");
    const boardOrder = board.data?.find((item) => item.id === order.id);
    expect(boardOrder).toMatchObject({ current_stage_id: stages.paid, total_amount: 125.5, payment_confirmed_at: result.payment!.confirmed_at });
  });

  it("confirma total cero aun con la caja cerrada y no crea ingreso", async () => {
    await closeCash();
    const order = await createOrder("0.00");
    const client = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const result = await confirm(client, order, `m11-zero-${randomUUID()}`);

    expect(result.error).toBeNull();
    expect(result.payment).toMatchObject({ amount: 0, cash_movement_id: null, stage_code: "paid" });
    const description = `Cobro PED-${String(order.public_number).padStart(6, "0")}`;
    const { data: movements, error } = await service.from("cash_movements").select("id").eq("description", description);
    expect(error).toBeNull();
    expect(movements).toHaveLength(0);
  });

  it("rechaza un total positivo con caja cerrada sin efectos parciales", async () => {
    await closeCash();
    const order = await createOrder("25.00");
    const client = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const result = await confirm(client, order, `m11-closed-${randomUUID()}`);

    expect(result.error?.message).toContain("caja está cerrada");
    const [{ data: persistedOrder }, { count: paymentCount }, { count: stageCount }] = await Promise.all([
      service.from("orders").select("current_stage_id, updated_at").eq("id", order.id).single(),
      service.from("order_payments").select("id", { count: "exact", head: true }).eq("order_id", order.id),
      service.from("order_stage_events").select("id", { count: "exact", head: true }).eq("order_id", order.id),
    ]);
    expect(persistedOrder).toEqual({ current_stage_id: stages.received, updated_at: order.updated_at });
    expect(paymentCount).toBe(0);
    expect(stageCount).toBe(0);
    await ensureCashOpen();
  });

  it("reproduce el resultado exacto y rechaza el conflicto de clave", async () => {
    await ensureCashOpen();
    const order = await createOrder("50.00");
    const client = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const key = `m11-replay-${randomUUID()}`;
    const first = await confirm(client, order, key);
    const replay = await confirm(client, order, key);
    const conflict = await confirm(client, order, key, "2026-08-12T19:00:00.000Z");

    expect(first.error).toBeNull();
    expect(replay.error).toBeNull();
    expect(replay.payment).toEqual(first.payment);
    expect(conflict.error?.message).toContain("idempotencia");
    const { count, error } = await service.from("order_payments").select("id", { count: "exact", head: true }).eq("order_id", order.id);
    expect(error).toBeNull();
    expect(count).toBe(1);
  });

  it("rechaza una clave nueva para un pedido ya pagado sin efectos nuevos", async () => {
    await ensureCashOpen();
    const order = await createOrder("60.00");
    const client = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const first = await confirm(client, order, `m11-already-paid-first-${randomUUID()}`);

    expect(first.error).toBeNull();
    expect(first.payment).toMatchObject({ stage_code: "paid" });

    const readEffects = async () => {
      const [{ data: persistedOrder }, { count: paymentCount }, { count: paymentEventCount }, { count: stageEventCount }, { count: cashMovementCount }] = await Promise.all([
        service.from("orders").select("current_stage_id, updated_at").eq("id", order.id).single(),
        service.from("order_payments").select("id", { count: "exact", head: true }).eq("order_id", order.id),
        service.from("order_payment_events").select("id", { count: "exact", head: true }).eq("order_payment_id", first.payment!.payment_id),
        service.from("order_stage_events").select("id", { count: "exact", head: true }).eq("order_id", order.id),
        service.from("cash_movements").select("id", { count: "exact", head: true }).eq("description", `Cobro PED-${String(order.public_number).padStart(6, "0")}`),
      ]);
      return { persistedOrder, paymentCount, paymentEventCount, stageEventCount, cashMovementCount };
    };
    const before = await readEffects();

    const rejected = await confirm(client, order, `m11-already-paid-second-${randomUUID()}`, first.payment!.updated_at);

    expect(rejected.error?.message).toContain("ya está pagado");
    expect(rejected.payment).toBeUndefined();
    expect(await readEffects()).toEqual(before);
  });

  it("serializa dos confirmaciones concurrentes y deja un solo pago e ingreso", async () => {
    await ensureCashOpen();
    const order = await createOrder("75.00");
    const firstClient = await signedClient(identities.find((identity) => identity.role === "super_admin")!);
    const secondClient = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const [first, second] = await Promise.all([
      confirm(firstClient, order, `m11-race-a-${randomUUID()}`),
      confirm(secondClient, order, `m11-race-b-${randomUUID()}`),
    ]);

    expect([first.error, second.error].filter(Boolean)).toHaveLength(1);
    expect([first.payment, second.payment].filter(Boolean)).toHaveLength(1);
    const [{ count: paymentCount }, { count: incomeCount }] = await Promise.all([
      service.from("order_payments").select("id", { count: "exact", head: true }).eq("order_id", order.id).is("reversed_at", null),
      service.from("cash_movements").select("id", { count: "exact", head: true }).eq("description", `Cobro PED-${String(order.public_number).padStart(6, "0")}`),
    ]);
    expect(paymentCount).toBe(1);
    expect(incomeCount).toBe(1);
  });

  it("oculta importes y escrituras financieras a Empleado, pero conserva la confirmación en timeline", async () => {
    await ensureCashOpen();
    const order = await createOrder("40.00");
    const attention = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const employee = await signedClient(identities.find((identity) => identity.role === "employee")!);
    const result = await confirm(attention, order, `m11-rls-${randomUUID()}`);

    expect(result.error).toBeNull();
    expect((await employee.from("order_financials").select("total_amount").eq("order_id", order.id)).data).toEqual([]);
    expect((await employee.from("order_payments").select("amount").eq("order_id", order.id)).data).toEqual([]);
    expect((await employee.from("order_payments").update({ amount: 1 }).eq("order_id", order.id)).error).not.toBeNull();
    expect((await employee.from("orders").update({ current_stage_id: stages.received }).eq("id", order.id)).error).not.toBeNull();

    const employeeBoard = await employee.rpc("get_order_board");
    expect(employeeBoard.data?.find((item) => item.id === order.id)).toMatchObject({ total_amount: null, payment_confirmed_at: result.payment!.confirmed_at });

    const employeeTimeline = await employee.rpc("get_order_timeline", { p_order_id: order.id });
    const paymentEvent = employeeTimeline.data?.find((event) => event.event_type === "payment_confirmed");
    expect(paymentEvent).toMatchObject({ actor_display_name: "M11 attention", occurred_at: result.payment!.confirmed_at, details: { payment_confirmed: true } });
    expect(paymentEvent?.details).not.toHaveProperty("amount");
    expect(employeeTimeline.data?.some((event) => event.event_type === "stage_moved")).toBe(true);
  });

  it("rechaza la versión obsoleta sin crear pago", async () => {
    await ensureCashOpen();
    const order = await createOrder("30.00");
    const concurrentUpdatedAt = "2026-08-12T19:01:00.000Z";
    const { error: updateError } = await service.from("orders").update({ description: "Actualización concurrente", updated_at: concurrentUpdatedAt }).eq("id", order.id);
    expect(updateError).toBeNull();
    const client = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const result = await confirm(client, order, `m11-stale-${randomUUID()}`);

    expect(result.error?.message).toContain("cambió en otra sesión");
    const { count, error } = await service.from("order_payments").select("id", { count: "exact", head: true }).eq("order_id", order.id);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it("mantiene move_order bloqueado en ambos sentidos de Pagado", async () => {
    await ensureCashOpen();
    const before = await createOrder("10.00");
    const alreadyPaid = await createOrder("10.00", "paid");
    const client = await signedClient(identities.find((identity) => identity.role === "attention")!);

    const intoPaid = await client.rpc("move_order", {
      p_order_id: before.id,
      p_from_stage_id: before.current_stage_id,
      p_to_stage_id: stages.paid,
      p_expected_updated_at: before.updated_at,
      p_idempotency_key: `m11-move-into-paid-${randomUUID()}`,
    });
    const outOfPaid = await client.rpc("move_order", {
      p_order_id: alreadyPaid.id,
      p_from_stage_id: alreadyPaid.current_stage_id,
      p_to_stage_id: stages.delivered,
      p_expected_updated_at: alreadyPaid.updated_at,
      p_idempotency_key: `m11-move-out-paid-${randomUUID()}`,
    });

    expect(intoPaid.error?.message).toContain("Pagado");
    expect(outOfPaid.error?.message).toContain("Pagado");
  });
});
