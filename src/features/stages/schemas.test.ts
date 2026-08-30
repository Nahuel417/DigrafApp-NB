import { describe, expect, it } from "vitest";

import {
  createWorkflowStageSchema,
  renameWorkflowStageSchema,
  reorderWorkflowStagesSchema,
  retireWorkflowStageSchema,
} from "./schemas";

const stageId = "11111111-1111-4111-8111-111111111111";
const secondStageId = "22222222-2222-4222-8222-222222222222";
const version = "2026-08-02T03:00:00.000Z";

describe("workflow stage schemas", () => {
  it("accepts the create and rename RPC contracts", () => {
    expect(createWorkflowStageSchema.safeParse({ name: "Diseño final", idempotencyKey: "create-1" }).success).toBe(true);
    expect(renameWorkflowStageSchema.safeParse({ stageId, name: "Diseño final", expectedUpdatedAt: version, idempotencyKey: "rename-1" }).success).toBe(true);
  });

  it("requires valid names, versions and idempotency keys", () => {
    expect(createWorkflowStageSchema.safeParse({ name: "x", idempotencyKey: "create-1" }).success).toBe(false);
    expect(renameWorkflowStageSchema.safeParse({ stageId, name: "Etapa", expectedUpdatedAt: "ayer", idempotencyKey: "rename-1" }).success).toBe(false);
    expect(retireWorkflowStageSchema.safeParse({ stageId, expectedUpdatedAt: version, idempotencyKey: "" }).success).toBe(false);
  });

  it("accepts a complete reorder and rejects duplicate or incomplete payloads", () => {
    const reorder = { stageIds: [stageId, secondStageId], expectedStageIds: [secondStageId, stageId], idempotencyKey: "reorder-1" };
    expect(reorderWorkflowStagesSchema.safeParse(reorder).success).toBe(true);
    expect(reorderWorkflowStagesSchema.safeParse({ ...reorder, stageIds: [stageId, stageId] }).success).toBe(false);
    expect(reorderWorkflowStagesSchema.safeParse({ ...reorder, expectedStageIds: [stageId] }).success).toBe(false);
  });
});
