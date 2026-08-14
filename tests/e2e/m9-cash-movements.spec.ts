import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = `M9Nav${randomUUID().replaceAll("-", "")}7`;

type Role = Database["public"]["Enums"]["app_role"];
type Identity = { email: string; id: string; role: Role };
type CurrentDayFixture = { id: string; closedAt: string | null; closedBy: string | null; closureKind: string | null; closingBalance: number | null; closureKey: string | null; closureFingerprint: string | null; movementIds: string[]; lifecycleIds: string[] };

export function assertLocalSupabaseUrl(value: string | undefined): asserts value is string {
  if (value === undefined) return;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("SUPABASE_URL debe ser una URL local válida.");
  }

  if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("SUPABASE_URL debe apuntar exactamente a localhost o 127.0.0.1.");
  }
}

assertLocalSupabaseUrl(url);

test.describe("Guardia de URL local de Supabase M9", () => {
  test("acepta localhost y 127.0.0.1", () => {
    expect(() => assertLocalSupabaseUrl("http://localhost:54396")).not.toThrow();
    expect(() => assertLocalSupabaseUrl("http://127.0.0.1:54396")).not.toThrow();
  });

  test("rechaza hosts parecidos, remotos y URLs inválidas sin crear un cliente", () => {
    for (const candidate of ["http://localhost.evil:54396", "https://example.com", "file://localhost/etc", "not a URL"]) {
      expect(() => assertLocalSupabaseUrl(candidate)).toThrow();
    }
  });
});

