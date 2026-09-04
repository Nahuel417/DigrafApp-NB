import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const localUrl = url ?? "http://127.0.0.1:54396";
const password = `LABEL${randomUUID().replaceAll("-", "")}7`;

type Role = Database["public"]["Enums"]["app_role"];
type Label = Database["public"]["Enums"]["order_label"];
type Identity = { email: string; id: string; role: Role };
type OrderSeed = { id: string; updated_at: string };
type Client = SupabaseClient<Database>;

describe.skipIf(!url || !serviceRoleKey || !publishableKey)("Etiquetas de pedidos", () => {
  const service = createClient<Database>(localUrl, serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const orderIds: string[] = [];
  let receivedStageId: string;

  async function createIdentity(role: Role, options?: { active?: boolean; mustChangePassword?: boolean }) {
    const email = `${role}-labels-${randomUUID()}@digraf.local`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No se pudo crear una identidad sintética de etiquetas.");

    const { error: profileError } = await service.from("profiles").insert({
      id: data.user.id,
      display_name: `Labels ${role}`,
      role,
      is_active: options?.active ?? true,
      must_change_password: options?.mustChangePassword ?? false,
    });
    if (profileError) throw profileError;

    const identity = { email, id: data.user.id, role };
    identities.push(identity);
    return identity;
  }

  async function signedClient(identity: Pick<Identity, "email">): Promise<Client> {
    const client = createClient<Database>(localUrl, publishableKey ?? "test-key", { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email: identity.email, password });
    if (error) throw error;
    return client;
  }

  async function createOrder(): Promise<OrderSeed> {
    const { data, error } = await service.from("orders").insert({
      client_name: `Cliente labels ${randomUUID().slice(0, 8)}`,
      team_name: "Equipo labels",
      phone: "3515550199",
      quantity: 1,
      order_type: "individual",
      order_date: "2026-08-31",
      promised_delivery_date: "2026-09-01",
      current_stage_id: receivedStageId,
      created_by: identities[0]!.id,
      idempotency_key: `labels-${randomUUID()}`,
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    }).select("id, updated_at").single();
    if (error || !data) throw error ?? new Error("No se pudo crear un pedido sintético de etiquetas.");
    orderIds.push(data.id);
    return data;
  }

  function setLabel(client: Client, order: OrderSeed, label: Label | null) {
    return client.rpc("set_order_label", {
      p_order_id: order.id,
      p_label: label,
      p_expected_updated_at: order.updated_at,
    } as never);
  }

  beforeAll(async () => {
    const { data, error } = await service.from("workflow_stages").select("id").eq("code", "received").single();
    if (error || !data) throw error ?? new Error("No existe la etapa received.");
    receivedStageId = data.id;

    for (const role of ["super_admin", "admin", "attention", "employee"] as const) await createIdentity(role);
  });

  afterAll(async () => {
    if (orderIds.length) await service.from("order_change_events").delete().in("order_id", orderIds);
    if (orderIds.length) await service.from("orders").delete().in("id", orderIds);
    for (const identity of identities) {
      await service.from("profiles").delete().eq("id", identity.id);
      await service.auth.admin.deleteUser(identity.id);
    }
  });

  it("allows every operational role to assign, change, and remove a label", async () => {
    for (const identity of identities) {
      const client = await signedClient(identity);
      let order = await createOrder();

      const assigned = await setLabel(client, order, "urgent");
      expect(assigned.error).toBeNull();
      expect(assigned.data?.[0]).toMatchObject({ order_id: order.id, label: "urgent" });
      order = { ...order, updated_at: assigned.data?.[0]?.updated_at ?? order.updated_at };

      const changed = await setLabel(client, order, "returned");
      expect(changed.error).toBeNull();
      expect(changed.data?.[0]?.label).toBe("returned");
      order = { ...order, updated_at: changed.data?.[0]?.updated_at ?? order.updated_at };

      const removed = await setLabel(client, order, null);
      expect(removed.error).toBeNull();
      expect(removed.data?.[0]?.label).toBeNull();

      const { data: events, error } = await service.from("order_change_events").select("action, details").eq("order_id", order.id);
      expect(error).toBeNull();
      expect(events?.some((event) => event.action === "order_label_changed")).toBe(false);
    }
  });

  it("rejects anonymous, inactive, and password-change-pending actors", async () => {
    const order = await createOrder();
    const anonymous = createClient<Database>(localUrl, publishableKey ?? "test-key", { auth: { persistSession: false } });
    expect((await setLabel(anonymous, order, "review")).error).not.toBeNull();

    const inactive = await createIdentity("employee", { active: false });
    const pendingPassword = await createIdentity("employee", { mustChangePassword: true });
    expect((await setLabel(await signedClient(inactive), order, "review")).error).not.toBeNull();
    expect((await setLabel(await signedClient(pendingPassword), order, "review")).error).not.toBeNull();
  });

  it("rejects a stale request without creating an audit event", async () => {
    const client = await signedClient(identities[0]!);
    const order = await createOrder();
    const first = await setLabel(client, order, "urgent");
    const stale = await setLabel(client, order, "returned");

    expect(first.error).toBeNull();
    expect(stale.error?.message).toContain("otra sesión");
    const { count } = await service.from("order_change_events").select("id", { count: "exact", head: true }).eq("order_id", order.id);
    expect(count).toBe(0);
  });

  it("rejects direct table updates and returns the label in the board RPC", async () => {
    const order = await createOrder();
    const employee = await signedClient(identities.find((identity) => identity.role === "employee")!);
    expect((await employee.from("orders").update({ label: "review" }).eq("id", order.id)).error).not.toBeNull();

    const { data, error } = await employee.rpc("get_order_board", { p_search: "" });
    expect(error).toBeNull();
    expect((data as unknown as Array<{ id: string; label: Label | null }>).find((item) => item.id === order.id)?.label).toBeNull();
  });
});
