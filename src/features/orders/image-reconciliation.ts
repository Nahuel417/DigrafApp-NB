import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { ORDER_DESIGN_BUCKET } from "./image-contracts";
import { buildOrderDesignReconciliationPlan, type OrderDesignReconciliationPlan, type ReconciliationStorageObject } from "./image-reconciliation-plan";

const STORAGE_PAGE_SIZE = 1000;
export { buildOrderDesignReconciliationPlan } from "./image-reconciliation-plan";
export type { OrderDesignReconciliationPlan, ReconciliationStorageObject } from "./image-reconciliation-plan";

export type OrderDesignReconciliationResult = OrderDesignReconciliationPlan & {
  deletedObjectPaths: string[];
  dryRun: boolean;
  referencedObjectCount: number;
  scannedObjectCount: number;
};

async function listAllStorageObjects(storage: ReturnType<typeof createAdminClient>["storage"]) {
  const objects: ReconciliationStorageObject[] = [];

  async function visit(prefix: string) {
    for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
      const { data, error } = await storage.from(ORDER_DESIGN_BUCKET).list(prefix, { limit: STORAGE_PAGE_SIZE, offset });
      if (error) throw new Error("No se pudieron listar los objetos de imágenes.");

      for (const entry of data) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id === null) {
          await visit(path);
        } else {
          objects.push({ path, createdAt: entry.created_at, updatedAt: entry.updated_at });
        }
      }

      if (data.length < STORAGE_PAGE_SIZE) return;
    }
  }

  await visit("");
  return objects;
}

export async function reconcileOrderDesignObjects(options: { execute?: boolean; graceMinutes?: number } = {}): Promise<OrderDesignReconciliationResult> {
  const execute = options.execute === true;
  const graceMinutes = options.graceMinutes ?? 60;
  if (!Number.isInteger(graceMinutes) || graceMinutes < 0) throw new Error("El margen de reconciliación no es válido.");

  const admin = createAdminClient();
  const { data: references, error: referencesError } = await admin.from("order_design_images").select("object_path");
  if (referencesError) throw new Error("No se pudieron leer las referencias vigentes de imágenes.");

  const objects = await listAllStorageObjects(admin.storage);
  const plan = buildOrderDesignReconciliationPlan(
    objects,
    new Set((references ?? []).map((reference) => reference.object_path)),
    new Date(),
    graceMinutes,
  );

  let deletedObjectPaths: string[] = [];
  if (execute && plan.deletableObjectPaths.length > 0) {
    const { error: removeError } = await admin.storage.from(ORDER_DESIGN_BUCKET).remove(plan.deletableObjectPaths);
    if (removeError) throw new Error("No se pudieron eliminar todos los objetos huérfanos elegibles.");
    deletedObjectPaths = [...plan.deletableObjectPaths];
  }

  return {
    ...plan,
    deletedObjectPaths,
    dryRun: !execute,
    referencedObjectCount: references?.length ?? 0,
    scannedObjectCount: objects.length,
  };
}
