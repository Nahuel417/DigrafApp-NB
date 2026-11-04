import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
type Role = Database["public"]["Enums"]["app_role"];
type ActorKey = Role | "inactive" | "password" | "revoked";
type Client = SupabaseClient<Database>;
type Json = Database["public"]["Functions"]["execute_stock_operation"]["Returns"];

describe.skipIf(!url || !key || !publicKey)("fabric stock", () => {
  const service = createClient<Database>(url ?? "http://127.0.0.1:54396", key ?? "test-key", { auth: { persistSession: false } });
  const users: string[] = [];
  const clients = {} as Record<ActorKey, Client>;
  const items: string[] = [];
  const password = `Stock-${randomUUID()}-7`;
  const date = "2026-10-01";
  const purchaseDate = "2026-10-02";
  async function execute(client: Client, action: string, data: Json, id = randomUUID()) {
    return client.rpc("execute_stock_operation", { p_action: action, p_data: data, p_key: id });
  }
  function itemId(data: Json | null) {
    if (!data || Array.isArray(data) || typeof data !== "object" || typeof data.item_id !== "string") {
      throw new Error("La operación de stock no devolvió el identificador esperado.");
    }
    return data.item_id;
  }
  async function create(quantity = "2", price = "100") {
    const result = await execute(clients.admin, "create", { name: `Stock ${randomUUID()}`, quantity, date, price });
    expect(result.error).toBeNull();
    const id = itemId(result.data);
    items.push(id);
    return id;
  }
  async function snapshot(id: string) {
    const result = await service.from("stock_items").select("*").eq("id", id).single();
    expect(result.error).toBeNull();
    return result.data;
  }
  async function movements(id: string) {
    const result = await service.from("stock_movements").select("*").eq("item_id", id).order("created_at");
    if (result.error) throw result.error;
    return result.data;
  }
  async function counts(id: string) {
    const [movement, price, cancellation, event, request] = await Promise.all([
      service.from("stock_movements").select("id", { count: "exact", head: true }).eq("item_id", id),
      service.from("stock_purchase_prices").select("movement_id", { count: "exact", head: true }).eq("item_id", id),
      service.from("stock_movement_cancellations").select("movement_id", { count: "exact", head: true }).eq("item_id", id),
      service.from("stock_item_events").select("id", { count: "exact", head: true }).eq("item_id", id),
      service.from("stock_requests").select("request_key", { count: "exact", head: true }).eq("item_id", id),
    ]);
    expect([movement.error, price.error, cancellation.error, event.error, request.error]).toEqual([null, null, null, null, null]);
    return { movement: movement.count, price: price.count, cancellation: cancellation.count, event: event.count, request: request.count };
  }
  async function stockCount() {
    const result = await service.from("stock_items").select("id", { count: "exact", head: true });
    expect(result.error).toBeNull();
    return result.count;
  }
  async function stockTotals() {
    const [stockItems, stockMovements, stockPrices, cancellations, events, requests] = await Promise.all([
      service.from("stock_items").select("id", { count: "exact", head: true }),
      service.from("stock_movements").select("id", { count: "exact", head: true }),
      service.from("stock_purchase_prices").select("movement_id", { count: "exact", head: true }),
      service.from("stock_movement_cancellations").select("movement_id", { count: "exact", head: true }),
      service.from("stock_item_events").select("id", { count: "exact", head: true }),
      service.from("stock_requests").select("request_key", { count: "exact", head: true }),
    ]);
    expect([stockItems.error, stockMovements.error, stockPrices.error, cancellations.error, events.error, requests.error]).toEqual([null, null, null, null, null, null]);
    return {
      items: stockItems.count,
      movements: stockMovements.count,
      prices: stockPrices.count,
      cancellations: cancellations.count,
      events: events.count,
      requests: requests.count,
    };
  }
  beforeAll(async () => {
    async function createIdentity(key: ActorKey, role: Role, options: { active?: boolean; mustChangePassword?: boolean } = {}) {
      const email = `stock-${key}-${randomUUID()}@example.test`;
      const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw error ?? new Error("No se pudo crear una identidad sintética de stock.");
      users.push(data.user.id);
      const profile = await service.from("profiles").insert({
        id: data.user.id,
        display_name: "Stock test",
        role,
        is_active: options.active ?? true,
        must_change_password: options.mustChangePassword ?? false,
      });
      if (profile.error) throw profile.error;
      const client = createClient<Database>(url!, publicKey!, { auth: { persistSession: false } });
      const signed = await client.auth.signInWithPassword({ email, password });
      if (signed.error) throw signed.error;
      clients[key] = client;
    }
    for (const role of ["super_admin", "admin", "attention", "employee"] as const) await createIdentity(role, role);
    await createIdentity("inactive", "admin", { active: false });
    await createIdentity("password", "admin", { mustChangePassword: true });
    await createIdentity("revoked", "admin");
  });
  afterAll(async () => {
    if (items.length) {
      for (const name of ["stock_movement_cancellations", "stock_purchase_prices", "stock_movements", "stock_item_events", "stock_requests"] as const) {
        const result = await service.from(name).delete().in("item_id", items);
        if (result.error) throw result.error;
      }
    }
    if (items.length) {
      const result = await service.from("stock_items").delete().in("id", items);
      if (result.error) throw result.error;
    }
    for (const id of users) {
      await service.from("profiles").delete().eq("id", id);
      await service.auth.admin.deleteUser(id);
    }
  });

  it("creates an opening balance, purchases and consumes half rolls without touching Caja", async () => {
    const { count: cashBefore, error: cashBeforeError } = await service.from("cash_movements").select("id", { count: "exact", head: true });
    expect(cashBeforeError).toBeNull();
    const id = await create("1.5");
    const opening = (await movements(id))[0]!;
    expect(await service.from("stock_purchase_prices").select("movement_id, amount").eq("movement_id", opening.id))
      .toMatchObject({ data: [{ movement_id: opening.id, amount: 100 }], error: null });
    const purchase = await execute(clients.admin, "purchase", { itemId: id, quantity: "2.5", date: purchaseDate, price: "123.45" });
    expect(purchase.error).toBeNull();
    expect(purchase.data).toEqual({ item_id: id });
    expect((await execute(clients.super_admin, "consumption", { itemId: id, quantity: "0.5", date })).error).toBeNull();
    expect(await snapshot(id)).toMatchObject({ quantity: 3.5 });
    expect((await movements(id)).map((row) => row.kind)).toEqual(expect.arrayContaining(["opening", "purchase", "consumption"]));
    expect((await movements(id)).map((row) => row.movement_date)).toEqual([date, purchaseDate, date]);
    const { count: cashAfter, error: cashAfterError } = await service.from("cash_movements").select("id", { count: "exact", head: true });
    expect(cashAfterError).toBeNull();
    expect(cashAfter).toBe(cashBefore);
  });
  it("blocks overdraw, invalid quantities, prices and dates without mutations", async () => {
    const id = await create();
    const before = await snapshot(id);
    const beforeCounts = await counts(id);
    const invalidAction = await execute(clients.admin, "unsupported", { itemId: id, quantity: "1", date });
    expect(invalidAction.error?.message).toBe("La operación de stock no es válida.");
    expect(await snapshot(id)).toEqual(before);
    expect(await counts(id)).toEqual(beforeCounts);
    const overdraw = await execute(clients.admin, "consumption", { itemId: id, quantity: "2.5", date });
    expect(overdraw.error?.message).toContain("El stock disponible no alcanza para registrar la salida.");
    for (const payload of [
      { quantity: "0.25", date }, { quantity: "1.25", date }, { quantity: "-1", date },
      { quantity: "0", date }, { quantity: "NaN", date }, { quantity: "0.5", date: "2999-01-01" },
      { quantity: "0.5", date: "2026-02-30" },
    ]) expect((await execute(clients.admin, "consumption", { itemId: id, ...payload })).error).not.toBeNull();
    for (const price of [null, "-1", "0", "1.001", "NaN"]) expect((await execute(clients.admin, "purchase", { itemId: id, quantity: "1", date, price })).error).not.toBeNull();
    expect((await execute(clients.admin, "create", { name: "   ", quantity: "1", date })).error).not.toBeNull();
    for (const price of [undefined, "letters", "1e3", "-1", "0", "1.001"]) {
      const before = await stockTotals();
      const data: Record<string, string> = { name: `Rejected ${randomUUID()}`, quantity: "0", date };
      if (price !== undefined) data.price = price;
      const result = await execute(clients.admin, "create", data);
      if (!result.error && result.data && !Array.isArray(result.data) && typeof result.data === "object" && typeof result.data.item_id === "string") {
        items.push(result.data.item_id);
      }
      expect({ rejected: Boolean(result.error), totals: await stockTotals() }).toEqual({ rejected: true, totals: before });
    }
    expect(await snapshot(id)).toEqual(before);
    expect(await counts(id)).toEqual(beforeCounts);
    expect(await movements(id)).toHaveLength(1);
  });
  it("normalizes unique fabric names and keeps invalid creations out of storage", async () => {
    const name = `Tela única ${randomUUID()}`;
    const result = await execute(clients.admin, "create", { name: ` ${name} `, quantity: "0", date, price: "12,50" });
    expect(result.error).toBeNull();
    const id = itemId(result.data);
    items.push(id);
    expect(await snapshot(id)).toMatchObject({ name, quantity: 0 });
    expect((await movements(id)).map((movement) => movement.kind)).toEqual(["opening"]);
    const openingId = (await movements(id))[0]!.id;
    expect(await service.from("stock_purchase_prices").select("movement_id, amount").eq("movement_id", openingId))
      .toMatchObject({ data: [{ movement_id: openingId, amount: 12.5 }], error: null });
    const countBeforeDuplicate = await stockCount();
    expect((await execute(clients.admin, "create", { name: name.toUpperCase(), quantity: "1", date, price: "1" })).error).not.toBeNull();
    expect(await stockCount()).toBe(countBeforeDuplicate);
  });
  it("keeps legacy opening movements without a fabricated price", async () => {
    const { data, error } = await service.from("stock_items").insert({
      name: `Legacy ${randomUUID()}`,
      quantity: 0,
      created_by: users[0]!,
      updated_by: users[0]!,
    }).select("id").single();
    expect(error).toBeNull();
    if (!data) throw new Error("No se creó el registro sintético legacy.");
    items.push(data.id);
    const movement = await service.from("stock_movements").insert({
      item_id: data.id,
      kind: "opening",
      quantity: 0,
      movement_date: date,
      actor_id: users[0]!,
    }).select("id").single();
    expect(movement.error).toBeNull();
    if (!movement.data) throw new Error("No se creó el movimiento sintético legacy.");
    const prices = await service.from("stock_purchase_prices").select("movement_id").eq("item_id", data.id);
    expect(prices).toMatchObject({ data: [], error: null });
  });
  it("protects mutations and purchase prices at the database boundary for every role", async () => {
    const id = await create();
    await execute(clients.admin, "purchase", { itemId: id, quantity: "1", date: purchaseDate, price: "500" });
    const anonymous = createClient<Database>(url!, publicKey!, { auth: { persistSession: false } });
    for (const role of ["attention", "employee", "inactive", "password"] as const) {
      const client = clients[role];
      const before = await snapshot(id);
      for (const action of ["create", "purchase", "consumption", "cancel", "rename", "activate"]) {
        expect((await execute(client, action, { itemId: id, name: "Denied", quantity: "1", date, price: "1", active: false, reason: "No" })).error).not.toBeNull();
      }
      const prices = await client.from("stock_purchase_prices").select("*").eq("item_id", id);
      expect(prices.error).toBeNull();
      expect(prices.data ?? []).toEqual([]);
      const requests = await client.from("stock_requests").select("*").eq("item_id", id);
      expect(requests.error).toBeNull();
      expect(requests.data ?? []).toEqual([]);
      expect(await snapshot(id)).toEqual(before);
      const visible = await client.from("stock_items").select("*").eq("id", id);
      expect(visible.data?.length ?? 0).toBe(role === "attention" || role === "employee" ? 1 : 0);
      const direct = await client.from("stock_items").update({ name: "Bypass" }).eq("id", id);
      expect(direct.error).not.toBeNull();
    }
    const before = await snapshot(id);
    for (const role of ["admin", "super_admin"] as const) {
      const prices = await clients[role].from("stock_purchase_prices").select("*").eq("item_id", id);
      expect(prices.error).toBeNull();
      expect(prices.data).toHaveLength(2);
      const itemsVisible = await clients[role].from("stock_items").select("*").eq("id", id);
      expect(itemsVisible.data).toHaveLength(1);
    }
    for (const role of ["attention", "employee"] as const) {
      const history = await clients[role].from("stock_movements").select("kind, movement_date, quantity").eq("item_id", id);
      expect(history.error).toBeNull();
      expect(history.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "opening", movement_date: date, quantity: 2 }),
        expect.objectContaining({ kind: "purchase", movement_date: purchaseDate, quantity: 1 }),
      ]));
    }
    expect((await execute(anonymous, "consumption", { itemId: id, quantity: "1", date })).error).not.toBeNull();
    const anonymousPrices = await anonymous.from("stock_purchase_prices").select("*").eq("item_id", id);
    expect(anonymousPrices.data ?? []).toEqual([]);
    expect(await snapshot(id)).toEqual(before);

    await service.from("profiles").update({ role: "employee" }).eq("id", users[6]!);
    expect((await execute(clients.revoked, "consumption", { itemId: id, quantity: "1", date })).error).not.toBeNull();
    expect(await snapshot(id)).toEqual(before);
  });
  it("serializes withdrawals and idempotent replay while rejecting conflicting keys", async () => {
    const id = await create("1");
    const attempts = await Promise.all([1, 2].map(() => execute(clients.admin, "consumption", { itemId: id, quantity: "1", date })));
    expect(attempts.filter((result) => !result.error)).toHaveLength(1);
    expect(await snapshot(id)).toMatchObject({ quantity: 0 });
    const request = randomUUID();
    const data = { itemId: id, quantity: "0.5", date, price: "1" };
    const replay = await Promise.all([execute(clients.admin, "purchase", data, request), execute(clients.admin, "purchase", data, request)]);
    expect(replay[0].error).toBeNull();
    expect(replay[0]).toEqual(replay[1]);
    expect(await snapshot(id)).toMatchObject({ quantity: 0.5 });
    const beforeCounts = await counts(id);
    expect((await execute(clients.admin, "purchase", { ...data, quantity: "1" }, request)).error).not.toBeNull();
    expect(await snapshot(id)).toMatchObject({ quantity: 0.5 });
    expect(await counts(id)).toEqual(beforeCounts);
  });
  it("stores exactly one opening price when creation is replayed idempotently", async () => {
    const request = randomUUID();
    const data = { name: `Idempotent ${randomUUID()}`, quantity: "0", date, price: "20.50" };
    const replay = await Promise.all([
      execute(clients.admin, "create", data, request),
      execute(clients.admin, "create", data, request),
    ]);
    expect(replay[0].error).toBeNull();
    expect(replay[0]).toEqual(replay[1]);
    const id = itemId(replay[0].data);
    items.push(id);
    expect(await movements(id)).toHaveLength(1);
    const opening = (await movements(id))[0]!;
    const prices = await service.from("stock_purchase_prices").select("movement_id, amount").eq("item_id", id);
    expect(prices).toMatchObject({ data: [{ movement_id: opening.id, amount: 20.5 }], error: null });
  });
  it("cancels append-only, rejects reversal overdraw and retires only zero balances", async () => {
    const id = await create("1");
    const opening = (await movements(id))[0]!.id;
    await execute(clients.admin, "consumption", { itemId: id, quantity: "1", date });
    const consumption = (await movements(id)).find((row) => row.kind === "consumption")!.id;
    const beforeRejectedOpeningCancellation = await counts(id);
    expect((await execute(clients.admin, "cancel", { itemId: id, movementId: opening, reason: "Carga incorrecta" })).error).not.toBeNull();
    expect(await snapshot(id)).toMatchObject({ quantity: 0 });
    expect(await counts(id)).toEqual(beforeRejectedOpeningCancellation);
    const beforeEmptyReason = await counts(id);
    expect((await execute(clients.admin, "cancel", { itemId: id, movementId: consumption, reason: "" })).error).not.toBeNull();
    expect(await counts(id)).toEqual(beforeEmptyReason);
    expect((await execute(clients.admin, "cancel", { itemId: id, movementId: consumption, reason: "Carga incorrecta" })).error).toBeNull();
    expect(await snapshot(id)).toMatchObject({ quantity: 1 });
    expect((await execute(clients.admin, "activate", { itemId: id, active: false })).error).not.toBeNull();
    expect((await execute(clients.admin, "cancel", { itemId: id, movementId: opening, reason: "Saldo inicial incorrecto" })).error).toBeNull();
    expect((await execute(clients.admin, "cancel", { itemId: id, movementId: opening, reason: "Otra anulación" })).error).not.toBeNull();
    expect((await execute(clients.admin, "activate", { itemId: id, active: false })).error).toBeNull();
    expect((await execute(clients.admin, "purchase", { itemId: id, quantity: "1", date, price: "5" })).error).not.toBeNull();
    expect((await execute(clients.admin, "activate", { itemId: id, active: true })).error).toBeNull();
    expect((await execute(clients.admin, "rename", { itemId: id, name: `Renamed ${id}` })).error).toBeNull();
    expect(await snapshot(id)).toMatchObject({ quantity: 0, name: `Renamed ${id}`, is_active: true });
    expect((await execute(clients.admin, "purchase", { itemId: id, quantity: "1", date, price: "50" })).error).toBeNull();
    const purchase = (await movements(id)).find((row) => row.kind === "purchase")!;
    expect((await execute(clients.admin, "cancel", { itemId: id, movementId: purchase.id, reason: "Compra duplicada" })).error).toBeNull();
    expect(await snapshot(id)).toMatchObject({ quantity: 0 });
    expect(await service.from("stock_purchase_prices").select("movement_id, amount").eq("movement_id", purchase.id)).toMatchObject({ data: [{ movement_id: purchase.id, amount: 50 }], error: null });
    expect(await movements(id)).toHaveLength(3);
    const cancellations = await service.from("stock_movement_cancellations").select("movement_id, reason").eq("item_id", id);
    expect(cancellations.error).toBeNull();
    expect(cancellations.data).toHaveLength(3);
  });
});
