import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = `Select${randomUUID().replaceAll("-", "")}7`;

test.describe("Select compartido", () => {
  test.skip(!url || !serviceRoleKey, "Falta Supabase local para E2E.");

  let admin: ReturnType<typeof createClient<Database>>;
  let userId = "";
  const email = `select-layout-${randomUUID()}@digraf.local`;

  test.beforeAll(async () => {
    admin = createClient<Database>(url!, serviceRoleKey!, { auth: { persistSession: false } });
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No se pudo crear el usuario E2E del Select.");
    userId = data.user.id;
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      display_name: "Select layout E2E",
      role: "super_admin",
      is_active: true,
      must_change_password: false,
    });
    if (profileError) throw profileError;
  });

  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  test("preserva geometría, foco y cierre por Escape al abrir un Select", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/cash");

    const trigger = page.getByRole("combobox", { name: "Categoría", exact: true });
    await expect(trigger).toBeVisible();
    await trigger.scrollIntoViewIfNeeded();
    const measureLayout = () => page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const main = document.querySelector("main")?.getBoundingClientRect();
      const cashContainer = document.querySelector<HTMLElement>('#cash-expense-category')?.closest("section")?.getBoundingClientRect();
      const listbox = document.querySelector<HTMLElement>('[role="listbox"]')?.getBoundingClientRect();
      const trigger = document.querySelector<HTMLElement>('#cash-expense-category')?.getBoundingClientRect();
      const styles = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        return { margin: style.margin, marginRight: style.marginRight, overflow: style.overflow, overflowX: style.overflowX, overflowY: style.overflowY, paddingRight: style.paddingRight, scrollbarGutter: style.scrollbarGutter, width: style.width };
      };
      const relevantInjectedStyles = [...document.querySelectorAll("style")]
        .map((style) => style.textContent ?? "")
        .filter((text) => text.includes("removed-body-scroll-bar-size") || text.includes("data-scroll-locked"));
      return {
        body: { dataScrollLocked: body.getAttribute("data-scroll-locked"), inline: { cssText: body.style.cssText, marginRight: body.style.marginRight, paddingRight: body.style.paddingRight, width: body.style.width, overflow: body.style.overflow }, rectWidth: body.getBoundingClientRect().width, styles: styles(body), removedBodyScrollBarSize: getComputedStyle(body).getPropertyValue("--removed-body-scroll-bar-size") },
        documentClientWidth: html.clientWidth,
        html: { dataScrollLocked: html.getAttribute("data-scroll-locked"), rectWidth: html.getBoundingClientRect().width, styles: styles(html) },
        injectedStyles: relevantInjectedStyles,
        listbox: listbox && { left: listbox.left, top: listbox.top, width: listbox.width, height: listbox.height },
        cashContainer: cashContainer && { left: cashContainer.left, top: cashContainer.top, width: cashContainer.width, height: cashContainer.height },
        mainLeft: main?.left,
        mainWidth: main?.width,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        trigger: trigger && { left: trigger.left, top: trigger.top, width: trigger.width, height: trigger.height },
        viewportWidth: window.innerWidth,
      };
    });

    const before = await measureLayout();
    await trigger.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    const during = await measureLayout();
    expect({ ...during, body: undefined, html: undefined, injectedStyles: undefined, listbox: undefined }).toEqual({ ...before, body: undefined, html: undefined, injectedStyles: undefined, listbox: undefined });
    expect(during.body.styles.paddingRight).toBe(before.body.styles.paddingRight);
    expect(during.body.styles.margin).toBe(before.body.styles.margin);
    expect(during.html.styles).toEqual(before.html.styles);
    expect(during.body.dataScrollLocked).toBe("1");
    expect(during.body.removedBodyScrollBarSize).toBe("0px");
    expect(during.body.inline.marginRight).toBe("");
    expect(during.body.inline.paddingRight).toBe("");
    expect(during.body.inline.width).toBe("");
    expect(during.injectedStyles.length).toBeGreaterThan(0);
    expect(await page.getByRole("listbox").evaluate((listbox) => !listbox.closest("form"))).toBe(true);
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[role="option"][data-highlighted]')).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    const after = await measureLayout();
    expect({ ...after, body: undefined, html: undefined, injectedStyles: undefined, listbox: undefined }).toEqual({ ...before, body: undefined, html: undefined, injectedStyles: undefined, listbox: undefined });
    expect(after.body.styles).toEqual(before.body.styles);
    expect(after.html.styles).toEqual(before.html.styles);
    expect(after.body.dataScrollLocked).toBeNull();
    expect(after.body.removedBodyScrollBarSize).toBe("");
    expect(after.injectedStyles).toEqual([]);

    await trigger.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    const reopened = await measureLayout();
    expect(reopened.listbox).toEqual(during.listbox);
    await page.keyboard.press("Escape");
  });
});
