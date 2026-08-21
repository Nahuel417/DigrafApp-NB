import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const localUrl = url ?? "http://127.0.0.1:54396";
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
  current_balance: string;
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
type CashCorrectionResult = CashMovementResult & { event_id: string };
type CashVoidResult = { event_id: string; movement_id: string; voided: boolean };
type CashClosureResult = { cash_day_id: string; closed_at: string; closed_by: string | null; closure_kind: string; closing_balance: string };
type CashReopenResult = { cash_day_id: string; event_id: string; sequence_no: number; reopened_at: string; reopened_by: string; reason: string };

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

function moneyCents(value: string | number) {
  const normalized = String(value);
  const negative = normalized.startsWith("-");
  const [integer, fraction = ""] = (negative ? normalized.slice(1) : normalized).split(".");
  const cents = BigInt(integer) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

function centsText(value: bigint) {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / BigInt(100)}.${(absolute % BigInt(100)).toString().padStart(2, "0")}`;
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
  let initialCurrentBalance = "0.00";
  let initialMovementIds: string[] = [];
  let customCategoryId = "";
  let referenceMovementId = "";
  let currentMovementId = "";
  let historicalMovementId = "";
  let currentOpeningEventId = "";
  let historicalOpeningEventId = "";
  let historicalCashDayId = "";
  let historicalCashDayWasPreExisting = false;
  const extraCashDayIds: string[] = [];
  const ownedMovementIds = new Set<string>();
  const ownedOpeningEventIds = new Set<string>();
  const rpcOpeningEventIds: string[] = [];
  const rpcMovementIds: string[] = [];
  const lifecycleEventIds: string[] = [];

  async function createIdentity(
    role: Identity["role"],
    options?: { active?: boolean; mustChangePassword?: boolean },
  ) {
    const email = `${role}-m9-${randomUUID()}@digraf.local`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No se pudo crear una identidad sintética M9.");

    const identity = { email, id: data.user.id, role };
    identities.push(identity);
    const { error: profileError } = await service.from("profiles").insert({
      id: data.user.id,
      display_name: `M9 ${role}`,
      role,
      is_active: options?.active ?? true,
      must_change_password: options?.mustChangePassword ?? false,
    });
    if (profileError) throw profileError;

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

  async function ensureCurrentDayClosed() {
    const current = await service.from("cash_days").select("id, closed_at").eq("operational_date", operationalDate).single();
    if (current.error || !current.data) throw current.error ?? new Error("No se encontró la caja actual para reapertura.");
    cashDayId = current.data.id;
    if (current.data.closed_at) return;
    const manager = clients.get(identities[5]!.id) ?? (await signedClient(identities[5]!));
    const closed = await invokeRpc<CashClosureResult[]>(manager, "close_cash_day", { p_cash_day_id: cashDayId, p_idempotency_key: `m10-setup-close-${randomUUID()}` });
    if (closed.error) throw new Error(`No se pudo preparar el cierre M10: ${closed.error.message}`);
  }

  beforeAll(async () => {
    const existing = await service
      .from("cash_days")
      .select("id, opening_balance, opening_updated_at")
      .eq("operational_date", operationalDate)
      .maybeSingle();
    if (existing.error) throw existing.error;
    preExistingCashDay = Boolean(existing.data);
    cashDayId = existing.data?.id ?? "";
    initialOpeningBalance = existing.data?.opening_balance ?? 0;
    initialOpeningUpdatedAt = existing.data?.opening_updated_at ?? "";

    await createIdentity("attention");
    await createIdentity("employee");
    await createIdentity("attention", { active: false });
    await createIdentity("attention", { mustChangePassword: true });
    await createIdentity("super_admin");
    await createIdentity("admin");
    const baseline = await invokeRpc<CashSummary[]>(await signedClient(identities[0]!), "get_current_cash_summary", {});
    if (baseline.error || !baseline.data?.[0]) throw baseline.error ?? new Error("No se pudo capturar la línea base de caja M9.");
    initialCurrentBalance = baseline.data[0].current_balance;
    initialMovementIds = baseline.data[0].movements.map((movement) => movement.id);
  });

  afterAll(async () => {
    const failures: string[] = [];
    async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await operation;
      if (error) failures.push(`${label}: ${error.message}`);
    }

    const cleanupMovementIds = [...new Set([...ownedMovementIds, ...rpcMovementIds, referenceMovementId, currentMovementId, historicalMovementId].filter(Boolean))];
    if (cleanupMovementIds.length) {
      await cleanup("cash_movement_events", service.from("cash_movement_events").delete().in("movement_id", cleanupMovementIds));
    }
    for (const movementId of cleanupMovementIds) {
      await cleanup("cash_movements", service.from("cash_movements").delete().eq("id", movementId));
    }
    for (const eventId of new Set([...ownedOpeningEventIds, ...rpcOpeningEventIds, currentOpeningEventId, historicalOpeningEventId].filter(Boolean))) {
      await cleanup("cash_opening_events", service.from("cash_opening_events").delete().eq("id", eventId));
    }
    for (const dayId of new Set([cashDayId, historicalCashDayId, ...extraCashDayIds].filter(Boolean))) {
      await cleanup("cash_day_lifecycle_events", service.from("cash_day_lifecycle_events").delete().eq("cash_day_id", dayId));
    }
    if (customCategoryId) {
      await cleanup("cash_expense_categories", service.from("cash_expense_categories").delete().eq("id", customCategoryId));
    }
    if (historicalCashDayId && !historicalCashDayWasPreExisting) {
      await cleanup("cash_days", service.from("cash_days").delete().eq("id", historicalCashDayId));
    }
    for (const dayId of extraCashDayIds) await cleanup("extra cash_days", service.from("cash_days").delete().eq("id", dayId));
    if (cashDayId && !preExistingCashDay) {
      await cleanup("cash_days", service.from("cash_days").delete().eq("id", cashDayId));
    } else if (cashDayId && preExistingCashDay) {
      await cleanup(
        "cash_days restore",
        service
          .from("cash_days")
          .update({ opening_balance: initialOpeningBalance, opening_updated_at: initialOpeningUpdatedAt, closed_at: null, closed_by: null, closure_kind: null, closing_balance: null, closure_idempotency_key: null, closure_idempotency_fingerprint: null })
          .eq("id", cashDayId),
      );
    }
    for (const identity of identities) {
      await cleanup(`profile ${identity.id}`, service.from("profiles").delete().eq("id", identity.id));
      const { error } = await service.auth.admin.deleteUser(identity.id);
      if (error && !error.message.toLowerCase().includes("not found")) failures.push(`auth user ${identity.id}: ${error.message}`);
    }
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
      current_balance: centsText(moneyCents(initialOpeningBalance) + moneyCents(initialCurrentBalance) - moneyCents(initialOpeningBalance)),
    });
    expect(result.data?.[0]?.movements.map((movement) => movement.id)).toEqual(expect.arrayContaining(initialMovementIds));
    expect(result.data?.[0]?.categories).toHaveLength(5);
    expect(cashDayId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("conserva el saldo exacto al superar numeric(14,2) en ambos signos", async () => {
    const attention = clients.get(identities[0]!.id) ?? (await signedClient(identities[0]!));
    const initial = await invokeRpc<CashSummary[]>(attention, "get_current_cash_summary", {});
    expect(initial.error).toBeNull();
    const initialSummary = initial.data?.[0];
    if (!initialSummary) throw new Error("No se obtuvo la apertura inicial M9.");
    cashDayId ||= initialSummary.cash_day_id;
    const { data: category, error: categoryError } = await service
      .from("cash_expense_categories")
      .select("id")
      .eq("code", "materials_supplies")
      .single();
    if (categoryError || !category) throw categoryError ?? new Error("No se encontró la categoría semilla M9.");

    const maxAmount = "999999999999.99";
    const overflowOpeningEventIds: string[] = [];
    const overflowMovementIds: string[] = [];
    try {
      const opening = await invokeRpc<CashOpeningResult[]>(attention, "set_cash_opening", {
        p_amount: maxAmount,
        p_expected_opening_updated_at: initialSummary.opening_updated_at,
        p_idempotency_key: `m9-overflow-opening-${randomUUID()}`,
      });
      expect(opening.error).toBeNull();
      const opened = opening.data?.[0];
      if (!opened) throw new Error("No se obtuvo la apertura de precisión M9.");
      overflowOpeningEventIds.push(opened.event_id);
      ownedOpeningEventIds.add(opened.event_id);
      rpcOpeningEventIds.push(opened.event_id);

      const income = await invokeRpc<CashMovementResult[]>(attention, "create_cash_movement", {
        p_direction: "income",
        p_amount: "0.02",
        p_description: "Ingreso de precisión M9",
        p_expense_category_id: null,
        p_idempotency_key: `m9-overflow-income-${randomUUID()}`,
      });
      expect(income.error).toBeNull();
      const incomeMovement = income.data?.[0];
      if (!incomeMovement) throw new Error("No se obtuvo el ingreso de precisión M9.");
      overflowMovementIds.push(incomeMovement.movement_id);
      ownedMovementIds.add(incomeMovement.movement_id);
      rpcMovementIds.push(incomeMovement.movement_id);

      const positive = await invokeRpc<CashSummary[]>(attention, "get_current_cash_summary", {});
      expect(positive.error).toBeNull();
      expect(positive.data?.[0]?.current_balance).toBe(centsText(moneyCents(maxAmount) + moneyCents(initialCurrentBalance) - moneyCents(initialOpeningBalance) + BigInt(2)));

      const { error: removeIncomeError } = await service.from("cash_movements").delete().eq("id", incomeMovement.movement_id);
      expect(removeIncomeError).toBeNull();
      const zeroOpening = await invokeRpc<CashOpeningResult[]>(attention, "set_cash_opening", {
        p_amount: "0.00",
        p_expected_opening_updated_at: opened.opening_updated_at,
        p_idempotency_key: `m9-overflow-zero-${randomUUID()}`,
      });
      expect(zeroOpening.error).toBeNull();
      const zero = zeroOpening.data?.[0];
      if (!zero) throw new Error("No se obtuvo la apertura cero de precisión M9.");
      overflowOpeningEventIds.push(zero.event_id);
      ownedOpeningEventIds.add(zero.event_id);
      rpcOpeningEventIds.push(zero.event_id);

      for (const amount of [maxAmount, "0.02"]) {
        const expense = await invokeRpc<CashMovementResult[]>(attention, "create_cash_movement", {
          p_direction: "expense",
          p_amount: amount,
          p_description: "Egreso de precisión M9",
          p_expense_category_id: category.id,
          p_idempotency_key: `m9-overflow-expense-${amount}-${randomUUID()}`,
        });
        expect(expense.error).toBeNull();
        const movement = expense.data?.[0];
        if (!movement) throw new Error("No se obtuvo el egreso de precisión M9.");
        overflowMovementIds.push(movement.movement_id);
        ownedMovementIds.add(movement.movement_id);
        rpcMovementIds.push(movement.movement_id);
      }

      const negative = await invokeRpc<CashSummary[]>(attention, "get_current_cash_summary", {});
      expect(negative.error).toBeNull();
      expect(negative.data?.[0]?.current_balance).toBe(centsText(-moneyCents(maxAmount) + moneyCents(initialCurrentBalance) - moneyCents(initialOpeningBalance) - BigInt(2)));
    } finally {
      for (const movementId of overflowMovementIds) await service.from("cash_movements").delete().eq("id", movementId);
      for (const eventId of overflowOpeningEventIds) await service.from("cash_opening_events").delete().eq("id", eventId);
      const openingUpdate = preExistingCashDay
        ? { opening_balance: initialOpeningBalance, opening_updated_at: initialOpeningUpdatedAt }
        : { opening_balance: initialOpeningBalance };
      await service.from("cash_days").update(openingUpdate).eq("id", cashDayId);
    }
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

    const existingHistorical = await service
      .from("cash_days")
      .select("id")
      .eq("operational_date", historicalDate)
      .maybeSingle();
    if (existingHistorical.error) throw existingHistorical.error;
    if (existingHistorical.data) {
      historicalCashDayId = existingHistorical.data.id;
      historicalCashDayWasPreExisting = true;
    } else {
      const { data: historicalDay, error: historicalDayError } = await service
        .from("cash_days")
        .insert({ operational_date: historicalDate, opening_balance: 10 })
        .select("id")
        .single();
      if (historicalDayError || !historicalDay) throw historicalDayError ?? new Error("No se pudo crear la caja histórica M9.");
      historicalCashDayId = historicalDay.id;
    }

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
    ownedOpeningEventIds.add(currentOpeningEventId);
    ownedOpeningEventIds.add(historicalOpeningEventId);

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
    ownedMovementIds.add(currentMovementId);
    ownedMovementIds.add(historicalMovementId);

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
    ownedOpeningEventIds.add(opening.event_id);
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
      ownedOpeningEventIds.add(authorizedOpening.event_id);
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
    ownedMovementIds.add(incomeMovement.movement_id);

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
    ownedMovementIds.add(expenseMovement.movement_id);
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
      current_balance: centsText(BigInt(11525) + moneyCents(initialCurrentBalance) - moneyCents(initialOpeningBalance)),
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
    ownedMovementIds.add(referenceMovementId);

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

  it("cierra el día anterior por rollover y no arrastra su saldo", async () => {
    const attention = clients.get(identities[0]!.id) ?? (await signedClient(identities[0]!));
    const before = await invokeRpc<CashSummary[]>(attention, "get_current_cash_summary", {});
    expect(before.error).toBeNull();
    const prior = await service.from("cash_days").insert({ operational_date: operationalDateOffset(-2), opening_balance: 123 }).select("id").single();
    expect(prior.error).toBeNull();
    if (!prior.data) throw new Error("No se creó el día previo de rollover.");
    extraCashDayIds.push(prior.data.id);
    const priorMovement = await service.from("cash_movements").insert({ cash_day_id: prior.data.id, direction: "income", amount: 10, description: "Ingreso rollover M10", actor_id: identities[0]!.id, idempotency_key: randomUUID(), idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32) }).select("id").single();
    expect(priorMovement.error).toBeNull();
    if (!priorMovement.data) throw new Error("No se creó el movimiento previo de rollover.");
    ownedMovementIds.add(priorMovement.data.id);
    const current = await invokeRpc<CashSummary[]>(attention, "get_current_cash_summary", {});
    expect(current.error).toBeNull();
    expect(current.data?.[0]?.opening_balance).toBe(before.data?.[0]?.opening_balance);
    const closed = await service.from("cash_days").select("closed_at, closure_kind, closing_balance").eq("id", prior.data.id).single();
    expect(closed.error).toBeNull();
    expect(closed.data).toMatchObject({ closure_kind: "rollover", closing_balance: 133 });
  });

  it("corrige, anula y cierra una caja con reintentos y denegaciones", async () => {
    const attention = clients.get(identities[0]!.id) ?? (await signedClient(identities[0]!));
    const movement = await invokeRpc<CashMovementResult[]>(attention, "create_cash_movement", {
      p_direction: "income", p_amount: "20.00", p_description: "Movimiento M10", p_expense_category_id: null,
      p_idempotency_key: `m10-create-${randomUUID()}`,
    });
    expect(movement.error).toBeNull();
    const original = movement.data?.[0];
    if (!original) throw new Error("No se obtuvo el movimiento M10.");
    rpcMovementIds.push(original.movement_id);
    ownedMovementIds.add(original.movement_id);

    const nanCorrection = await invokeRpc<CashCorrectionResult[]>(attention, "correct_cash_movement", {
      p_movement_id: original.movement_id, p_direction: "income", p_amount: "NaN", p_description: "Corrección NaN", p_expense_category_id: null,
      p_idempotency_key: `m10-nan-correction-${randomUUID()}`,
    });
    expect(nanCorrection.error).not.toBeNull();

    const correctionArgs = {
      p_movement_id: original.movement_id, p_direction: "income", p_amount: "25.50", p_description: "Movimiento corregido",
      p_expense_category_id: null, p_idempotency_key: `m10-correct-${randomUUID()}`,
    };
    const corrected = await invokeRpc<CashCorrectionResult[]>(attention, "correct_cash_movement", correctionArgs);
    expect(corrected.error).toBeNull();
    expect(corrected.data?.[0]).toMatchObject({ movement_id: original.movement_id, amount: 25.5, event_id: expect.any(String) });
    const correctionReplay = await invokeRpc<CashCorrectionResult[]>(attention, "correct_cash_movement", correctionArgs);
    expect(correctionReplay.error).toBeNull();
    expect(correctionReplay.data?.[0]).toEqual(corrected.data?.[0]);
    expect((await invokeRpc<CashCorrectionResult[]>(attention, "correct_cash_movement", { ...correctionArgs, p_amount: "26.50" })).error).not.toBeNull();

    const { data: category, error: categoryError } = await service.from("cash_expense_categories").select("id").eq("code", "materials_supplies").single();
    expect(categoryError).toBeNull();
    if (!category) throw new Error("No se encontró la categoría M10.");
    const expense = await invokeRpc<CashMovementResult[]>(attention, "create_cash_movement", { p_direction: "expense", p_amount: "8.00", p_description: "Detalle para limpiar", p_expense_category_id: category.id, p_idempotency_key: `m10-nullable-${randomUUID()}` });
    expect(expense.error).toBeNull();
    const expenseTarget = expense.data?.[0];
    if (!expenseTarget) throw new Error("No se obtuvo el egreso nullable M10.");
    rpcMovementIds.push(expenseTarget.movement_id);
    ownedMovementIds.add(expenseTarget.movement_id);
    const clearedDescription = await invokeRpc<CashCorrectionResult[]>(attention, "correct_cash_movement", { p_movement_id: expenseTarget.movement_id, p_direction: "expense", p_amount: "8.00", p_description: null, p_expense_category_id: category.id, p_idempotency_key: `m10-clear-description-${randomUUID()}` });
    expect(clearedDescription.error).toBeNull();
    expect(clearedDescription.data?.[0]).toMatchObject({ description: null, expense_category_id: category.id });
    const clearedCategory = await invokeRpc<CashCorrectionResult[]>(attention, "correct_cash_movement", { p_movement_id: expenseTarget.movement_id, p_direction: "income", p_amount: "8.00", p_description: "Ingreso sin categoría", p_expense_category_id: null, p_idempotency_key: `m10-clear-category-${randomUUID()}` });
    expect(clearedCategory.error).toBeNull();
    expect(clearedCategory.data?.[0]).toMatchObject({ description: "Ingreso sin categoría", expense_category_id: null, expense_category_code: null, expense_category_name: null });

    const voidArgs = { p_movement_id: original.movement_id, p_reason: "Carga duplicada", p_idempotency_key: `m10-void-${randomUUID()}` };
    const voided = await invokeRpc<CashVoidResult[]>(attention, "void_cash_movement", voidArgs);
    expect(voided.error).toBeNull();
    expect(voided.data?.[0]).toMatchObject({ movement_id: original.movement_id, voided: true, event_id: expect.any(String) });
    expect((await invokeRpc<CashVoidResult[]>(attention, "void_cash_movement", voidArgs)).data?.[0]).toEqual(voided.data?.[0]);
    const retained = await service.from("cash_movements").select("id").eq("id", original.movement_id).single();
    const audit = await service.from("cash_movement_events").select("event_type, previous_state, new_state, reason, actor_id").eq("id", voided.data![0]!.event_id).single();
    expect(retained.data).toEqual({ id: original.movement_id });
    expect(audit.data).toMatchObject({ event_type: "void", new_state: null, reason: "Carga duplicada", actor_id: identities[0]!.id });
    expect((await attention.from("cash_movement_events").delete().eq("id", voided.data![0]!.event_id)).error).not.toBeNull();
    expect((await invokeRpc<CashVoidResult[]>(attention, "void_cash_movement", { ...voidArgs, p_reason: "", p_idempotency_key: `m10-attention-no-reason-${randomUUID()}` })).error).not.toBeNull();

    const employee = await signedClient(identities[1]!);
    expect((await invokeRpc<CashVoidResult[]>(employee, "void_cash_movement", { ...voidArgs, p_idempotency_key: `m10-employee-${randomUUID()}` })).error).not.toBeNull();
    const manager = clients.get(identities[5]!.id) ?? (await signedClient(identities[5]!));
    const raceMovement = await invokeRpc<CashMovementResult[]>(attention, "create_cash_movement", {
      p_direction: "income", p_amount: "3.00", p_description: "Movimiento concurrente M10", p_expense_category_id: null,
      p_idempotency_key: `m10-race-create-${randomUUID()}`,
    });
    expect(raceMovement.error).toBeNull();
    const raceTarget = raceMovement.data?.[0];
    if (!raceTarget) throw new Error("No se obtuvo el movimiento concurrente M10.");
    rpcMovementIds.push(raceTarget.movement_id);
    ownedMovementIds.add(raceTarget.movement_id);
    const voidRaceMovement = await invokeRpc<CashMovementResult[]>(attention, "create_cash_movement", { p_direction: "income", p_amount: "4.00", p_description: "Movimiento void concurrente M10", p_expense_category_id: null, p_idempotency_key: `m10-race-void-create-${randomUUID()}` });
    expect(voidRaceMovement.error).toBeNull();
    const voidRaceTarget = voidRaceMovement.data?.[0];
    if (!voidRaceTarget) throw new Error("No se obtuvo el movimiento void concurrente M10.");
    rpcMovementIds.push(voidRaceTarget.movement_id);
    ownedMovementIds.add(voidRaceTarget.movement_id);
    const closeArgs = { p_cash_day_id: cashDayId, p_idempotency_key: `m10-close-${randomUUID()}` };
    const [closed, raceCorrection, raceVoid] = await Promise.all([
      invokeRpc<CashClosureResult[]>(manager, "close_cash_day", closeArgs),
      invokeRpc<CashCorrectionResult[]>(attention, "correct_cash_movement", {
        p_movement_id: raceTarget.movement_id, p_direction: "income", p_amount: "4.00", p_description: "Corrección concurrente M10",
        p_expense_category_id: null, p_idempotency_key: `m10-race-correct-${randomUUID()}`,
      }),
      invokeRpc<CashVoidResult[]>(attention, "void_cash_movement", { p_movement_id: voidRaceTarget.movement_id, p_reason: "Carrera de cierre", p_idempotency_key: `m10-race-void-${randomUUID()}` }),
    ]);
    expect(closed.error).toBeNull();
    expect(closed.data?.[0]).toMatchObject({ cash_day_id: cashDayId, closure_kind: "manual", closing_balance: expect.any(String) });
    if (!raceCorrection.error) expect(raceCorrection.data?.[0]).toMatchObject({ movement_id: raceTarget.movement_id, event_id: expect.any(String) });
    if (!raceVoid.error) expect(raceVoid.data?.[0]).toMatchObject({ movement_id: voidRaceTarget.movement_id, voided: true, event_id: expect.any(String) });
    const raceEvents = await service.from("cash_movement_events").select("created_at").in("movement_id", [raceTarget.movement_id, voidRaceTarget.movement_id]);
    expect(raceEvents.error).toBeNull();
    expect(raceEvents.data?.every((event) => Date.parse(event.created_at) <= Date.parse(closed.data![0]!.closed_at))).toBe(true);
    expect((await invokeRpc<CashClosureResult[]>(manager, "close_cash_day", closeArgs)).data?.[0]).toEqual(closed.data?.[0]);
    const conflictingDay = await service.from("cash_days").insert({ operational_date: operationalDateOffset(1), opening_balance: 0 }).select("id").single();
    expect(conflictingDay.error).toBeNull();
    if (!conflictingDay.data) throw new Error("No se creó la caja para probar el conflicto de cierre.");
    extraCashDayIds.push(conflictingDay.data.id);
    expect((await invokeRpc<CashClosureResult[]>(manager, "close_cash_day", { ...closeArgs, p_cash_day_id: conflictingDay.data.id })).error).not.toBeNull();
    expect((await invokeRpc<CashClosureResult[]>(manager, "close_cash_day", { ...closeArgs, p_idempotency_key: `m10-close-conflict-${randomUUID()}` })).data?.[0]?.closure_kind).toBe("manual");
    const history = await invokeRpc<Array<{ cash_day_id: string; movements: unknown[]; events: unknown[] }>>(attention, "get_cash_day_summary", { p_cash_day_id: cashDayId });
    expect(history.error).toBeNull();
    expect(history.data?.[0]).toMatchObject({ cash_day_id: cashDayId, events: expect.any(Array) });
    expect(history.data?.[0]?.movements).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: original.movement_id })]));
    const closedDays = await invokeRpc<Array<{ cash_day_id: string }>>(attention, "list_closed_cash_days", {});
    expect(closedDays.error).toBeNull();
    expect(closedDays.data?.map((day) => day.cash_day_id)).toContain(cashDayId);
    expect((await invokeRpc<CashCorrectionResult[]>(attention, "correct_cash_movement", { ...correctionArgs, p_idempotency_key: `m10-closed-${randomUUID()}` })).error).not.toBeNull();
    expect((await attention.from("cash_movements").update({ description: "Mutación cerrada M10" }).eq("id", original.movement_id)).error).not.toBeNull();
    for (const identity of identities.slice(1, 4)) {
      const deniedClient = await signedClient(identity);
      expect((await invokeRpc<unknown[]>(deniedClient, "list_closed_cash_days", {})).error).not.toBeNull();
      expect((await invokeRpc<unknown[]>(deniedClient, "get_cash_day_summary", { p_cash_day_id: cashDayId })).error).not.toBeNull();
    }
  });

  it("reabre el mismo día para Super admin, Admin y Atención con auditoría de ciclo", async () => {
    await ensureCurrentDayClosed();
    const manager = clients.get(identities[5]!.id) ?? (await signedClient(identities[5]!));
    const allowed = [identities[4]!, identities[5]!, identities[0]!];

    for (const [index, identity] of allowed.entries()) {
      const client = await signedClient(identity);
      const key = `m10-reopen-${identity.role}-${randomUUID()}`;
      const result = await invokeRpc<CashReopenResult[]>(client, "reopen_cash_day", {
        p_cash_day_id: cashDayId,
        p_reason: `Corrección ${identity.role}`,
        p_idempotency_key: key,
      });
      expect(result.error).toBeNull();
      const reopened = result.data?.[0];
      if (!reopened) throw new Error(`No se obtuvo reapertura para ${identity.role}.`);
      lifecycleEventIds.push(reopened.event_id);
      expect(reopened).toMatchObject({ cash_day_id: cashDayId, reopened_by: identity.id, reason: `Corrección ${identity.role}` });
      expect(reopened.sequence_no).toBeGreaterThan(0);
      expect(reopened.reopened_at).toMatch(/T/);

      const current = await service.from("cash_days").select("id, closed_at").eq("id", cashDayId).single();
      expect(current.error).toBeNull();
      expect(current.data).toEqual({ id: cashDayId, closed_at: null });

      const closed = await invokeRpc<CashClosureResult[]>(manager, "close_cash_day", { p_cash_day_id: cashDayId, p_idempotency_key: `m10-reclose-${index}-${randomUUID()}` });
      expect(closed.error).toBeNull();
      expect(closed.data?.[0]?.cash_day_id).toBe(cashDayId);
    }
  });

  it("devuelve el cierre manual existente ante una nueva clave sin duplicar el ciclo", async () => {
    await ensureCurrentDayClosed();
    const admin = await signedClient(identities[5]!);
    const before = await service.from("cash_day_lifecycle_events").select("id", { count: "exact", head: true }).eq("cash_day_id", cashDayId).eq("event_type", "close");
    expect(before.error).toBeNull();
    const result = await invokeRpc<CashClosureResult[]>(admin, "close_cash_day", { p_cash_day_id: cashDayId, p_idempotency_key: `m10-close-new-key-${randomUUID()}` });
    expect(result.error).toBeNull();
    expect(result.data?.[0]).toMatchObject({ cash_day_id: cashDayId, closure_kind: "manual" });
    const after = await service.from("cash_day_lifecycle_events").select("id", { count: "exact", head: true }).eq("cash_day_id", cashDayId).eq("event_type", "close");
    expect(after.error).toBeNull();
    expect(after.count).toBe(before.count);
  });

  it("deniega reapertura a perfiles no autorizados, valida motivo y conserva replay/conflicto", async () => {
    await ensureCurrentDayClosed();
    const denied = [identities[1]!, identities[2]!, identities[3]!];
    for (const identity of denied) {
      const result = await invokeRpc<CashReopenResult[]>(await signedClient(identity), "reopen_cash_day", {
        p_cash_day_id: cashDayId,
        p_reason: "Corrección denegada",
        p_idempotency_key: `m10-reopen-denied-${identity.id}`,
      });
      expect(result.error).not.toBeNull();
    }

    const admin = await signedClient(identities[5]!);
    for (const reason of ["", " ", "x", "x".repeat(501)]) {
      const result = await invokeRpc<CashReopenResult[]>(admin, "reopen_cash_day", {
        p_cash_day_id: cashDayId,
        p_reason: reason,
        p_idempotency_key: `m10-reopen-invalid-${randomUUID()}`,
      });
      expect(result.error).not.toBeNull();
    }

    const args = { p_cash_day_id: cashDayId, p_reason: "  Motivo válido  ", p_idempotency_key: `m10-reopen-replay-${randomUUID()}` };
    const first = await invokeRpc<CashReopenResult[]>(admin, "reopen_cash_day", args);
    expect(first.error).toBeNull();
    const reopened = first.data?.[0];
    if (!reopened) throw new Error("No se obtuvo la reapertura para probar replay.");
    lifecycleEventIds.push(reopened.event_id);
    expect(reopened.reason).toBe("Motivo válido");
    const replay = await invokeRpc<CashReopenResult[]>(admin, "reopen_cash_day", args);
    expect(replay.error).toBeNull();
    expect(replay.data?.[0]).toEqual(reopened);
    expect((await invokeRpc<CashReopenResult[]>(admin, "reopen_cash_day", { ...args, p_reason: "Otro motivo" })).error).not.toBeNull();

    const closed = await invokeRpc<CashClosureResult[]>(admin, "close_cash_day", { p_cash_day_id: cashDayId, p_idempotency_key: `m10-reopen-reclose-${randomUUID()}` });
    expect(closed.error).toBeNull();
  });

  it("serializa reaperturas concurrentes, audita actores y permite corregir antes de recerrar", async () => {
    await ensureCurrentDayClosed();
    const admin = await signedClient(identities[5]!);
    const args = { p_cash_day_id: cashDayId, p_reason: "  Ajuste concurrente  ", p_idempotency_key: `m10-reopen-race-${randomUUID()}` };
    const [first, replay] = await Promise.all([
      invokeRpc<CashReopenResult[]>(admin, "reopen_cash_day", args),
      invokeRpc<CashReopenResult[]>(admin, "reopen_cash_day", args),
    ]);
    expect(first.error).toBeNull();
    expect(replay.error).toBeNull();
    const reopened = first.data?.[0];
    if (!reopened) throw new Error("No se obtuvo la reapertura concurrente.");
    lifecycleEventIds.push(reopened.event_id);
    expect(replay.data?.[0]).toEqual(reopened);

    const movement = await invokeRpc<CashMovementResult[]>(admin, "create_cash_movement", {
      p_direction: "income", p_amount: "2.00", p_description: "Corrección posterior a reapertura", p_expense_category_id: null, p_idempotency_key: `m10-reopen-race-movement-${randomUUID()}`,
    });
    expect(movement.error).toBeNull();
    if (!movement.data?.[0]) throw new Error("No se obtuvo el movimiento posterior a reapertura.");
    rpcMovementIds.push(movement.data[0].movement_id);
    ownedMovementIds.add(movement.data[0].movement_id);

    const closed = await invokeRpc<CashClosureResult[]>(admin, "close_cash_day", { p_cash_day_id: cashDayId, p_idempotency_key: `m10-reopen-race-close-${randomUUID()}` });
    expect(closed.error).toBeNull();
    const history = await invokeRpc<Array<{ lifecycle_events: Array<{ id: string; sequence_no: number; event_type: string; actor_id: string | null; actor_display_name: string; reason: string | null; created_at: string }> }>>(admin, "get_cash_day_summary", { p_cash_day_id: cashDayId });
    expect(history.error).toBeNull();
    const audit = history.data?.[0]?.lifecycle_events.find((event) => event.id === reopened.event_id);
    expect(audit).toMatchObject({ event_type: "reopen", actor_id: identities[5]!.id, actor_display_name: "M9 admin", reason: "Ajuste concurrente" });
    expect(audit?.sequence_no).toBe(reopened.sequence_no);
    expect(audit?.created_at).toMatch(/T/);
  });

  it("mantiene el lifecycle append-only y sin DML directo autenticado", async () => {
    const attention = await signedClient(identities[0]!);
    const existing = await service.from("cash_day_lifecycle_events").select("id").eq("cash_day_id", cashDayId).limit(1).maybeSingle();
    expect(existing.error).toBeNull();
    if (!existing.data) throw new Error("No se obtuvo un evento lifecycle para probar inmutabilidad.");
    expect((await attention.from("cash_day_lifecycle_events").update({ reason: "Mutación directa" }).eq("id", existing.data.id)).error).not.toBeNull();
    expect((await attention.from("cash_day_lifecycle_events").delete().eq("id", existing.data.id)).error).not.toBeNull();
    expect((await attention.from("cash_day_lifecycle_events").insert({ cash_day_id: cashDayId, sequence_no: 999999, event_type: "reopen", actor_id: identities[0]!.id, reason: "DML directo", idempotency_key: `m10-direct-${randomUUID()}`, idempotency_fingerprint: "d".repeat(32) })).error).not.toBeNull();
  });

  it("conserva las secciones canónicas cuando desaparece su perfil propietario", async () => {
    const owner = await createIdentity("super_admin");
    const codes = ["garments", "flags", "bags", "shields"];
    const { error: ownershipError } = await service
      .from("catalog_sections")
      .update({ created_by: owner.id, updated_by: owner.id })
      .in("code", codes);
    expect(ownershipError).toBeNull();

    const { error: profileError } = await service.from("profiles").delete().eq("id", owner.id);
    expect(profileError).toBeNull();

    const sections = await service
      .from("catalog_sections")
      .select("code, created_by, updated_by")
      .in("code", codes)
      .order("code");
    expect(sections.error).toBeNull();
    expect(sections.data).toEqual(codes.toSorted().map((code) => ({ code, created_by: null, updated_by: null })));
  });
});
