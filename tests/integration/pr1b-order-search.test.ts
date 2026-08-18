import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = `P1B${randomUUID().replaceAll("-", "")}7`;
type Role = Database["public"]["Enums"]["app_role"];
type Identity = { id: string; email: string; role: Role };
type Client = SupabaseClient<Database>;

describe.skipIf(!url || !serviceRoleKey || !publishableKey)("PR 1B: búsqueda del tablero y visibilidad financiera", () => {
  const service = createClient<Database>(url ?? "", serviceRoleKey ?? "", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const orderIds: string[] = [];

  async function createIdentity(role: Role) {
    const email = `pr1b-${role}-${randomUUID()}@example.test`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No se creó la identidad sintética PR1B.");
    const { error: profileError } = await service.from("profiles").insert({ id: data.user.id, display_name: `PR1B ${role}`, role, is_active: true, must_change_password: false });
    if (profileError) throw profileError;
    const identity = { id: data.user.id, email, role };
    identities.push(identity);
    return identity;
  }

  async function signedClient(identity: Identity): Promise<Client> {
    const client = createClient<Database>(url ?? "", publishableKey ?? "", { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email: identity.email, password });
    if (error) throw error;
    return client;
  }

  async function board(client: Client, search: string) {
    const result = await client.rpc("get_order_board" as never, { p_search: search } as never);
    if (result.error) throw result.error;
    return result.data as unknown as Array<{ id: string; customer_name: string; team_name: string | null; total_amount: number | null }>;
  }

  beforeAll(async () => {
    const superAdmin = await createIdentity("super_admin");
    const employee = await createIdentity("employee");
    const { data: stage } = await service.from("workflow_stages").select("id").eq("code", "received").single();
    if (!stage) throw new Error("No existe la etapa received.");
    const { data: order, error } = await service.from("orders").insert({ client_name: "Club Andino PR1B", team_name: "Las Montañas", phone: "+54 (351) 555-0199", quantity: 2, order_type: "individual", order_date: "2026-08-17", promised_delivery_date: "2026-08-20", current_stage_id: stage.id, created_by: superAdmin.id, idempotency_key: `pr1b-${randomUUID()}`, idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32) }).select("id").single();
    if (error || !order) throw error ?? new Error("No se creó el pedido sintético PR1B.");
    orderIds.push(order.id);
    const { error: financialError } = await service.from("order_financials").insert({ order_id: order.id, total_amount: 900, deposit_amount: 0, deposit_paid: false });
    if (financialError) throw financialError;
    await signedClient(employee);
  });

  afterAll(async () => {
    if (orderIds.length) await service.from("order_financials").delete().in("order_id", orderIds);
    if (orderIds.length) await service.from("orders").delete().in("id", orderIds);
    for (const identity of identities) { await service.from("profiles").delete().eq("id", identity.id); await service.auth.admin.deleteUser(identity.id); }
  });

  it("searches client/team and normalized phone server-side", async () => {
    const admin = await signedClient(identities.find((identity) => identity.role === "super_admin")!);
    expect((await board(admin, "andino")).map((order) => order.id)).toEqual(orderIds);
    expect((await board(admin, "3515550199")).map((order) => order.id)).toEqual(orderIds);
  });

  it("keeps financial fields null for Employee while preserving search", async () => {
    const employee = await signedClient(identities.find((identity) => identity.role === "employee")!);
    const result = await board(employee, "montañas");
    expect(result).toHaveLength(1);
    expect(result[0]?.total_amount).toBeNull();
  });
});
