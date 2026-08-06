import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const localUrl = url ?? "http://127.0.0.1:54321";
const password = `M9${randomUUID().replaceAll("-", "")}7`;

type Identity = { email: string; id: string; role: "attention" | "employee" };
type Client = SupabaseClient<Database>;

function currentOperationalDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function operationalDateOffset(days: number) {
  const date = new Date(`${currentOperationalDate()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe.skipIf(!url || !serviceRoleKey || !publishableKey)("Fundación de caja M9", () => {
  const service = createClient<Database>(localUrl, serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const clients = new Map<string, Client>();
  const operationalDate = currentOperationalDate();
  let cashDayId = "";
  let preExistingCashDay = false;
  let customCategoryId = "";
  let referenceMovementId = "";
  let currentMovementId = "";
  let historicalMovementId = "";
  let currentOpeningEventId = "";
  let historicalOpeningEventId = "";
  let historicalCashDayId = "";

  async function createIdentity(
    role: Identity["role"],
    options?: { active?: boolean; mustChangePassword?: boolean },
  ) {
    const email = `${role}-m9-${randomUUID()}@digraf.local`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No se pudo crear una identidad sintética M9.");

    const { error: profileError } = await service.from("profiles").insert({
      id: data.user.id,
      display_name: `M9 ${role}`,
      role,
      is_active: options?.active ?? true,
      must_change_password: options?.mustChangePassword ?? false,
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
    clients.set(identity.id, client);
    return client;
  }

  async function ensureCurrentCashDay() {
    return service.rpc("ensure_current_cash_day");
  }

  beforeAll(async () => {
    const existing = await service.from("cash_days").select("id").eq("operational_date", operationalDate).maybeSingle();
    if (existing.error) throw existing.error;
    preExistingCashDay = Boolean(existing.data);

    await createIdentity("attention");
    await createIdentity("employee");
    await createIdentity("attention", { active: false });
    await createIdentity("attention", { mustChangePassword: true });
  });

  afterAll(async () => {
    const failures: string[] = [];
    async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await operation;
      if (error) failures.push(`${label}: ${error.message}`);
    }

    if (referenceMovementId) {
      await cleanup("cash_movements", service.from("cash_movements").delete().eq("id", referenceMovementId));
    }
    for (const movementId of [currentMovementId, historicalMovementId].filter(Boolean)) {
      await cleanup("cash_movements", service.from("cash_movements").delete().eq("id", movementId));
    }
    for (const eventId of [currentOpeningEventId, historicalOpeningEventId].filter(Boolean)) {
      await cleanup("cash_opening_events", service.from("cash_opening_events").delete().eq("id", eventId));
    }
    if (customCategoryId) {
      await cleanup("cash_expense_categories", service.from("cash_expense_categories").delete().eq("id", customCategoryId));
    }
    if (historicalCashDayId) {
      await cleanup("cash_days", service.from("cash_days").delete().eq("id", historicalCashDayId));
    }
    if (cashDayId && !preExistingCashDay) {
      await cleanup("cash_days", service.from("cash_days").delete().eq("id", cashDayId));
    }
    for (const identity of identities) await cleanup(`auth user ${identity.id}`, service.auth.admin.deleteUser(identity.id));
    if (failures.length) throw new Error(`Falló el cleanup M9:\n${failures.join("\n")}`);
  });

  it("crea exactamente una caja Córdoba con apertura 0.00 en la primera consulta", async () => {
    const result = await ensureCurrentCashDay();
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    cashDayId = result.data?.[0]?.cash_day_id ?? "";
    expect(result.data?.[0]).toMatchObject({ operational_date: operationalDate, opening_balance: 0 });
    expect(cashDayId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("devuelve la misma caja ante concurrencia y reintentos", async () => {
    const retry = await ensureCurrentCashDay();
    const [firstConcurrent, secondConcurrent] = await Promise.all([ensureCurrentCashDay(), ensureCurrentCashDay()]);

    expect(retry.error).toBeNull();
    expect(firstConcurrent.error).toBeNull();
    expect(secondConcurrent.error).toBeNull();
    expect(retry.data?.[0]?.cash_day_id).toBe(cashDayId);
    expect(firstConcurrent.data?.[0]?.cash_day_id).toBe(cashDayId);
    expect(secondConcurrent.data?.[0]?.cash_day_id).toBe(cashDayId);

    const { count, error } = await service
      .from("cash_days")
      .select("id", { count: "exact", head: true })
      .eq("operational_date", operationalDate);
    expect(error).toBeNull();
    expect(count).toBe(1);
  });

  it("permite leer la caja y las cinco categorías a un perfil operativo autorizado", async () => {
    const attention = await signedClient(identities[0]!);
    const { data: days, error: daysError } = await attention.from("cash_days").select("id, operational_date, opening_balance");
    const { data: categories, error: categoriesError } = await attention
      .from("cash_expense_categories")
      .select("code, name, is_active")
      .order("code");

    expect(daysError).toBeNull();
    expect(days).toEqual([{ id: cashDayId, operational_date: operationalDate, opening_balance: 0 }]);
    expect(categoriesError).toBeNull();
    expect(categories).toHaveLength(5);
    expect(categories?.map((category) => category.code)).toEqual([
      "maintenance_equipment",
      "materials_supplies",
      "other",
      "services",
      "wages",
    ]);
    expect(categories?.every((category) => category.is_active)).toBe(true);
  });

  it("expone solo las filas del día operativo Córdoba actual", async () => {
    const attention = clients.get(identities[0]!.id) ?? (await signedClient(identities[0]!));
    const historicalDate = operationalDateOffset(-1);
    const actorId = identities[0]!.id;

    const { data: historicalDay, error: historicalDayError } = await service
      .from("cash_days")
      .insert({ operational_date: historicalDate, opening_balance: "10.00" })
      .select("id")
      .single();
    if (historicalDayError || !historicalDay) throw historicalDayError ?? new Error("No se pudo crear la caja histórica M9.");
    historicalCashDayId = historicalDay.id;

    const [currentEvent, historicalEvent] = await Promise.all([
      service.from("cash_opening_events").insert({
        cash_day_id: cashDayId,
        previous_amount: "0.00",
        new_amount: "10.00",
        actor_id: actorId,
        idempotency_key: randomUUID(),
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      }).select("id").single(),
      service.from("cash_opening_events").insert({
        cash_day_id: historicalCashDayId,
        previous_amount: "0.00",
        new_amount: "10.00",
        actor_id: actorId,
        idempotency_key: randomUUID(),
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      }).select("id").single(),
    ]);
    if (currentEvent.error || !currentEvent.data) throw currentEvent.error ?? new Error("No se pudo crear el evento actual M9.");
    if (historicalEvent.error || !historicalEvent.data) throw historicalEvent.error ?? new Error("No se pudo crear el evento histórico M9.");
    currentOpeningEventId = currentEvent.data.id;
    historicalOpeningEventId = historicalEvent.data.id;

    const [currentMovement, historicalMovement] = await Promise.all([
      service.from("cash_movements").insert({
        cash_day_id: cashDayId,
        direction: "income",
        amount: "3.00",
        description: "Ingreso actual M9",
        actor_id: actorId,
        idempotency_key: randomUUID(),
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      }).select("id").single(),
      service.from("cash_movements").insert({
        cash_day_id: historicalCashDayId,
        direction: "income",
        amount: "4.00",
        description: "Ingreso histórico M9",
        actor_id: actorId,
        idempotency_key: randomUUID(),
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      }).select("id").single(),
    ]);
    if (currentMovement.error || !currentMovement.data) throw currentMovement.error ?? new Error("No se pudo crear el movimiento actual M9.");
    if (historicalMovement.error || !historicalMovement.data) throw historicalMovement.error ?? new Error("No se pudo crear el movimiento histórico M9.");
    currentMovementId = currentMovement.data.id;
    historicalMovementId = historicalMovement.data.id;

    const [{ data: days, error: daysError }, { data: events, error: eventsError }, { data: movements, error: movementsError }] = await Promise.all([
      attention.from("cash_days").select("id").in("id", [cashDayId, historicalCashDayId]),
      attention.from("cash_opening_events").select("id, cash_day_id").in("id", [currentOpeningEventId, historicalOpeningEventId]),
      attention.from("cash_movements").select("id, cash_day_id").in("id", [currentMovementId, historicalMovementId]),
    ]);

    expect(daysError).toBeNull();
    expect(days).toEqual([{ id: cashDayId }]);
    expect(eventsError).toBeNull();
    expect(events).toEqual([{ id: currentOpeningEventId, cash_day_id: cashDayId }]);
    expect(movementsError).toBeNull();
    expect(movements).toEqual([{ id: currentMovementId, cash_day_id: cashDayId }]);
  });

  it("rechaza la visibilidad de caja para Empleado, perfil inactivo y cambio obligatorio", async () => {
    for (const identity of identities.slice(1)) {
      const client = await signedClient(identity);
      const { data, error } = await client.from("cash_days").select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it("revoca el DML financiero directo para authenticated", async () => {
    const attention = clients.get(identities[0]!.id) ?? (await signedClient(identities[0]!));
    const { data: category, error: categoryError } = await service
      .from("cash_expense_categories")
      .select("id")
      .eq("code", "materials_supplies")
      .single();
    if (categoryError || !category) throw categoryError ?? new Error("No se encontró la categoría semilla M9.");

    expect((await attention.from("cash_days").insert({ operational_date: operationalDate, opening_balance: "0.00" })).error).not.toBeNull();
    expect((await attention.from("cash_opening_events").insert({
      cash_day_id: cashDayId,
      previous_amount: "0.00",
      new_amount: "1.00",
      actor_id: identities[0]!.id,
      idempotency_key: randomUUID(),
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    })).error).not.toBeNull();
    expect((await attention.from("cash_movements").insert({
      cash_day_id: cashDayId,
      direction: "expense",
      amount: "1.00",
      description: "DML directo M9",
      expense_category_id: category.id,
      expense_category_code: "materials_supplies",
      expense_category_name: "Materiales e insumos",
      actor_id: identities[0]!.id,
      idempotency_key: randomUUID(),
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    })).error).not.toBeNull();
  });

  it("mantiene una categoría inactiva referenciada sin permitir borrarla", async () => {
    const { data: category, error: categoryError } = await service
      .from("cash_expense_categories")
      .insert({ code: `test_m9_${randomUUID().replaceAll("-", "").slice(0, 12)}`, name: "Categoría M9 de prueba" })
      .select("id, code, name")
      .single();
    if (categoryError || !category) throw categoryError ?? new Error("No se pudo crear la categoría M9 de prueba.");
    customCategoryId = category.id;

    const { data: movement, error: movementError } = await service
      .from("cash_movements")
      .insert({
        cash_day_id: cashDayId,
        direction: "expense",
        amount: "2.00",
        description: "Referencia de integridad M9",
        expense_category_id: category.id,
        expense_category_code: category.code,
        expense_category_name: category.name,
        actor_id: identities[0]!.id,
        idempotency_key: randomUUID(),
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      })
      .select("id")
      .single();
    if (movementError || !movement) throw movementError ?? new Error("No se pudo crear el movimiento de referencia M9.");
    referenceMovementId = movement.id;

    expect((await service.from("cash_expense_categories").update({ is_active: false }).eq("id", category.id)).error).toBeNull();
    expect((await service.from("cash_expense_categories").delete().eq("id", category.id)).error).not.toBeNull();
    expect((await service.from("cash_movements").select("expense_category_id").eq("id", movement.id)).data).toEqual([
      { expense_category_id: category.id },
    ]);
  });
});
