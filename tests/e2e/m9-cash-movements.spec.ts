import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = `M9Nav${randomUUID().replaceAll("-", "")}7`;

type Role = Database["public"]["Enums"]["app_role"];
type Identity = { email: string; id: string; role: Role };

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
    expect(() => assertLocalSupabaseUrl("http://localhost:54321")).not.toThrow();
    expect(() => assertLocalSupabaseUrl("http://127.0.0.1:54321")).not.toThrow();
  });

  test("rechaza hosts parecidos, remotos y URLs inválidas sin crear un cliente", () => {
    for (const candidate of ["http://localhost.evil:54321", "https://example.com", "file://localhost/etc", "not a URL"]) {
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

  test.beforeAll(async () => {
    service = createClient<Database>(url!, serviceRoleKey!, { auth: { persistSession: false } });
    await createIdentity("attention");
    await createIdentity("employee");
  });

  test.afterAll(async () => {
    if (!service) return;
    const failures: string[] = [];
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
      ["#cash-opening-amount", "1.", "Guardar apertura", "Usá un importe con hasta dos decimales."],
      ["#cash-income-amount", "0", "Registrar ingreso", "El importe debe ser mayor que cero."],
      ["#cash-expense-amount", "1.234", "Registrar egreso", "Usá un importe con hasta dos decimales."],
    ] as const;
    for (const [selector, value, submitLabel, message] of invalidCases) {
      const input = page.locator(selector);
      await input.fill(value);
      await expect.poll(() => input.evaluate((element) => (element as HTMLInputElement).validationMessage)).toBe(message);
      await page.getByRole("button", { name: submitLabel, exact: true }).click();
      await expect.poll(() => actionRequests).toBe(0);
    }

    expect(await cashSnapshot()).toEqual(before);
  });
});
