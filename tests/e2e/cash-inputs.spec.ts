import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = `CashInput${randomUUID().replaceAll("-", "")}7`;

test.describe("Inputs monetarios de Caja", () => {
  test.skip(!url || !serviceRoleKey, "Falta Supabase local para E2E.");

  let admin: ReturnType<typeof createClient<Database>>;
  let userId = "";
  const email = `cash-input-${randomUUID()}@digraf.local`;

  test.beforeAll(async () => {
    admin = createClient<Database>(url!, serviceRoleKey!, { auth: { persistSession: false } });
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No se pudo crear el usuario E2E de Caja.");
    userId = data.user.id;
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      display_name: "Cash input E2E",
      role: "super_admin",
      is_active: true,
      must_change_password: false,
    });
    if (profileError) throw profileError;
  });

  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  test("bloquea edición inválida, acepta coma/punto y no ejecuta la acción", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "La interacción de pegado se valida una vez en Chromium.");
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/cash");

    const opening = page.locator("#cash-opening-amount");
    await opening.fill("");
    await opening.focus();
    await opening.pressSequentially("abc$");
    await expect(opening).toHaveValue("");
    await opening.pressSequentially("12,34");
    await expect(opening).toHaveValue("12,34");

    const input = page.locator("#cash-income-amount");
    await input.focus();
    await input.pressSequentially("abc$ -");
    await expect(input).toHaveValue("");

    await input.fill("");
    await input.pressSequentially("12,34");
    await expect(input).toHaveValue("12,34");
    await input.fill("");
    await input.pressSequentially("12.34");
    await expect(input).toHaveValue("12.34");

    await input.selectText();
    await input.pressSequentially("5,67");
    await expect(input).toHaveValue("5,67");
    await input.press("End");
    await input.press("Backspace");
    await expect(input).toHaveValue("5,6");

    await input.fill("");
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
    await page.evaluate(() => navigator.clipboard.writeText("12.345"));
    await input.focus();
    await page.keyboard.press("Control+V");
    await expect(input).toHaveValue("");

    await page.evaluate(() => navigator.clipboard.writeText("5,67"));
    await input.focus();
    await page.keyboard.press("Control+V");
    await expect(input).toHaveValue("5,67");

    await input.fill("1.");
    await expect.poll(() => input.evaluate((element) => (element as HTMLInputElement).validationMessage)).toBe("Usá un importe con hasta dos decimales.");
    let actionRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/cash") actionRequests += 1;
    });
    await page.getByRole("button", { name: "Registrar ingreso", exact: true }).click();
    await expect.poll(() => actionRequests).toBe(0);
  });
});
