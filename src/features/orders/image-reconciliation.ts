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

async function readReferencedPaths(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin.from("order_design_images").select("object_path");
  if (error) throw new Error("No se pudieron leer las referencias vigentes de imágenes.");
  return new Set((data ?? []).map((reference) => reference.object_path));
}

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
  let referencedPaths = await readReferencedPaths(admin);

  const objects = await listAllStorageObjects(admin.storage);
  let plan = buildOrderDesignReconciliationPlan(
    objects,
    referencedPaths,
    new Date(),
    graceMinutes,
  );

  let deletedObjectPaths: string[] = [];
  if (execute && plan.deletableObjectPaths.length > 0) {
    referencedPaths = await readReferencedPaths(admin);
    const newlyProtectedPaths = plan.deletableObjectPaths.filter((path) => referencedPaths.has(path));
    const deletableObjectPaths = plan.deletableObjectPaths.filter((path) => !referencedPaths.has(path));
    plan = {
      ...plan,
      deletableObjectPaths,
      protectedObjectPaths: [...plan.protectedObjectPaths, ...newlyProtectedPaths],
    };

    if (deletableObjectPaths.length > 0) {
      const { error: removeError } = await admin.storage.from(ORDER_DESIGN_BUCKET).remove(deletableObjectPaths);
      if (removeError) throw new Error("No se pudieron eliminar todos los objetos huérfanos elegibles.");
      deletedObjectPaths = [...deletableObjectPaths];
    }
  }

  return {
    ...plan,
    deletedObjectPaths,
    dryRun: !execute,
    referencedObjectCount: referencedPaths.size,
    scannedObjectCount: objects.length,
  };
}
