import { isOrderDesignObjectPath } from "./image-contracts";

const DEFAULT_GRACE_MINUTES = 60;

export type ReconciliationStorageObject = {
  path: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type OrderDesignReconciliationPlan = {
  deletableObjectPaths: string[];
  deferredObjectPaths: string[];
  protectedObjectPaths: string[];
  unrecognizedObjectPaths: string[];
};

function objectDate(object: ReconciliationStorageObject) {
  const value = object.updatedAt ?? object.createdAt;
  return value ? new Date(value) : null;
}

export function buildOrderDesignReconciliationPlan(
  objects: ReconciliationStorageObject[],
  referencedPaths: ReadonlySet<string>,
  now = new Date(),
  graceMinutes = DEFAULT_GRACE_MINUTES,
): OrderDesignReconciliationPlan {
  const cutoff = now.getTime() - graceMinutes * 60 * 1000;
  const deletableObjectPaths: string[] = [];
  const deferredObjectPaths: string[] = [];
  const protectedObjectPaths: string[] = [];
  const unrecognizedObjectPaths: string[] = [];

  for (const object of objects) {
    if (referencedPaths.has(object.path)) {
      protectedObjectPaths.push(object.path);
      continue;
    }

    if (!isOrderDesignObjectPath(object.path)) {
      unrecognizedObjectPaths.push(object.path);
      continue;
    }

    const createdAt = objectDate(object);
    if (!createdAt || Number.isNaN(createdAt.getTime()) || createdAt.getTime() > cutoff) {
      deferredObjectPaths.push(object.path);
      continue;
    }

    deletableObjectPaths.push(object.path);
  }

  return { deletableObjectPaths, deferredObjectPaths, protectedObjectPaths, unrecognizedObjectPaths };
}
