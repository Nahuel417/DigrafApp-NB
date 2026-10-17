import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("Incident E2E requires local Supabase.");
const password = `Incident${randomUUID()}7`;
type Identity = { id: string; email: string };

test.describe("Order incidents", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!url || !serviceKey, "Local Supabase credentials are required.");
  const service = createClient<Database>(url ?? "http://127.0.0.1:54396", serviceKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const orders: string[] = [];
  let admin: Identity;
  let employee: Identity;
  let adminOrder: string;
  let employeeOrder: string;

  async function identity(role: "admin" | "employee") {
    const email = `incidents-${role}-${randomUUID()}@example.test`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("Synthetic identity was not created.");
    const result = { email, id: data.user.id };
    identities.push(result);
    const profile = await service.from("profiles").insert({ id: result.id, role, display_name: "Synthetic incidents E2E", is_active: true, must_change_password: false });
    if (profile.error) throw profile.error;
    return result;
  }
  async function order(actor: Identity) {
    const { data: stage, error: stageError } = await service.from("workflow_stages").select("id").eq("code", "received").single();
    if (stageError || !stage) throw stageError ?? new Error("Received stage is unavailable.");
    const { data, error } = await service.from("orders").insert({
      client_name: `Synthetic incidents ${randomUUID()}`, team_name: "Synthetic team", phone: "000", quantity: 1, order_type: "individual",
      order_date: "2026-10-17", promised_delivery_date: "2026-10-18", current_stage_id: stage.id, created_by: actor.id,
      idempotency_key: randomUUID(), idempotency_fingerprint: randomUUID().replaceAll("-", ""),
    }).select("id").single();
    if (error || !data) throw error ?? new Error("Synthetic order was not created.");
    orders.push(data.id);
    return data.id;
  }
  async function login(page: Page, actor: Identity, orderId: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(actor.email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByRole("heading", { name: "Incidencias", exact: true })).toBeVisible();
  }
  function section(page: Page) { return page.getByRole("region", { name: "Incidencias", exact: true }); }
  async function noOverflow(page: Page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }

  test.beforeAll(async () => {
    admin = await identity("admin");
    employee = await identity("employee");
    adminOrder = await order(admin);
    employeeOrder = await order(admin);
  });
  test.afterAll(async () => {
    // Delete only this run's unique synthetic fixtures, including their retained audit rows.
    const orderIds = orders.map((id) => `'${id}'`).join(",");
    const actorIds = identities.map((actor) => `'${actor.id}'`).join(",");
    const sql = `begin;
      ${orders.length ? `delete from public.order_incident_events where incident_id in (select id from public.order_incidents where order_id in (${orderIds}));
      delete from public.order_incidents where order_id in (${orderIds}); delete from public.orders where id in (${orderIds});` : ""}
      ${identities.length ? `delete from public.profiles where id in (${actorIds}); delete from auth.users where id in (${actorIds});` : ""}
      commit;`;
    execFileSync("docker", ["exec", "-i", "supabase_db_DigrafApp-NB", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input: sql, encoding: "utf8", timeout: 15000 });
  });

  test("registers and corrects with confirmation, persisted history and unchanged order", async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const before = await service.from("orders").select("*").eq("id", adminOrder).single();
    expect(before.error).toBeNull();
    await login(page, admin, adminOrder);
    const panel = section(page);
    await expect(panel.getByText("Sin incidencias registradas", { exact: true })).toBeVisible();
    const subtitle = await panel.getByText("Fallas internas y reclamos del cliente", { exact: true }).boundingBox();
    const register = await panel.getByText("Registrar incidencia", { exact: true }).boundingBox();
    expect(subtitle).not.toBeNull();
    expect(register).not.toBeNull();
    expect(register!.x >= subtitle!.x + subtitle!.width || register!.y >= subtitle!.y + subtitle!.height).toBe(true);
    expect(await panel.evaluate((element) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Color verification requires a canvas context.");
      context.fillStyle = getComputedStyle(element).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    })).toEqual([255, 255, 255, 255]);
    expect(await panel.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Outfit");
    await panel.screenshot({ path: info.outputPath("incidents-empty.png") });
    await panel.getByText("Registrar incidencia", { exact: true }).click();
    const creation = panel.locator("details").filter({ has: page.locator("summary", { hasText: /^Registrar incidencia$/ }) });
    await creation.getByRole("button", { name: "Cerrar formulario de incidencia" }).click();
    await expect(creation.locator("form")).toBeHidden();
    await expect(creation.locator("summary")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(creation.locator("form")).toBeVisible();
    const motion = await creation.locator("form").evaluate((element) => ({
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      animation: getComputedStyle(element).animationName,
    }));
    expect(motion.animation === "none").toBe(motion.reduced);
    await creation.getByText("Reclamo con devolución", { exact: true }).click();
    await expect(creation.getByRole("radio", { name: "Reclamo con devolución", exact: true })).toBeChecked();
    await creation.getByRole("checkbox", { name: "Falla de costura" }).check();
    await creation.getByRole("checkbox", { name: "Diseño", exact: true }).check();
    await expect(creation.getByText("2 motivos seleccionados", { exact: true })).toBeVisible();
    await panel.screenshot({ path: info.outputPath("incidents-form.png") });
    await creation.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(creation.locator("form")).toBeHidden();
    await page.keyboard.press("Enter");
    await expect(creation.getByRole("checkbox", { name: "Diseño", exact: true })).toBeChecked();
    await noOverflow(page);
    await creation.getByRole("button", { name: "Guardar incidencia" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar", exact: true }).click();
    expect((await service.from("order_incidents").select("id").eq("order_id", adminOrder)).data).toHaveLength(0);
    await creation.getByRole("button", { name: "Guardar incidencia" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(panel.getByRole("heading", { name: "Reclamo con devolución", exact: true })).toBeVisible();
    await creation.locator("summary").click();
    const correction = panel.locator("details").filter({ has: page.locator("summary", { hasText: /^Corregir incidencia$/ }) });
    await correction.locator("summary").click();
    await correction.getByText("Reclamo sin devolución", { exact: true }).click();
    await expect(correction.getByRole("radio", { name: "Reclamo sin devolución", exact: true })).toBeChecked();
    await correction.getByRole("checkbox", { name: "Falla de costura" }).uncheck();
    await correction.getByRole("checkbox", { name: "Diseño", exact: true }).uncheck();
    await correction.getByRole("checkbox", { name: "Pedido incompleto" }).check();
    await correction.getByRole("button", { name: "Guardar corrección" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(panel.getByRole("heading", { name: "Reclamo sin devolución", exact: true })).toBeVisible();
    await page.reload();
    await panel.getByText("Historial de correcciones", { exact: true }).click();
    const history = panel.getByRole("list", { name: "Historial de correcciones" });
    await expect(history).toContainText("Registro inicial: Reclamo con devolución");
    await expect(history).toContainText("Corrección 1: Reclamo sin devolución");
    await expect(panel).not.toContainText("Synthetic incidents E2E");
    expect(await panel.locator("time").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("JetBrains");
    await noOverflow(page);
    await panel.screenshot({ path: info.outputPath("incidents-history.png") });
    const after = await service.from("orders").select("*").eq("id", adminOrder).single();
    expect(after.data).toEqual(before.data);
    const stored = await service.from("order_incidents").select("version, kind, reasons").eq("order_id", adminOrder).single();
    expect(stored.data).toMatchObject({ version: 2, kind: "complaint_without_return", reasons: ["incomplete"] });
    expect(errors).toEqual([]);
  });

  test("employee can register internal incidents but cannot select complaints or corrections", async ({ page }, info) => {
    await login(page, employee, employeeOrder);
    const panel = section(page);
    await panel.getByText("Registrar incidencia", { exact: true }).click();
    await expect(panel.getByRole("radio")).toHaveCount(1);
    await expect(panel.getByRole("radio", { name: "Interna", exact: true })).toBeChecked();
    await expect(panel.getByText("Corregir incidencia", { exact: true })).toHaveCount(0);
    await panel.getByRole("checkbox", { name: "Problema en calandrado" }).check();
    await panel.getByRole("button", { name: "Guardar incidencia" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(panel.getByRole("heading", { name: "Interna", exact: true })).toBeVisible();
    await expect(panel.getByText("Corregir incidencia", { exact: true })).toHaveCount(0);
    await noOverflow(page);
    await panel.screenshot({ path: info.outputPath("incidents-employee.png") });
  });

  test("detail button icons provide feedback without changing actions or disclosure rotation", async ({ page, isMobile }) => {
    await login(page, admin, adminOrder);
    const detail = page.getByRole("heading", { name: "Incidencias", exact: true }).locator("xpath=ancestor::main[1]");
    const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    await page.keyboard.press("Tab");
    const controls = detail.locator("button:has(svg), a[href]:has(svg), summary:has(svg)");
    let checked = 0;
    for (const control of await controls.all()) {
      if (!await control.isVisible() || !await control.isEnabled()) continue;
      const icon = control.locator("svg:not(.animate-spin):not(.lucide-chevron-down):not(.lucide-chevron-up)").first();
      if (!await icon.count()) continue;
      await page.mouse.move(0, 0);
      await control.evaluate((element) => (element as HTMLElement).blur());
      const baseline = await icon.evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.translate, style.rotate, style.scale].join("|");
      });
      await control.focus();
      if (reduced) await expect.poll(() => icon.evaluate((element) => getComputedStyle(element).scale)).toBe("none");
      else await expect.poll(() => icon.evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.translate, style.rotate, style.scale].join("|");
      })).not.toBe(baseline);
      if (!isMobile && !reduced) {
        await control.hover();
        await expect.poll(() => icon.evaluate((element) => getComputedStyle(element).getPropertyValue("--icon-feedback").trim())).toBe("1");
      }
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(6);
    const registration = section(page).locator("summary").filter({ hasText: /^Registrar incidencia$/ });
    const chevron = registration.locator("svg.lucide-chevron-down");
    const closedRotation = await chevron.evaluate((element) => getComputedStyle(element).rotate);
    await registration.click();
    await expect.poll(() => chevron.evaluate((element) => getComputedStyle(element).rotate)).not.toBe(closedRotation);
    await section(page).getByRole("button", { name: "Cerrar formulario de incidencia" }).click();
    await expect(registration).toBeFocused();
    await detail.getByRole("button", { name: "Anular pedido", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    const confirmation = dialog.locator("button:has(svg)").last();
    await page.keyboard.press("Tab");
    await confirmation.focus();
    await expect.poll(() => confirmation.locator("svg").first().evaluate((element) => getComputedStyle(element).getPropertyValue("--icon-feedback").trim())).toBe(reduced ? "" : "1");
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(detail.getByRole("tab", { name: "Detalles", exact: true })).toHaveAttribute("aria-selected", "true");
    await noOverflow(page);
  });
});
