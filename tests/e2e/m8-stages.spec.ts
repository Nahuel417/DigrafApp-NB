import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = `M8E2E${randomUUID().replaceAll("-", "")}7`;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("Administración de etapas M8", () => {
  test.skip(!url || !serviceRoleKey || !publishableKey, "Falta Supabase local para E2E M8.");
  const admin = createClient<Database>(url ?? "http://127.0.0.1:54396", serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const runId = randomUUID().slice(0, 8);
  const managerEmail = `super-admin-m8-e2e-${randomUUID()}@digraf.local`;
  const attentionEmail = `attention-m8-e2e-${randomUUID()}@digraf.local`;
  const stageName = `Revisión M8 ${runId}`;
  const renamedStageName = `Revisión final M8 ${runId}`;
  const managedStageIds: string[] = [];
  let managerId = "";
  let attentionId = "";

  test.beforeAll(async () => {
    const { data: manager, error: managerError } = await admin.auth.admin.createUser({ email: managerEmail, password, email_confirm: true });
    if (managerError || !manager.user) throw managerError ?? new Error("No se creó el Super admin E2E M8.");
    managerId = manager.user.id;

    const { data: attention, error: attentionError } = await admin.auth.admin.createUser({ email: attentionEmail, password, email_confirm: true });
    if (attentionError || !attention.user) throw attentionError ?? new Error("No se creó Atención E2E M8.");
    attentionId = attention.user.id;

    const { error: profileError } = await admin.from("profiles").insert([
      { id: managerId, display_name: `Super admin M8 ${runId}`, role: "super_admin", is_active: true, must_change_password: false },
      { id: attentionId, display_name: `Atención M8 ${runId}`, role: "attention", is_active: true, must_change_password: false },
    ]);
    if (profileError) throw profileError;
  });

  test.afterAll(async () => {
    const failures: string[] = [];
    async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await operation;
      if (error) failures.push(`${label}: ${error.message}`);
    }

    await cleanup("workflow_stage_events", admin.from("workflow_stage_events").delete().in("actor_id", [managerId, attentionId]));
    const { data: namedStages } = await admin.from("workflow_stages").select("id").in("name", [stageName, renamedStageName]);
    const stageIdsForCleanup = [...new Set([...managedStageIds, ...(namedStages ?? []).map((stage) => stage.id)])];
    if (stageIdsForCleanup.length) await cleanup("workflow_stages", admin.from("workflow_stages").delete().in("id", stageIdsForCleanup));
    await cleanup("manager", admin.auth.admin.deleteUser(managerId));
    await cleanup("attention", admin.auth.admin.deleteUser(attentionId));
    if (failures.length) throw new Error(`Falló el cleanup E2E M8:\n${failures.join("\n")}`);
  });

  test("Atención no recibe navegación ni acceso a la administración de etapas", async ({ page }) => {
    await login(page, attentionEmail);
    await expect(page.locator('nav[aria-label^="Navegación principal"] a[href="/stages"]')).toHaveCount(0);
    await page.goto("/stages");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("Super admin crea, renombra, reordena y retira una etapa", async ({ page }) => {
    await login(page, managerEmail);
    await page.getByRole("link", { name: "Etapas", exact: true }).first().click();
    await expect(page).toHaveURL(/\/stages$/);
    await expect(page.getByRole("heading", { name: "Etapas", exact: true })).toBeVisible();
    await expect(page.getByText("Pagado").first()).toBeVisible();
    await expect(page.getByText("Etapa semántica protegida").first()).toBeVisible();

    await page.getByLabel("Nombre de la etapa").fill(stageName);
    await page.getByRole("button", { name: "Crear etapa" }).click();
    await expect(page.getByText("Etapa creada correctamente.").first()).toBeVisible();

    const activeStageList = page.getByRole("list", { name: "Etapas activas" });
    const stageRow = activeStageList.getByRole("listitem").filter({ hasText: stageName }).first();
    await expect(stageRow).toBeVisible();
    await expect(activeStageList.getByRole("listitem").filter({ hasText: stageName })).toHaveCount(1);

    await stageRow.getByLabel(`Nombre de ${stageName}`).fill(renamedStageName);
    await stageRow.getByRole("button", { name: "Renombrar" }).click();
    await expect(page.getByText("Etapa renombrada correctamente.").first()).toBeVisible();
    await expect(activeStageList.getByRole("listitem").filter({ hasText: renamedStageName })).toHaveCount(1);

    const renamedRow = activeStageList.getByRole("listitem").filter({ hasText: renamedStageName }).first();
    const previousRow = renamedRow.locator("xpath=preceding-sibling::li[1]");
    await expect(previousRow).toBeVisible();
    const previousStageName = await previousRow.locator("p").first().textContent();
    await renamedRow.getByRole("button", { name: `Subir ${renamedStageName}` }).click();
    await expect(page.getByText("Etapas reordenadas correctamente.").first()).toBeVisible();

    const reorderedRow = activeStageList.getByRole("listitem").filter({ hasText: renamedStageName }).first();
    const previousRowAfterMove = activeStageList.getByRole("listitem").filter({ hasText: previousStageName ?? "" }).first();
    await expect(previousRowAfterMove.locator("xpath=preceding-sibling::li[1]")).toContainText(renamedStageName);

    await reorderedRow.getByRole("button", { name: `Retirar ${renamedStageName}` }).click();
    const dialog = page.getByRole("alertdialog", { name: "Retirar etapa" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(renamedStageName);
    await dialog.getByRole("button", { name: "Confirmar retiro" }).click();
    await expect(activeStageList.getByRole("listitem").filter({ hasText: renamedStageName })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Etapas retiradas" }).getByRole("listitem").filter({ hasText: renamedStageName })).toContainText("Retirada");

    const { data: retiredStage, error: retiredStageError } = await admin
      .from("workflow_stages")
      .select("id, is_active")
      .eq("name", renamedStageName)
      .single();
    if (retiredStageError || !retiredStage) throw retiredStageError ?? new Error("No se encontró la etapa retirada E2E.");
    expect(retiredStage.is_active).toBe(false);
    managedStageIds.push(retiredStage.id);
  });
});
