import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const localUrl = url ?? "http://127.0.0.1:54321";
const password = `M8${randomUUID().replaceAll("-", "")}7`;

type Role = Database["public"]["Enums"]["app_role"];
type Identity = { email: string; id: string; role: Role };
type Stage = { code: string; id: string; is_active: boolean; name: string; position: number; updated_at: string };

describe.skipIf(!url || !serviceRoleKey || !publishableKey)("Administración de etapas M8", () => {
  const service = createClient<Database>(localUrl, serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const orderIds: string[] = [];
  const stageIds: string[] = [];
  let stagesByCode: Record<string, Stage> = {};

  async function createIdentity(role: Role, options?: { active?: boolean; mustChangePassword?: boolean }) {
    const email = `${role}-m8-${randomUUID()}@digraf.local`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No se pudo crear una identidad sintética M8.");

    const { error: profileError } = await service.from("profiles").insert({
      id: data.user.id,
      display_name: `M8 ${role}`,
      role,
      is_active: options?.active ?? true,
      must_change_password: options?.mustChangePassword ?? false,
    });
    if (profileError) throw profileError;

    const identity = { email, id: data.user.id, role };
    identities.push(identity);
    return identity;
  }

  async function signedClient(identity: Pick<Identity, "email">): Promise<SupabaseClient<Database>> {
    const client = createClient<Database>(localUrl, publishableKey ?? "test-key", { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email: identity.email, password });
    if (error) throw error;
    return client;
  }

  async function getActiveStages() {
    const { data, error } = await service
      .from("workflow_stages")
      .select("id, code, name, position, is_active, updated_at")
      .eq("is_active", true)
      .order("position")
      .order("id");
    if (error || !data) throw error ?? new Error("No se pudieron leer las etapas activas.");
    return data as Stage[];
  }

  async function createStage(client: SupabaseClient<Database>, name: string, idempotencyKey = randomUUID()) {
    const result = await client.rpc("create_workflow_stage", { p_name: name, p_idempotency_key: idempotencyKey });
    if (!result.data?.[0]) throw result.error ?? new Error("La creación de etapa no devolvió un resultado.");
    stageIds.push(result.data[0].stage_id);
    return { ...result, stage: result.data[0], idempotencyKey };
  }

  async function createOrder(currentStageId: string) {
    const { data, error } = await service
      .from("orders")
      .insert({
        customer_name: `Pedido M8 ${randomUUID().slice(0, 8)}`,
        quantity: 1,
        order_type: "individual",
        order_date: "2026-08-02",
        promised_delivery_date: "2026-08-03",
        current_stage_id: currentStageId,
        created_by: identities[0]!.id,
        idempotency_key: `seed-m8-${randomUUID()}`,
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      })
      .select("id, updated_at")
      .single();
    if (error || !data) throw error ?? new Error("No se pudo crear un pedido sintético M8.");
    orderIds.push(data.id);
    return data;
  }

  beforeAll(async () => {
    for (const role of ["super_admin", "admin", "attention", "employee"] as const) await createIdentity(role);
    await createIdentity("admin", { active: false });
    await createIdentity("admin", { mustChangePassword: true });

    const initialStages = await getActiveStages();
    stagesByCode = Object.fromEntries(initialStages.map((stage) => [stage.code, stage]));
  });

  afterAll(async () => {
    const failures: string[] = [];
    async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await operation;
      if (error) failures.push(`${label}: ${error.message}`);
    }

    if (orderIds.length) {
      await cleanup("order_stage_events", service.from("order_stage_events").delete().in("order_id", orderIds));
      await cleanup("orders", service.from("orders").delete().in("id", orderIds));
    }
    if (identities.length) {
      await cleanup("workflow_stage_events", service.from("workflow_stage_events").delete().in("actor_id", identities.map((identity) => identity.id)));
    }
    if (stageIds.length) await cleanup("workflow_stages", service.from("workflow_stages").delete().in("id", [...new Set(stageIds)]));
    for (const identity of identities) await cleanup(`auth user ${identity.id}`, service.auth.admin.deleteUser(identity.id));
    if (failures.length) throw new Error(`Falló el cleanup M8:\n${failures.join("\n")}`);
  });

  it("autoriza solo a Super admin y Admin, crea al final y preserva idempotencia y auditoría", async () => {
    const superAdmin = await signedClient(identities.find((identity) => identity.role === "super_admin")!);
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const attention = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const employee = await signedClient(identities.find((identity) => identity.role === "employee")!);
    const inactive = await signedClient(identities[4]!);
    const requiredChange = await signedClient(identities[5]!);
    const before = await getActiveStages();
    const key = randomUUID();

    const created = await createStage(superAdmin, "Preparación M8", key);
    expect(created.error).toBeNull();
    expect(created.stage).toMatchObject({
      stage_name: "Preparación M8",
      stage_position: Math.max(...before.map((stage) => stage.position)) + 1,
    });
    expect(created.stage.stage_code).toMatch(/^stage_[a-f0-9]{32}$/);

    const replay = await superAdmin.rpc("create_workflow_stage", { p_name: "Preparación M8", p_idempotency_key: key });
    expect(replay.error).toBeNull();
    expect(replay.data?.[0]).toEqual(created.stage);
    expect((await superAdmin.rpc("create_workflow_stage", { p_name: "Otra etapa", p_idempotency_key: key })).error?.message).toContain("idempotencia");

    const concurrentKey = randomUUID();
    const [firstConcurrent, secondConcurrent] = await Promise.all([
      superAdmin.rpc("create_workflow_stage", { p_name: "Concurrente M8", p_idempotency_key: concurrentKey }),
      superAdmin.rpc("create_workflow_stage", { p_name: "Concurrente M8", p_idempotency_key: concurrentKey }),
    ]);
    expect(firstConcurrent.error).toBeNull();
    expect(secondConcurrent.error).toBeNull();
    expect(firstConcurrent.data?.[0]?.stage_id).toBe(secondConcurrent.data?.[0]?.stage_id);
    if (!firstConcurrent.data?.[0]) throw new Error("La creación concurrente no devolvió una etapa.");
    stageIds.push(firstConcurrent.data[0].stage_id);

    for (const client of [attention, employee, inactive, requiredChange]) {
      expect((await client.rpc("create_workflow_stage", { p_name: "No autorizada", p_idempotency_key: randomUUID() })).error?.message).toContain("permiso");
    }
    expect((await createStage(admin, "Control M8")).error).toBeNull();

    const { data: audit, error: auditError } = await service
      .from("workflow_stage_events")
      .select("action, actor_id, details")
      .eq("id", created.stage.event_id)
      .single();
    expect(auditError).toBeNull();
    expect(audit).toMatchObject({ action: "created", actor_id: identities[0]!.id, details: { name: "Preparación M8" } });

    expect((await admin.from("workflow_stages").insert({ code: "direct_write", name: "Escritura directa", position: 999 })).error).not.toBeNull();
    expect((await admin.from("workflow_stage_events").insert({
      workflow_stage_id: created.stage.stage_id,
      actor_id: identities[1]!.id,
      action: "created",
      details: {},
      idempotency_key: randomUUID(),
      idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
    })).error).not.toBeNull();
  });

  it("renombra y reordena con control optimista, exclusión concurrente y auditoría", async () => {
    const superAdmin = await signedClient(identities.find((identity) => identity.role === "super_admin")!);
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const created = await createStage(admin, "Terminación M8");
    const { data: stageBeforeRename, error: stageBeforeRenameError } = await service
      .from("workflow_stages")
      .select("updated_at")
      .eq("id", created.stage.stage_id)
      .single();
    if (stageBeforeRenameError || !stageBeforeRename) throw stageBeforeRenameError ?? new Error("No se pudo leer la etapa creada.");

    const renamed = await admin.rpc("rename_workflow_stage", {
      p_stage_id: created.stage.stage_id,
      p_name: "Terminación final M8",
      p_expected_updated_at: stageBeforeRename.updated_at,
      p_idempotency_key: randomUUID(),
    });
    expect(renamed.error).toBeNull();
    expect(renamed.data?.[0]?.stage_name).toBe("Terminación final M8");
    expect((await superAdmin.rpc("rename_workflow_stage", {
      p_stage_id: created.stage.stage_id,
      p_name: "Renombre obsoleto",
      p_expected_updated_at: stageBeforeRename.updated_at,
      p_idempotency_key: randomUUID(),
    })).error?.message).toContain("cambió en otra sesión");

    const current = await getActiveStages();
    const expected = current.map((stage) => stage.id);
    const reversed = [...expected].reverse();
    const rotated = [...expected.slice(1), expected[0]!];
    const [first, second] = await Promise.all([
      admin.rpc("reorder_workflow_stages", { p_stage_ids: reversed, p_expected_stage_ids: expected, p_idempotency_key: randomUUID() }),
      superAdmin.rpc("reorder_workflow_stages", { p_stage_ids: rotated, p_expected_stage_ids: expected, p_idempotency_key: randomUUID() }),
    ]);
    expect([first.error, second.error].filter(Boolean)).toHaveLength(1);
    expect([first.data, second.data].filter(Boolean)).toHaveLength(1);

    const successful = first.data?.[0] ?? second.data?.[0];
    if (!successful) throw new Error("El reordenamiento no devolvió un evento.");
    const { data: audit, error: auditError } = await service.from("workflow_stage_events").select("action, details").eq("id", successful.event_id).single();
    expect(auditError).toBeNull();
    expect(audit).toMatchObject({ action: "reordered", details: { previous_stage_ids: expected } });

    const persistedStages = await getActiveStages();
    const successfulOrder = first.data ? reversed : rotated;
    expect(persistedStages.map((stage) => stage.id)).toEqual(successfulOrder);
    expect(persistedStages.map((stage) => stage.position)).toEqual(successfulOrder.map((_, index) => index));
  });

  it("rechaza etapas protegidas u ocupadas y conserva al menos una ordinaria activa", async () => {
    const superAdmin = await signedClient(identities.find((identity) => identity.role === "super_admin")!);
    const { data: protectedStage, error: protectedStageError } = await service
      .from("workflow_stages")
      .select("id, updated_at")
      .eq("code", "received")
      .single();
    if (protectedStageError || !protectedStage) throw protectedStageError ?? new Error("No se pudo leer la etapa protegida.");
    expect((await superAdmin.rpc("retire_workflow_stage", {
      p_stage_id: protectedStage.id,
      p_expected_updated_at: protectedStage.updated_at,
      p_idempotency_key: randomUUID(),
    })).error?.message).toContain("no se puede retirar");

    const created = await createStage(superAdmin, "Etapa ocupada M8");
    const order = await createOrder(created.stage.stage_id);
    const { data: occupiedStage, error: occupiedStageError } = await service.from("workflow_stages").select("updated_at").eq("id", created.stage.stage_id).single();
    if (occupiedStageError || !occupiedStage) throw occupiedStageError ?? new Error("No se pudo leer la etapa ocupada.");
    expect((await superAdmin.rpc("retire_workflow_stage", {
      p_stage_id: created.stage.stage_id,
      p_expected_updated_at: occupiedStage.updated_at,
      p_idempotency_key: randomUUID(),
    })).error?.message).toContain("tiene pedidos");

    const { error: deleteOrderError } = await service.from("orders").delete().eq("id", order.id);
    if (deleteOrderError) throw deleteOrderError;
    orderIds.splice(orderIds.indexOf(order.id), 1);
    expect((await superAdmin.rpc("retire_workflow_stage", {
      p_stage_id: created.stage.stage_id,
      p_expected_updated_at: occupiedStage.updated_at,
      p_idempotency_key: randomUUID(),
    })).error).toBeNull();

    for (const identity of identities.slice(0, 4)) {
      const client = await signedClient(identity);
      const { data: historicalStage, error: historicalStageError } = await client
        .from("workflow_stages")
        .select("name, is_active")
        .eq("id", created.stage.stage_id)
        .single();
      expect(historicalStageError).toBeNull();
      expect(historicalStage).toEqual({ name: "Etapa ocupada M8", is_active: false });
    }

    const ordinaryStages = (await getActiveStages()).filter((stage) => !["received", "paid", "delivered"].includes(stage.code));
    const retained = ordinaryStages.at(-1)!;
    for (const stage of ordinaryStages.filter((stage) => stage.id !== retained.id)) {
      expect((await superAdmin.rpc("retire_workflow_stage", {
        p_stage_id: stage.id,
        p_expected_updated_at: stage.updated_at,
        p_idempotency_key: randomUUID(),
      })).error).toBeNull();
    }
    expect((await superAdmin.rpc("retire_workflow_stage", {
      p_stage_id: retained.id,
      p_expected_updated_at: retained.updated_at,
      p_idempotency_key: randomUUID(),
    })).error?.message).toContain("al menos una etapa ordinaria activa");

    const { error: restoreError } = await service.from("workflow_stages").update({ is_active: true }).in("id", ordinaryStages.map((stage) => stage.id));
    if (restoreError) throw restoreError;
  });

  it("guarda snapshots de nombres en los nuevos movimientos", async () => {
    const superAdmin = await signedClient(identities.find((identity) => identity.role === "super_admin")!);
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const created = await createStage(admin, "Snapshot M8");
    const order = await createOrder(stagesByCode.received!.id);

    const moved = await superAdmin.rpc("move_order", {
      p_order_id: order.id,
      p_from_stage_id: stagesByCode.received!.id,
      p_to_stage_id: created.stage.stage_id,
      p_expected_updated_at: order.updated_at,
      p_idempotency_key: randomUUID(),
    });
    if (moved.error || !moved.data?.[0]) throw moved.error ?? new Error("No se pudo mover el pedido de prueba.");

    const { data: event, error: eventError } = await service
      .from("order_stage_events")
      .select("from_stage_name, to_stage_name")
      .eq("id", moved.data[0].event_id)
      .single();
    expect(eventError).toBeNull();
    expect(event).toEqual({ from_stage_name: "Pedido recibido", to_stage_name: "Snapshot M8" });

    const { data: stage, error: stageError } = await service.from("workflow_stages").select("updated_at").eq("id", created.stage.stage_id).single();
    if (stageError || !stage) throw stageError ?? new Error("No se pudo leer la etapa del snapshot.");
    expect((await admin.rpc("rename_workflow_stage", {
      p_stage_id: created.stage.stage_id,
      p_name: "Snapshot renombrado M8",
      p_expected_updated_at: stage.updated_at,
      p_idempotency_key: randomUUID(),
    })).error).toBeNull();

    const { data: persistedEvent, error: persistedEventError } = await service
      .from("order_stage_events")
      .select("to_stage_name")
      .eq("id", moved.data[0].event_id)
      .single();
    expect(persistedEventError).toBeNull();
    expect(persistedEvent?.to_stage_name).toBe("Snapshot M8");
  });
});
