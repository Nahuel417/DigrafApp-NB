import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/lib/supabase/database.types";
import { buildOrderDesignReconciliationPlan } from "../../src/features/orders/image-reconciliation-plan";
import { verifyUploadedOrderDesignImage } from "../../src/features/orders/image-validation";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const localUrl = url ?? "http://127.0.0.1:54396";
const password = `M7${randomUUID().replaceAll("-", "")}7`;
const bucketId = "order-designs";
const maximumBytes = 10 * 1024 * 1024;

type Role = Database["public"]["Enums"]["app_role"];
type Identity = { email: string; id: string; role: Role };
type OrderSeed = { id: string };
type ImageMutationAction = "add" | "replace" | "delete" | "set_primary" | "clear_primary";
type ImageMutation = {
  id?: string;
  byte_size: number | null;
  content_type: string | null;
  created_at: string | null;
  event_id: string;
  image_id: string | null;
  is_primary: boolean | null;
  object_path: string | null;
  order_id: string;
  previous_object_path: string | null;
  updated_at: string | null;
  uploaded_by: string | null;
};

describe.skipIf(!url || !serviceRoleKey || !publishableKey)("Imagen vigente protegida M7", () => {
  const service = createClient<Database>(localUrl, serviceRoleKey ?? "test-key", { auth: { persistSession: false } });
  const identities: Identity[] = [];
  const orderIds: string[] = [];
  const objectPaths: string[] = [];
  let receivedStageId: string;

  async function createIdentity(role: Role, options?: { active?: boolean; mustChangePassword?: boolean }) {
    const email = `${role}-m7-${randomUUID()}@digraf.local`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("No se pudo crear una identidad sintética M7.");

    const { error: profileError } = await service.from("profiles").insert({
      id: data.user.id,
      display_name: `M7 ${role}`,
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

  async function createOrder(): Promise<OrderSeed> {
    const { data, error } = await service
      .from("orders")
      .insert({
        customer_name: `Pedido M7 ${randomUUID().slice(0, 8)}`,
        quantity: 1,
        order_type: "individual",
        order_date: "2026-08-03",
        promised_delivery_date: "2026-08-04",
        current_stage_id: receivedStageId,
        created_by: identities[0]!.id,
        idempotency_key: `seed-m7-${randomUUID()}`,
        idempotency_fingerprint: randomUUID().replaceAll("-", "").slice(0, 32),
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("No se pudo crear un pedido sintético M7.");
    orderIds.push(data.id);
    return data;
  }

  function objectPath(orderId: string, extension: "jpg" | "png" | "webp" = "png") {
    return `orders/${orderId}/${randomUUID()}.${extension}`;
  }

  async function upload(client: SupabaseClient<Database>, path: string, contentType = "image/png", size = 1024) {
    const result = await client.storage.from(bucketId).upload(
      path,
      new Blob([new Uint8Array(size)], { type: contentType }),
      { contentType, upsert: false },
    );
    if (!result.error) objectPaths.push(path);
    return result;
  }

  async function finalize(
    actor: Identity,
    order: OrderSeed,
    path: string,
    expectedImageUpdatedAt: string | null,
    idempotencyKey = randomUUID(),
  ) {
    const input = {
      p_actor_id: actor.id,
      p_order_id: order.id,
      p_object_path: path,
      p_idempotency_key: idempotencyKey,
    };

    return expectedImageUpdatedAt === null
      ? service.rpc("finalize_order_design_image", input)
      : service.rpc("finalize_order_design_image", { ...input, p_expected_image_updated_at: expectedImageUpdatedAt });
  }

  async function mutate(
    actor: Identity,
    order: OrderSeed,
    action: ImageMutationAction,
    options: {
      imageId?: string | null;
      objectPath?: string | null;
      expectedImageUpdatedAt?: string | null;
      idempotencyKey?: string;
    } = {},
  ) {
    return service.rpc("mutate_order_design_image" as never, {
      p_actor_id: actor.id,
      p_order_id: order.id,
      p_action: action,
      p_image_id: options.imageId ?? null,
      p_object_path: options.objectPath ?? null,
      p_expected_image_updated_at: options.expectedImageUpdatedAt ?? null,
      p_idempotency_key: options.idempotencyKey ?? randomUUID(),
    } as never) as unknown as Promise<{ data: ImageMutation[] | null; error: { message: string } | null }>;
  }

  async function images(order: OrderSeed) {
    const result = await service
      .from("order_design_images")
      .select("id, order_id, object_path, content_type, byte_size, uploaded_by, created_at, updated_at, is_primary")
      .eq("order_id", order.id)
      .order("created_at")
      .order("id");
    return result as unknown as { data: ImageMutation[] | null; error: { message: string } | null };
  }

  async function addImage(actor: Identity, order: OrderSeed, extension: "jpg" | "png" | "webp" = "png") {
    const contentType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
    const path = objectPath(order.id, extension);
    const uploadResult = await upload(await signedClient(actor), path, contentType);
    expect(uploadResult.error).toBeNull();
    const mutation = await mutate(actor, order, "add", { objectPath: path });
    return { mutation, path };
  }

  beforeAll(async () => {
    const { data: stage, error } = await service.from("workflow_stages").select("id").eq("code", "received").single();
    if (error || !stage) throw error ?? new Error("No se encontró la etapa inicial.");
    receivedStageId = stage.id;

    for (const role of ["super_admin", "admin", "attention", "employee"] as const) await createIdentity(role);
    await createIdentity("attention", { active: false });
    await createIdentity("attention", { mustChangePassword: true });
  });

  afterAll(async () => {
    const failures: string[] = [];
    async function cleanup(label: string, operation: PromiseLike<{ error: { message: string } | null }>) {
      const { error } = await operation;
      if (error) failures.push(`${label}: ${error.message}`);
    }

    if (objectPaths.length) await cleanup("storage objects", service.storage.from(bucketId).remove([...new Set(objectPaths)]));
    if (orderIds.length) {
      await cleanup("order_design_image_events", service.from("order_design_image_events").delete().in("order_id", orderIds));
      await cleanup("order_design_images", service.from("order_design_images").delete().in("order_id", orderIds));
      await cleanup("orders", service.from("orders").delete().in("id", orderIds));
    }
    for (const identity of identities) await cleanup(`auth user ${identity.id}`, service.auth.admin.deleteUser(identity.id));
    if (failures.length) throw new Error(`Falló el cleanup M7:\n${failures.join("\n")}`);
  });

  it("crea un bucket privado con tipos y límite de tamaño cerrados", async () => {
    const { data, error } = await service.storage.getBucket(bucketId);
    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: bucketId,
      public: false,
      file_size_limit: maximumBytes,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    });
  });

  it("permite a Super admin, Admin y Atención cargar y confirmar una única imagen vigente", async () => {
    for (const role of ["super_admin", "admin", "attention"] as const) {
      const identity = identities.find((candidate) => candidate.role === role)!;
      const client = await signedClient(identity);
      const order = await createOrder();
      const path = objectPath(order.id);

      expect((await upload(client, path)).error).toBeNull();
      const confirmed = await finalize(identity, order, path, null);
      expect(confirmed.error).toBeNull();
      expect(confirmed.data?.[0]).toMatchObject({ order_id: order.id, object_path: path, previous_object_path: null });

      const { data: image, error } = await service
        .from("order_design_images")
        .select("object_path, content_type, byte_size, uploaded_by")
        .eq("order_id", order.id)
        .single();
      expect(error).toBeNull();
      expect(image).toMatchObject({ object_path: path, content_type: "image/png", byte_size: 1024, uploaded_by: identities.find((identity) => identity.role === role)!.id });
    }
  });

  it("rechaza tipo y tamaño fuera de los límites del bucket", async () => {
    const attention = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const order = await createOrder();

    expect((await upload(attention, objectPath(order.id), "text/plain")).error).not.toBeNull();
    expect((await upload(attention, objectPath(order.id), "image/png", maximumBytes + 1)).error).not.toBeNull();
  });

  it("rechaza a Empleado, sesiones inválidas y escrituras directas de metadata", async () => {
    const superAdmin = await signedClient(identities.find((identity) => identity.role === "super_admin")!);
    const employee = await signedClient(identities.find((identity) => identity.role === "employee")!);
    const order = await createOrder();
    const path = objectPath(order.id);

    expect((await upload(employee, path)).error).not.toBeNull();
    expect((await superAdmin.from("order_design_images").insert({
      order_id: order.id,
      object_path: path,
      content_type: "image/png",
      byte_size: 1024,
      uploaded_by: identities[0]!.id,
    })).error).not.toBeNull();
    const directRpc = await superAdmin.rpc("finalize_order_design_image", {
      p_actor_id: identities[0]!.id,
      p_order_id: order.id,
      p_object_path: path,
      p_idempotency_key: randomUUID(),
    });
    expect(directRpc.error).not.toBeNull();
    expect((await finalize(identities[3]!, order, path, null)).error?.message).toContain("permiso");
    expect((await finalize(identities[4]!, order, path, null)).error?.message).toContain("permiso");
    expect((await finalize(identities[5]!, order, path, null)).error?.message).toContain("permiso");
  });

  it("finaliza idempotentemente, conserva el path anterior y no habilita borrado directo", async () => {
    const attentionIdentity = identities.find((identity) => identity.role === "attention")!;
    const attention = await signedClient(attentionIdentity);
    const order = await createOrder();
    const firstPath = objectPath(order.id, "webp");
    const key = randomUUID();

    expect((await upload(attention, firstPath, "image/webp")).error).toBeNull();
    const first = await finalize(attentionIdentity, order, firstPath, null, key);
    const replay = await finalize(attentionIdentity, order, firstPath, null, key);
    expect(first.error).toBeNull();
    expect(replay.error).toBeNull();
    expect(replay.data?.[0]?.event_id).toBe(first.data?.[0]?.event_id);
    expect((await finalize(attentionIdentity, order, objectPath(order.id), null, key)).error?.message).toContain("idempotencia");

    const secondPath = objectPath(order.id, "jpg");
    expect((await upload(attention, secondPath, "image/jpeg")).error).toBeNull();
    const replacement = await finalize(attentionIdentity, order, secondPath, first.data?.[0]?.image_updated_at ?? null);
    expect(replacement.error).toBeNull();
    expect(replacement.data?.[0]).toMatchObject({ object_path: secondPath, previous_object_path: firstPath });
    expect((await attention.storage.from(bucketId).remove([firstPath])).error).toBeNull();
    const { data: remainingObjects, error: remainingObjectsError } = await service.storage
      .from(bucketId)
      .list(`orders/${order.id}`);
    expect(remainingObjectsError).toBeNull();
    expect(remainingObjects?.map((object) => object.name)).toContain(firstPath.split("/").at(-1));

    const { data: events, error } = await service
      .from("order_design_image_events")
      .select("action, object_path, previous_object_path")
      .eq("order_id", order.id)
      .order("created_at");
    expect(error).toBeNull();
    expect(events).toEqual([
      { action: "uploaded", object_path: firstPath, previous_object_path: null },
      { action: "replaced", object_path: secondPath, previous_object_path: firstPath },
    ]);
  });

  it("serializa reemplazos concurrentes y mantiene una sola referencia vigente", async () => {
    const superAdminIdentity = identities.find((identity) => identity.role === "super_admin")!;
    const adminIdentity = identities.find((identity) => identity.role === "admin")!;
    const superAdmin = await signedClient(superAdminIdentity);
    const admin = await signedClient(adminIdentity);
    const order = await createOrder();
    const initialPath = objectPath(order.id);

    expect((await upload(superAdmin, initialPath)).error).toBeNull();
    const initial = await finalize(superAdminIdentity, order, initialPath, null);
    if (initial.error || !initial.data?.[0]) throw initial.error ?? new Error("La imagen inicial no devolvió metadata.");

    const firstPath = objectPath(order.id);
    const secondPath = objectPath(order.id);
    expect((await upload(superAdmin, firstPath)).error).toBeNull();
    expect((await upload(admin, secondPath)).error).toBeNull();
    const [first, second] = await Promise.all([
      finalize(superAdminIdentity, order, firstPath, initial.data[0].image_updated_at),
      finalize(adminIdentity, order, secondPath, initial.data[0].image_updated_at),
    ]);

    expect([first.error, second.error].filter(Boolean)).toHaveLength(1);
    expect([first.data, second.data].filter(Boolean)).toHaveLength(1);
    expect([first.error, second.error].filter((error) => error?.message.includes("cambió en otra sesión"))).toHaveLength(1);

    const { data: image, error: imageError } = await service
      .from("order_design_images")
      .select("object_path")
      .eq("order_id", order.id)
      .single();
    expect(imageError).toBeNull();
    expect([firstPath, secondPath]).toContain(image?.object_path);

    const { count, error: eventError } = await service
      .from("order_design_image_events")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id);
    expect(eventError).toBeNull();
    expect(count).toBe(2);
  });

  it("verifica bytes reales después de la carga y no confía en MIME o extensión", async () => {
    const attention = await signedClient(identities.find((identity) => identity.role === "attention")!);
    const order = await createOrder();
    const validPath = objectPath(order.id);
    const invalidPath = objectPath(order.id);
    const validBytes = new Uint8Array(24);
    validBytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    validBytes.set([0x49, 0x48, 0x44, 0x52], 12);

    const validUpload = await attention.storage.from(bucketId).upload(validPath, new Blob([validBytes], { type: "image/png" }), {
      contentType: "image/png",
      upsert: false,
    });
    expect(validUpload.error).toBeNull();
    objectPaths.push(validPath);

    const invalidUpload = await attention.storage.from(bucketId).upload(invalidPath, new Blob([new Uint8Array(validBytes.length)], { type: "image/png" }), {
      contentType: "image/png",
      upsert: false,
    });
    expect(invalidUpload.error).toBeNull();
    objectPaths.push(invalidPath);

    const validVerification = await verifyUploadedOrderDesignImage(
      attention.storage.from(bucketId),
      validPath,
      "image/png",
      validBytes.length,
    );
    const invalidVerification = await verifyUploadedOrderDesignImage(
      attention.storage.from(bucketId),
      invalidPath,
      "image/png",
      validBytes.length,
    );

    expect(validVerification.ok).toBe(true);
    expect(invalidVerification.ok).toBe(false);
  });

  it("preserva path y metadata del singleton histórico como primary", async () => {
    const actor = identities.find((identity) => identity.role === "attention")!;
    const order = await createOrder();
    const path = objectPath(order.id, "webp");
    expect((await upload(await signedClient(actor), path, "image/webp", 2048)).error).toBeNull();

    const result = await finalize(actor, order, path, null);
    expect(result.error).toBeNull();
    const current = await images(order);

    expect(current.error).toBeNull();
    expect(current.data).toHaveLength(1);
    expect(current.data?.[0]).toMatchObject({
      object_path: path,
      content_type: "image/webp",
      byte_size: 2048,
      uploaded_by: actor.id,
      is_primary: true,
    });
  });

  it("mantiene entre cero y tres imágenes y rechaza el cuarto upload, incluso en carrera", async () => {
    const actor = identities.find((identity) => identity.role === "admin")!;
    const order = await createOrder();
    expect((await images(order)).data).toHaveLength(0);

    const firstThree = await Promise.all([
      addImage(actor, order),
      addImage(actor, order, "jpg"),
      addImage(actor, order, "webp"),
    ]);
    expect(firstThree.every(({ mutation }) => mutation.error === null)).toBe(true);
    expect((await images(order)).data).toHaveLength(3);

    const fourth = await addImage(actor, order);
    expect(fourth.mutation.error?.message).toContain("tres");

    const racePaths = [objectPath(order.id), objectPath(order.id)];
    for (const path of racePaths) {
      expect((await upload(await signedClient(actor), path)).error).toBeNull();
    }
    const race = await Promise.all(racePaths.map((path) => mutate(actor, order, "add", { objectPath: path })));
    expect(race.filter((result) => result.error === null)).toHaveLength(0);
    expect(race.filter((result) => result.error?.message.includes("tres"))).toHaveLength(2);
    expect((await images(order)).data).toHaveLength(3);
  }, 20000);

  it("aplica primary explícito, clear explícito y deja una sola primary", async () => {
    const actor = identities.find((identity) => identity.role === "admin")!;
    const order = await createOrder();
    const first = await addImage(actor, order);
    const second = await addImage(actor, order, "jpg");
    const firstId = first.mutation.data?.[0]?.image_id;
    const secondId = second.mutation.data?.[0]?.image_id;
    if (!firstId || !secondId) throw new Error("La carga no devolvió identificadores de imagen.");

    expect((await mutate(actor, order, "set_primary", { imageId: firstId })).error).toBeNull();
    expect((await mutate(actor, order, "set_primary", { imageId: secondId })).error).toBeNull();
    let current = await images(order);
    expect(current.data?.filter((image) => image.is_primary)).toHaveLength(1);
    expect(current.data?.find((image) => image.is_primary)?.id).toBe(secondId);

    expect((await mutate(actor, order, "clear_primary")).error).toBeNull();
    current = await images(order);
    expect(current.data?.filter((image) => image.is_primary)).toHaveLength(0);
  }, 20000);

  it("preserva primary al reemplazar y no promociona otra al borrar la primary", async () => {
    const actor = identities.find((identity) => identity.role === "attention")!;
    const order = await createOrder();
    const first = await addImage(actor, order);
    const second = await addImage(actor, order, "jpg");
    const firstImage = first.mutation.data?.[0];
    const secondImageId = second.mutation.data?.[0]?.image_id;
    if (!firstImage?.image_id || !secondImageId || !firstImage.updated_at) throw new Error("La carga no devolvió metadata completa.");

    expect((await mutate(actor, order, "set_primary", { imageId: firstImage.image_id })).error).toBeNull();
    const replacementPath = objectPath(order.id, "webp");
    expect((await upload(await signedClient(actor), replacementPath, "image/webp", 4096)).error).toBeNull();
    const replacement = await mutate(actor, order, "replace", {
      imageId: firstImage.image_id,
      objectPath: replacementPath,
      expectedImageUpdatedAt: firstImage.updated_at,
    });
    expect(replacement.error).toBeNull();
    expect(replacement.data?.[0]).toMatchObject({ image_id: firstImage.image_id, object_path: replacementPath, is_primary: true, byte_size: 4096 });

    expect((await mutate(actor, order, "delete", { imageId: firstImage.image_id })).error).toBeNull();
    const current = await images(order);
    expect(current.data).toHaveLength(1);
    expect(current.data?.[0]).toMatchObject({ id: secondImageId, is_primary: false });
  }, 20000);

  it("reproduce la operación con la misma clave y rechaza el conflicto de fingerprint", async () => {
    const actor = identities.find((identity) => identity.role === "admin")!;
    const order = await createOrder();
    const firstPath = objectPath(order.id);
    expect((await upload(await signedClient(actor), firstPath)).error).toBeNull();
    const idempotencyKey = randomUUID();
    const first = await mutate(actor, order, "add", { objectPath: firstPath, idempotencyKey });
    const replay = await mutate(actor, order, "add", { objectPath: firstPath, idempotencyKey });
    expect(first.error).toBeNull();
    expect(replay.error).toBeNull();
    expect(replay.data?.[0]?.event_id).toBe(first.data?.[0]?.event_id);

    const secondPath = objectPath(order.id, "jpg");
    expect((await upload(await signedClient(actor), secondPath, "image/jpeg")).error).toBeNull();
    const conflict = await mutate(actor, order, "add", { objectPath: secondPath, idempotencyKey });
    expect(conflict.error?.message).toContain("idempotencia");
  });

  it("reconcilia todos los paths vivos de la colección, no solo uno", async () => {
    const actor = identities.find((identity) => identity.role === "attention")!;
    const order = await createOrder();
    const seeded = await Promise.all([addImage(actor, order), addImage(actor, order, "jpg"), addImage(actor, order, "webp")]);
    const livePaths = seeded.map(({ path }) => path);
    const now = new Date("2026-08-18T12:00:00.000Z");
    const plan = buildOrderDesignReconciliationPlan(
      [...livePaths.map((path) => ({ path, createdAt: "2026-08-17T00:00:00.000Z", updatedAt: "2026-08-17T00:00:00.000Z" })), { path: objectPath(order.id), createdAt: "2026-08-17T00:00:00.000Z", updatedAt: "2026-08-17T00:00:00.000Z" }],
      new Set(livePaths),
      now,
      0,
    );

    expect(plan.protectedObjectPaths).toEqual(livePaths);
    expect(plan.deletableObjectPaths).toHaveLength(1);
  }, 20000);

  it("deniega escrituras directas, preserva lectura operativa y limita la gestión por rol", async () => {
    const admin = await signedClient(identities.find((identity) => identity.role === "admin")!);
    const employee = await signedClient(identities.find((identity) => identity.role === "employee")!);
    const order = await createOrder();
    const path = objectPath(order.id);

    expect((await employee.storage.from(bucketId).upload(path, new Blob([new Uint8Array(1024)], { type: "image/png" }), { contentType: "image/png", upsert: false })).error).not.toBeNull();
    expect((await admin.from("order_design_images").insert({
      order_id: order.id,
      object_path: path,
      content_type: "image/png",
      byte_size: 1024,
      uploaded_by: identities[0]!.id,
    })).error).not.toBeNull();
    expect((await employee.from("order_design_images").select("order_id").eq("order_id", order.id)).error).toBeNull();
    const directRpc = await employee.rpc("mutate_order_design_image" as never, {
      p_actor_id: identities.find((identity) => identity.role === "employee")!.id,
      p_order_id: order.id,
      p_action: "add",
      p_image_id: null,
      p_object_path: path,
      p_expected_image_updated_at: null,
      p_idempotency_key: randomUUID(),
    } as never) as unknown as { error: { message: string } | null };
    expect(directRpc.error?.message).toContain("permission denied");
    expect((await mutate(identities.find((identity) => identity.role === "employee")!, order, "add", { objectPath: path })).error?.message).toContain("permiso");
  });
});