async function login(page: Page, identity: Identity) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(identity.email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

function visibleNavigation(page: Page) {
  return page.locator('nav[aria-label^="Navegación principal"]:visible');
}

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

test.describe("Navegación de Caja M9", () => {
  test.skip(!url || !serviceRoleKey, "Falta Supabase local para E2E M9.");

  let service: SupabaseClient<Database> | null = null;
  const identities: Identity[] = [];
  const historyDayIds: string[] = [];
  let currentDayFixture: CurrentDayFixture | null = null;
  const runId = randomUUID().slice(0, 8);

  function adminClient() {
    if (!service) throw new Error("El cliente administrativo E2E M9 no está inicializado.");
    return service;
  }

  async function cashSnapshot() {
    const admin = adminClient();
    const day = await admin.from("cash_days").select("id, opening_balance, opening_updated_at").eq("operational_date", currentOperationalDate()).maybeSingle();
    if (day.error) throw day.error;
    if (!day.data) return { openingBalance: null, openingUpdatedAt: null, movementIds: [] as string[] };
    const movements = await admin.from("cash_movements").select("id").eq("cash_day_id", day.data.id);
    if (movements.error) throw movements.error;
    return {
      openingBalance: day.data.opening_balance,
      openingUpdatedAt: day.data.opening_updated_at,
      movementIds: (movements.data ?? []).map((movement) => movement.id).sort(),
    };
  }

  async function createIdentity(role: Role) {
    const admin = adminClient();
    const email = `${role}-m9-nav-${runId}@digraf.local`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error(`No se creó la identidad E2E M9 para ${role}.`);

    const identity = { email, id: data.user.id, role };
    identities.push(identity);
    const { error: profileError } = await admin.from("profiles").insert({
      id: identity.id,
      display_name: `M9 Navigation ${role}`,
      role,
      is_active: true,
      must_change_password: false,
    });
    if (profileError) throw profileError;
    return identity;
  }

  async function createClosedHistoryDay() {
    const date = new Date(`${currentOperationalDate()}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 20 - historyDayIds.length);
    const operationalDate = date.toISOString().slice(0, 10);
    const admin = adminClient();
    const created = await admin.from("cash_days").insert({ operational_date: operationalDate, opening_balance: 10 }).select("id").single();
    if (created.error || !created.data) throw created.error ?? new Error("No se creó la caja histórica E2E M10.");
    historyDayIds.push(created.data.id);
    const closedAt = new Date().toISOString();
    const updated = await admin.from("cash_days").update({ closed_at: closedAt, closed_by: identities[2]!.id, closure_kind: "manual", closing_balance: 10, closure_idempotency_key: `m10-e2e-close-${runId}`, closure_idempotency_fingerprint: "e".repeat(32) }).eq("id", created.data.id);
    if (updated.error) throw updated.error;
    return created.data.id;
  }

  async function reopenHistory(page: Page, identity: Identity, cashDayId: string, reason?: string) {
    await login(page, identity);
    await page.goto(`/cash?cashDay=${cashDayId}`);
    await expect(page.getByRole("button", { name: "Reabrir caja", exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Reabrir caja", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Confirmar reapertura" })).toBeVisible();
    if (reason === undefined) {
      await page.getByRole("button", { name: "Confirmar reapertura", exact: true }).click();
      return;
    }
    await page.getByLabel("Motivo").fill(reason);
    const actionResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/cash");
    await page.getByRole("button", { name: "Confirmar reapertura", exact: true }).click();
    await actionResponse;
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }

  async function prepareCurrentClosedDay() {
    const admin = adminClient();
    const day = await admin.from("cash_days").select("id, opening_balance, closed_at, closed_by, closure_kind, closing_balance, closure_idempotency_key, closure_idempotency_fingerprint").eq("operational_date", currentOperationalDate()).single();
    const movements = await admin.from("cash_movements").select("id").eq("cash_day_id", day.data!.id);
    const lifecycle = await admin.from("cash_day_lifecycle_events").select("id").eq("cash_day_id", day.data!.id);
    if (day.error || !day.data || movements.error || lifecycle.error) throw day.error ?? movements.error ?? lifecycle.error ?? new Error("No se preparó la caja actual E2E.");
    currentDayFixture = { id: day.data.id, closedAt: day.data.closed_at, closedBy: day.data.closed_by, closureKind: day.data.closure_kind, closingBalance: day.data.closing_balance, closureKey: day.data.closure_idempotency_key, closureFingerprint: day.data.closure_idempotency_fingerprint, movementIds: movements.data.map((item) => item.id), lifecycleIds: lifecycle.data.map((item) => item.id) };
    const updated = await admin.from("cash_days").update({ closed_at: new Date().toISOString(), closed_by: identities[2]!.id, closure_kind: "manual", closing_balance: day.data.opening_balance, closure_idempotency_key: `m10-e2e-current-${runId}`, closure_idempotency_fingerprint: "c".repeat(32) }).eq("id", day.data.id);
    if (updated.error) throw updated.error;
    return day.data.id;
  }

  test.beforeAll(async () => {
    service = createClient<Database>(url!, serviceRoleKey!, { auth: { persistSession: false } });
    await createIdentity("attention");
    await createIdentity("employee");
    await createIdentity("admin");
  });

  test.afterAll(async () => {
    if (!service) return;
    const failures: string[] = [];
    if (currentDayFixture) {
      const currentMovements = await service.from("cash_movements").select("id").eq("cash_day_id", currentDayFixture.id);
      const movementIds = (currentMovements.data ?? []).map((item) => item.id).filter((id) => !currentDayFixture!.movementIds.includes(id));
      if (movementIds.length) await service.from("cash_movements").delete().in("id", movementIds);
      const currentLifecycle = await service.from("cash_day_lifecycle_events").select("id").eq("cash_day_id", currentDayFixture.id);
      const lifecycleIds = (currentLifecycle.data ?? []).map((item) => item.id).filter((id) => !currentDayFixture!.lifecycleIds.includes(id));
      if (lifecycleIds.length) await service.from("cash_day_lifecycle_events").delete().in("id", lifecycleIds);
      const restored = await service.from("cash_days").update({ closed_at: currentDayFixture.closedAt, closed_by: currentDayFixture.closedBy, closure_kind: currentDayFixture.closureKind, closing_balance: currentDayFixture.closingBalance, closure_idempotency_key: currentDayFixture.closureKey, closure_idempotency_fingerprint: currentDayFixture.closureFingerprint }).eq("id", currentDayFixture.id);
      if (restored.error) failures.push(`current cash restore: ${restored.error.message}`);
    }
    for (const dayId of historyDayIds) {
      const { error } = await service.from("cash_day_lifecycle_events").delete().eq("cash_day_id", dayId);
      if (error) failures.push(`lifecycle ${dayId}: ${error.message}`);
      const { error: dayError } = await service.from("cash_days").delete().eq("id", dayId);
      if (dayError) failures.push(`cash day ${dayId}: ${dayError.message}`);
    }
    for (const identity of identities) {
      const { error: profileError } = await service.from("profiles").delete().eq("id", identity.id);
      if (profileError) failures.push(`profile ${identity.role}: ${profileError.message}`);
      const { error: userError } = await service.auth.admin.deleteUser(identity.id);
      if (userError) failures.push(`user ${identity.role}: ${userError.message}`);
    }
    if (failures.length) throw new Error(`Falló el cleanup E2E M9:\n${failures.join("\n")}`);
  });

  test("Atención descubre Caja después de Pedidos y puede abrirla", async ({ page }) => {
    await login(page, identities[0]!);
    const navigation = visibleNavigation(page);
    await navigation.getByRole("link", { name: "Pedidos", exact: true }).click();
    await expect(page).toHaveURL(/\/orders$/);

    const ordersNavigation = visibleNavigation(page);
    await expect(ordersNavigation.getByRole("link", { name: "Caja", exact: true })).toHaveCount(1);
    await expect(ordersNavigation.getByRole("link")).toHaveText(["Panel", "Pedidos", "Caja", "Nuevo pedido"]);
    await ordersNavigation.getByRole("link", { name: "Caja", exact: true }).click();
    await expect(page).toHaveURL(/\/cash$/);
  });

  test("Empleado no recibe Caja y el acceso directo vuelve al Panel", async ({ page }) => {
    await login(page, identities[1]!);
    const navigation = visibleNavigation(page);
    await expect(navigation.getByRole("link", { name: "Caja", exact: true })).toHaveCount(0);

    await page.goto("/cash");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("bloquea importes inválidos antes de la Server Action y conserva la caja", async ({ page }) => {
    await login(page, identities[0]!);
    await page.goto("/cash");
    await expect(page).toHaveURL(/\/cash$/);
    await expect(page.getByLabel("Saldo inicial")).toBeVisible();

    const before = await cashSnapshot();
    let actionRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/cash") actionRequests += 1;
    });

    const invalidCases = [
      ["#cash-opening-amount", "1.", "1.", "Guardar apertura", "Usá un importe con hasta dos decimales."],
      ["#cash-income-amount", "0", "0", "Registrar ingreso", "El importe debe ser mayor que cero."],
      ["#cash-expense-amount", "1.234", "", "Registrar egreso", "Ingresá un importe."],
    ] as const;
    for (const [selector, value, retainedValue, submitLabel, message] of invalidCases) {
      const input = page.locator(selector);
      await input.fill(value);
      await expect(input).toHaveValue(retainedValue);
      await expect(input).toHaveAttribute("aria-invalid", "true");
      await expect(input).toHaveAttribute("aria-describedby", /amount-error/);
      await expect(page.getByText(message, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: submitLabel, exact: true }).click();
      await expect.poll(() => actionRequests).toBe(0);
    }

    expect(await cashSnapshot()).toEqual(before);
  });

  test("Admin puede iniciar el cierre y Atención no ve esa acción", async ({ page }) => {
    await login(page, identities[2]!);
    await page.goto("/cash");
    await expect(page.getByRole("button", { name: "Cerrar caja", exact: true })).toHaveCount(1);

    await page.context().clearCookies();
    await login(page, identities[0]!);
    await page.goto("/cash");
    await expect(page.getByRole("button", { name: "Cerrar caja", exact: true })).toHaveCount(0);
  });

  test("Admin reabre una caja histórica con motivo y conserva el mismo ID", async ({ page }) => {
    const cashDayId = await createClosedHistoryDay();
    await reopenHistory(page, identities[2]!, cashDayId, "Corrección histórica E2E");
    const reopened = await adminClient().from("cash_days").select("id, closed_at").eq("id", cashDayId).single();
    expect(reopened.error).toBeNull();
    expect(reopened.data).toEqual({ id: cashDayId, closed_at: null });
  });

  test("Atención puede reabrir y el motivo vacío no se confirma", async ({ page }) => {
    const attentionDayId = await createClosedHistoryDay();
    await reopenHistory(page, identities[0]!, attentionDayId, "Corrección de Atención E2E");
    expect((await adminClient().from("cash_days").select("closed_at").eq("id", attentionDayId).single()).data?.closed_at).toBeNull();

    const validationDayId = await createClosedHistoryDay();
    await page.context().clearCookies();
    await reopenHistory(page, identities[2]!, validationDayId);
    const unchanged = await adminClient().from("cash_days").select("closed_at").eq("id", validationDayId).single();
    expect(unchanged.data?.closed_at).toBeTruthy();
  });

  test("reabre, opera y recierra el mismo día visible", async ({ page }) => {
    const cashDayId = await prepareCurrentClosedDay();
    await login(page, identities[2]!);
    await page.goto("/cash");
    await page.locator("#cash-closed-day").click();
    await page.getByRole("option", { name: `${currentOperationalDate()} · manual`, exact: true }).click();
    await page.getByRole("button", { name: "Consultar día", exact: true }).click();
    await expect(page.getByText("Caja cerrada: no admite nuevas modificaciones.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Registrar ingreso" })).toHaveCount(0);
    await page.getByRole("button", { name: "Reabrir caja", exact: true }).click();
    await page.getByLabel("Motivo").fill("Corrección visible E2E");
    let response = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname === "/cash");
    await page.getByRole("button", { name: "Confirmar reapertura", exact: true }).click();
    await response;
    await page.locator("#cash-income-amount").fill("2.00");
    await page.locator("#cash-income-description").fill("Movimiento visible E2E");
    response = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname === "/cash");
    await page.getByRole("button", { name: "Registrar ingreso", exact: true }).click();
    await response;
    await page.getByRole("button", { name: "Cerrar caja", exact: true }).click();
    response = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname === "/cash");
    await page.getByRole("button", { name: "Confirmar cierre", exact: true }).click();
    await response;
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    const sameDay = await adminClient().from("cash_days").select("id, closed_at").eq("id", cashDayId).single();
    expect(sameDay.data?.id).toBe(cashDayId);
    expect(sameDay.data?.closed_at).toBeTruthy();
  });
});
