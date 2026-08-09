import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const localUrl = url ?? "http://127.0.0.1:54321";
const password = `M9${randomUUID().replaceAll("-", "")}7`;

type Identity = { email: string; id: string; role: "super_admin" | "admin" | "attention" | "employee" };
type Client = SupabaseClient<Database>;
type RpcError = { code?: string; message: string };
type RpcResponse<T> = { data: T | null; error: RpcError | null };
type CashSummary = {
  cash_day_id: string;
  operational_date: string;
  opening_balance: number;
  opening_updated_at: string;
  current_balance: number;
  movements: Array<{ id: string }>;
  categories: Array<{ code: string }>;
};
type CashOpeningResult = { cash_day_id: string; event_id: string; opening_balance: number; opening_updated_at: string };
type CashMovementResult = {
  amount: number;
  direction: "income" | "expense";
  expense_category_code: string | null;
  expense_category_id: string | null;
  expense_category_name: string | null;
  movement_id: string;
};

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
  let initialOpeningBalance = 0;
  let initialOpeningUpdatedAt = "";
  let customCategoryId = "";
  let referenceMovementId = "";
  let currentMovementId = "";
  let historicalMovementId = "";
  let currentOpeningEventId = "";
  let historicalOpeningEventId = "";
  let historicalCashDayId = "";
  const rpcOpeningEventIds: string[] = [];
  const rpcMovementIds: string[] = [];

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

  async function invokeRpc<T>(client: Client, name: string, args: Record<string, unknown>): Promise<RpcResponse<T>> {
    const rpc = client.rpc.bind(client) as unknown as (functionName: string, parameters: Record<string, unknown>) => Promise<RpcResponse<T>>;
    return rpc(name, args);
  }

  beforeAll(async () => {
    const existing = await service
      .from("cash_days")
      .select("id, opening_balance, opening_updated_at")
      .eq("operational_date", operationalDate)
      .maybeSingle();
    if (existing.error) throw existing.error;
    preExistingCashDay = Boolean(existing.data);
    initialOpeningBalance = existing.data?.opening_balance ?? 0;
    initialOpeningUpdatedAt = existing.data?.opening_updated_at ?? "";

    await createIdentity("attention");
    await createIdentity("employee");
    await createIdentity("attention", { active: false });
    await createIdentity("attention", { mustChangePassword: true });
    await createIdentity("super_admin");
    await createIdentity("admin");
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
    for (const movementId of rpcMovementIds) {
      await cleanup("cash_movements RPC", service.from("cash_movements").delete().eq("id", movementId));
    }
    for (const eventId of [currentOpeningEventId, historicalOpeningEventId].filter(Boolean)) {
      await cleanup("cash_opening_events", service.from("cash_opening_events").delete().eq("id", eventId));
    }
    for (const eventId of rpcOpeningEventIds) {
      await cleanup("cash_opening_events RPC", service.from("cash_opening_events").delete().eq("id", eventId));
    }
    if (customCategoryId) {
      await cleanup("cash_expense_categories", service.from("cash_expense_categories").delete().eq("id", customCategoryId));
    }
    if (historicalCashDayId) {
      await cleanup("cash_days", service.from("cash_days").delete().eq("id", historicalCashDayId));
    }
    if (cashDayId && !preExistingCashDay) {
      await cleanup("cash_days", service.from("cash_days").delete().eq("id", cashDayId));
    } else if (cashDayId && preExistingCashDay) {
      await cleanup(
        "cash_days restore",
        service
          .from("cash_days")
          .update({ opening_balance: initialOpeningBalance, opening_updated_at: initialOpeningUpdatedAt })
          .eq("id", cashDayId),
      );
    }
    for (const identity of identities) await cleanup(`auth user ${identity.id}`, service.auth.admin.deleteUser(identity.id));
    if (failures.length) throw new Error(`Falló el cleanup M9:\n${failures.join("\n")}`);
  });

  it("crea exactamente una caja Córdoba con apertura 0.00 en la primera consulta", async () => {
    const attention = await signedClient(identities[0]!);
    const result = await invokeRpc<CashSummary[]>(attention, "get_current_cash_summary", {});
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    cashDayId = result.data?.[0]?.cash_day_id ?? "";
    expect(result.data?.[0]).toMatchObject({
      cash_day_id: cashDayId,
      operational_date: operationalDate,
      opening_balance: initialOpeningBalance,
      current_balance: initialOpeningBalance,
      movements: [],
    });
    expect(result.data?.[0]?.categories).toHaveLength(5);
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
    expect(days).toEqual([{ id: cashDayId, operational_date: operationalDate, opening_balance: initialOpeningBalance }]);
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
      .insert({ operational_date: historicalDate, opening_balance: 10 })
      .select("id")
      .single();
    if (historicalDayError || !historicalDay) throw historicalDayError ?? new Error("No se pudo crear la caja histórica M9.");
    historicalCashDayId = historicalDay.id;

    const [currentEvent, historicalEvent] = await Promise.all([
      service.from("cash_opening_events").insert({
        cash_day_id: cashDayId,
        previous_amount: 0,
        new_amount: 10,
        actor_id: actorId,
        idempotency_key: randomUUID(),
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      }).select("id").single(),
      service.from("cash_opening_events").insert({
        cash_day_id: historicalCashDayId,
        previous_amount: 0,
        new_amount: 10,
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
        amount: 3,
        description: "Ingreso actual M9",
        actor_id: actorId,
        idempotency_key: randomUUID(),
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      }).select("id").single(),
      service.from("cash_movements").insert({
        cash_day_id: historicalCashDayId,
        direction: "income",
        amount: 4,
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

    const { error: cleanupError } = await service.from("cash_movements").delete().eq("id", currentMovementId);
    expect(cleanupError).toBeNull();
    currentMovementId = "";
  });

  it("permite abrir a roles autorizados, audita y reintenta sin duplicar", async () => {
    const attention = clients.get(identities[0]!.id) ?? (await signedClient(identities[0]!));
    const initial = await invokeRpc<CashSummary[]>(attention, "get_current_cash_summary", {});
    expect(initial.error).toBeNull();
    const initialSummary = initial.data?.[0];
    if (!initialSummary) throw new Error("No se obtuvo el resumen inicial de caja M9.");

    const openingKey = `m9-opening-${randomUUID()}`;
    const openingArgs = {
      p_amount: "100.00",
      p_expected_opening_updated_at: initialSummary.opening_updated_at,
      p_idempotency_key: openingKey,
    };
    const opened = await invokeRpc<CashOpeningResult[]>(attention, "set_cash_opening", openingArgs);
    expect(opened.error).toBeNull();
    expect(opened.data).toHaveLength(1);
    const opening = opened.data?.[0];
    if (!opening) throw new Error("No se obtuvo el resultado de apertura M9.");
    rpcOpeningEventIds.push(opening.event_id);
    expect(opening).toMatchObject({ cash_day_id: cashDayId, opening_balance: 100 });

    const replay = await invokeRpc<CashOpeningResult[]>(attention, "set_cash_opening", openingArgs);
    expect(replay.error).toBeNull();
    expect(replay.data?.[0]).toEqual(opening);
    const { count: replayEventCount, error: replayEventError } = await service
      .from("cash_opening_events")
      .select("id", { count: "exact", head: true })
      .eq("actor_id", identities[0]!.id)
      .eq("idempotency_key", openingKey);
    expect(replayEventError).toBeNull();
    expect(replayEventCount).toBe(1);

    const changedPayload = await invokeRpc<CashOpeningResult[]>(attention, "set_cash_opening", {
      ...openingArgs,
      p_amount: "101.00",
    });
    expect(changedPayload.error).not.toBeNull();

    let expectedUpdatedAt = opening.opening_updated_at;
    for (const identity of [identities[4]!, identities[5]!]) {
      const client = await signedClient(identity);
      const authorized = await invokeRpc<CashOpeningResult[]>(client, "set_cash_opening", {
        p_amount: "100.00",
        p_expected_opening_updated_at: expectedUpdatedAt,
        p_idempotency_key: `m9-opening-${identity.role}-${randomUUID()}`,
      });
      expect(authorized.error).toBeNull();
      const authorizedOpening = authorized.data?.[0];
      if (!authorizedOpening) throw new Error(`No se obtuvo apertura para ${identity.role}.`);
      rpcOpeningEventIds.push(authorizedOpening.event_id);
      expectedUpdatedAt = authorizedOpening.opening_updated_at;
    }

    const stale = await invokeRpc<CashOpeningResult[]>(attention, "set_cash_opening", {
      p_amount: "99.00",
      p_expected_opening_updated_at: initialSummary.opening_updated_at,
      p_idempotency_key: `m9-opening-stale-${randomUUID()}`,
    });
    expect(stale.error).not.toBeNull();

    const { data: event, error: eventError } = await service
      .from("cash_opening_events")
      .select("previous_amount, new_amount, actor_id, created_at, idempotency_key")
      .eq("id", opening.event_id)
      .single();
    expect(eventError).toBeNull();
    expect(event).toMatchObject({
      previous_amount: initialOpeningBalance,
      new_amount: 100,
      actor_id: identities[0]!.id,
      idempotency_key: openingKey,
    });
    expect(event?.created_at).toMatch(/T/);
  });

  it("permite movimientos autorizados y conserva el snapshot de categoría", async () => {
    for (const identity of [identities[4]!, identities[5]!, identities[0]!]) {
      const client = await signedClient(identity);
      const result = await invokeRpc<CashMovementResult[]>(client, "create_cash_movement", {
        p_direction: "income",
        p_amount: "1.00",
        p_description: `Autorización ${identity.role}`,
        p_expense_category_id: null,
        p_idempotency_key: `m9-authorized-${identity.role}-${randomUUID()}`,
      });
      expect(result.error).toBeNull();
      const movement = result.data?.[0];
      if (!movement) throw new Error(`No se obtuvo movimiento para ${identity.role}.`);
      expect(movement).toMatchObject({ direction: "income", amount: 1, expense_category_id: null });
      const { error } = await service.from("cash_movements").delete().eq("id", movement.movement_id);
      expect(error).toBeNull();
    }
  });

  it("calcula 100.00 + 25.50 - 10.25 como 115.25 y hace reintentos idempotentes", async () => {
    const attention = clients.get(identities[0]!.id) ?? (await signedClient(identities[0]!));
    const { data: category, error: categoryError } = await service
      .from("cash_expense_categories")
      .select("id, code, name")
      .eq("code", "materials_supplies")
      .single();
    if (categoryError || !category) throw categoryError ?? new Error("No se encontró la categoría semilla M9.");

    const incomeKey = `m9-income-${randomUUID()}`;
    const incomeArgs = {
      p_direction: "income",
      p_amount: "25.50",
      p_description: "Ingreso manual M9",
      p_expense_category_id: null,
      p_idempotency_key: incomeKey,
    };
    const income = await invokeRpc<CashMovementResult[]>(attention, "create_cash_movement", incomeArgs);
    expect(income.error).toBeNull();
    const incomeMovement = income.data?.[0];
    if (!incomeMovement) throw new Error("No se obtuvo el ingreso M9.");
    rpcMovementIds.push(incomeMovement.movement_id);

    const incomeReplay = await invokeRpc<CashMovementResult[]>(attention, "create_cash_movement", incomeArgs);
    expect(incomeReplay.error).toBeNull();
    expect(incomeReplay.data?.[0]).toEqual(incomeMovement);
    const { count: incomeCount, error: incomeCountError } = await service
      .from("cash_movements")
      .select("id", { count: "exact", head: true })
      .eq("actor_id", identities[0]!.id)
      .eq("idempotency_key", incomeKey);
    expect(incomeCountError).toBeNull();
    expect(incomeCount).toBe(1);

    const changedIncome = await invokeRpc<CashMovementResult[]>(attention, "create_cash_movement", {
      ...incomeArgs,
      p_amount: "26.50",
    });
    expect(changedIncome.error).not.toBeNull();

    const expense = await invokeRpc<CashMovementResult[]>(attention, "create_cash_movement", {
      p_direction: "expense",
      p_amount: "10.25",
      p_description: "Egreso manual M9",
      p_expense_category_id: category.id,
      p_idempotency_key: `m9-expense-${randomUUID()}`,
    });
    expect(expense.error).toBeNull();
    const expenseMovement = expense.data?.[0];
    if (!expenseMovement) throw new Error("No se obtuvo el egreso M9.");
    rpcMovementIds.push(expenseMovement.movement_id);
    expect(expenseMovement).toMatchObject({
      direction: "expense",
      amount: 10.25,
      expense_category_id: category.id,
      expense_category_code: category.code,
      expense_category_name: category.name,
    });

    const invalidRequests = [
      { p_direction: "income", p_amount: "1.00", p_description: " ", p_expense_category_id: null },
      { p_direction: "expense", p_amount: "1.00", p_description: "Egreso sin categoría", p_expense_category_id: null },
      { p_direction: "income", p_amount: "0.00", p_description: "Importe cero", p_expense_category_id: null },
      { p_direction: "income", p_amount: "10.999", p_description: "Más de dos decimales", p_expense_category_id: null },
      { p_direction: "income", p_amount: "-1.00", p_description: "Importe negativo", p_expense_category_id: null },
    ];
    for (const request of invalidRequests) {
      const invalid = await invokeRpc<CashMovementResult[]>(attention, "create_cash_movement", {
        ...request,
        p_idempotency_key: `m9-invalid-${randomUUID()}`,
      });
      expect(invalid.error).not.toBeNull();
    }

    const summary = await invokeRpc<CashSummary[]>(attention, "get_current_cash_summary", {});
    expect(summary.error).toBeNull();
    const current = summary.data?.[0];
    if (!current) throw new Error("No se obtuvo el resumen final M9.");
    expect(current).toMatchObject({
      cash_day_id: cashDayId,
      operational_date: operationalDate,
      opening_balance: 100,
      current_balance: 115.25,
    });
    expect(current.movements.map((movement) => movement.id)).toEqual(
      expect.arrayContaining([incomeMovement.movement_id, expenseMovement.movement_id]),
    );
    expect(current.movements.map((movement) => movement.id)).not.toContain(historicalMovementId);
    expect(current.categories.map((item) => item.code)).toEqual([
      "maintenance_equipment",
      "materials_supplies",
      "other",
      "services",
      "wages",
    ]);
  });

  it("rechaza las RPC financieras para Empleado, perfiles inactivos y cambio obligatorio", async () => {
    const attention = clients.get(identities[0]!.id) ?? (await signedClient(identities[0]!));
    const summary = await invokeRpc<CashSummary[]>(attention, "get_current_cash_summary", {});
    expect(summary.error).toBeNull();
    const current = summary.data?.[0];
    if (!current) throw new Error("No se obtuvo el resumen para probar autorización M9.");

    for (const identity of identities.slice(1, 4)) {
      const client = await signedClient(identity);
      const opening = await invokeRpc<CashOpeningResult[]>(client, "set_cash_opening", {
        p_amount: "100.00",
        p_expected_opening_updated_at: current.opening_updated_at,
        p_idempotency_key: `m9-rejected-opening-${identity.role}-${randomUUID()}`,
      });
      expect(opening.error).not.toBeNull();

      const movement = await invokeRpc<CashMovementResult[]>(client, "create_cash_movement", {
        p_direction: "income",
        p_amount: "1.00",
        p_description: "Movimiento rechazado M9",
        p_expense_category_id: null,
        p_idempotency_key: `m9-rejected-movement-${identity.role}-${randomUUID()}`,
      });
      expect(movement.error).not.toBeNull();
    }
  });

  it("rechaza la visibilidad de caja para Empleado, perfil inactivo y cambio obligatorio", async () => {
    for (const identity of identities.slice(1, 4)) {
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

    expect((await attention.from("cash_days").insert({ operational_date: operationalDate, opening_balance: 0 })).error).not.toBeNull();
    expect((await attention.from("cash_opening_events").insert({
      cash_day_id: cashDayId,
      previous_amount: 0,
      new_amount: 1,
      actor_id: identities[0]!.id,
      idempotency_key: randomUUID(),
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    })).error).not.toBeNull();
    expect((await attention.from("cash_movements").insert({
      cash_day_id: cashDayId,
      direction: "expense",
      amount: 1,
      description: "DML directo M9",
      expense_category_id: category.id,
      expense_category_code: "materials_supplies",
      expense_category_name: "Materiales e insumos",
      actor_id: identities[0]!.id,
      idempotency_key: randomUUID(),
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    })).error).not.toBeNull();
    expect((await attention.from("cash_movements").update({ description: "Mutación no permitida M9" }).eq("id", historicalMovementId)).error).not.toBeNull();
    expect((await attention.from("cash_movements").delete().eq("id", historicalMovementId)).error).not.toBeNull();
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
        amount: 2,
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
    const attention = clients.get(identities[0]!.id) ?? (await signedClient(identities[0]!));
    const rejectedExpense = await invokeRpc<CashMovementResult[]>(attention, "create_cash_movement", {
      p_direction: "expense",
      p_amount: "1.00",
      p_description: "Categoría inactiva M9",
      p_expense_category_id: category.id,
      p_idempotency_key: `m9-inactive-category-${randomUUID()}`,
    });
    expect(rejectedExpense.error).not.toBeNull();
    expect((await service.from("cash_expense_categories").delete().eq("id", category.id)).error).not.toBeNull();
    expect((await service.from("cash_movements").select("expense_category_id").eq("id", movement.id)).data).toEqual([
      { expense_category_id: category.id },
    ]);
  });
});
