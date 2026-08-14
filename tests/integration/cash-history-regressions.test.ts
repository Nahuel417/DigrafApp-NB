import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const enabled = Boolean(url && serviceRoleKey && publishableKey);

describe.skipIf(!enabled)("cash history regressions", () => {
  const password = `Cash${randomUUID().replaceAll("-", "")}7`;
  const operationalDate = "2020-01-02";
  let actorId = "";
  const userIds: string[] = [];
  const movementIds = [randomUUID(), randomUUID()].sort().reverse();
  const createdAt = "2020-01-02T12:00:00.000Z";
  let cashDayId = "";
  const service = createClient<Database>(url!, serviceRoleKey!, { auth: { persistSession: false } });

  async function createUser(role: "super_admin" | "admin" | "attention" | "employee") {
    const email = `cash-history-${role}-${randomUUID()}@digraf.local`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error(`No se creó ${role}.`);
    userIds.push(created.data.user.id);
    const profile = await service.from("profiles").insert({ id: created.data.user.id, display_name: `Cash ${role}`, role, is_active: true, must_change_password: false });
    if (profile.error) throw profile.error;
    return { email, id: created.data.user.id };
  }

  async function signedClient(email: string) {
    const client = createClient<Database>(url!, publishableKey!, { auth: { persistSession: false } });
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    return client;
  }

  beforeAll(async () => {
    actorId = (await createUser("attention")).id;
    const day = await service.from("cash_days").insert({ operational_date: operationalDate, opening_balance: 0, closed_at: createdAt, closed_by: actorId, closure_kind: "manual", closing_balance: 30 }).select("id").single();
    if (day.error || !day.data) throw day.error ?? new Error("No se creó la caja histórica.");
    cashDayId = day.data.id;
    const movements = await service.from("cash_movements").insert(movementIds.map((id, index) => ({ id, cash_day_id: cashDayId, direction: "income" as const, amount: (index + 1) * 10, description: `Movimiento ${index}`, actor_id: actorId, created_at: createdAt, idempotency_key: `history-${id}`, idempotency_fingerprint: id.replaceAll("-", "").slice(0, 32) })));
    if (movements.error) throw movements.error;
  });

  afterAll(async () => {
    if (cashDayId) await service.from("cash_movements").delete().eq("cash_day_id", cashDayId);
    if (cashDayId) await service.from("cash_day_lifecycle_events").delete().eq("cash_day_id", cashDayId);
    if (cashDayId) await service.from("cash_days").delete().eq("id", cashDayId);
    if (userIds.length) await service.from("profiles").delete().in("id", userIds);
    for (const id of userIds) await service.auth.admin.deleteUser(id);
  });

  it("returns the most recent movement first and breaks timestamp ties by id descending", async () => {
    const client = await signedClient((await service.auth.admin.getUserById(actorId)).data.user!.email!);
    const result = await client.rpc("get_cash_day_summary", { p_cash_day_id: cashDayId });
    expect(result.error).toBeNull();
    expect((result.data?.[0]?.movements as Array<{ id: string }>).map((movement) => movement.id)).toEqual(movementIds);
  });

  it("allows operational roles to reopen with a reason and denies Employee", async () => {
    const employee = await createUser("employee");
    expect((await (await signedClient(employee.email)).rpc("reopen_cash_day", { p_cash_day_id: cashDayId, p_reason: "Intento", p_idempotency_key: randomUUID() })).error).not.toBeNull();

    for (const role of ["super_admin", "admin", "attention"] as const) {
      const identity = role === "attention" ? { email: (await service.auth.admin.getUserById(actorId)).data.user!.email!, id: actorId } : await createUser(role);
      const client = await signedClient(identity.email);
      expect((await client.rpc("reopen_cash_day", { p_cash_day_id: cashDayId, p_reason: "", p_idempotency_key: randomUUID() })).error).not.toBeNull();
      const reopened = await client.rpc("reopen_cash_day", { p_cash_day_id: cashDayId, p_reason: `Corrección ${role}`, p_idempotency_key: randomUUID() });
      expect(reopened.error).toBeNull();
      expect(reopened.data?.[0]).toMatchObject({ cash_day_id: cashDayId, reopened_by: identity.id, reason: `Corrección ${role}` });
      if (role !== "attention") {
        const closed = await service.from("cash_days").update({ closed_at: createdAt, closed_by: identity.id, closure_kind: "manual", closing_balance: 30 }).eq("id", cashDayId);
        if (closed.error) throw closed.error;
      }
    }
  });
});
