import { z } from "zod";

const stageId = z.string().uuid("La etapa seleccionada no es válida.");
const idempotencyKey = z.string().trim().min(1, "La solicitud de etapa no es válida.").max(200, "La solicitud de etapa no es válida.");
const expectedUpdatedAt = z.string().datetime({ offset: true, message: "La versión de la etapa no es válida." });
const stageName = z.string().trim().min(2, "El nombre debe tener entre 2 y 80 caracteres.").max(80, "El nombre debe tener entre 2 y 80 caracteres.");

export const createWorkflowStageSchema = z.object({
  name: stageName,
  idempotencyKey,
});

export const renameWorkflowStageSchema = z.object({
  stageId,
  name: stageName,
  expectedUpdatedAt,
  idempotencyKey,
});

export const reorderWorkflowStagesSchema = z
  .object({
    stageIds: z.array(stageId).min(1, "Seleccioná al menos una etapa."),
    expectedStageIds: z.array(stageId).min(1, "La versión de las etapas no es válida."),
    idempotencyKey,
  })
  .superRefine((value, context) => {
    if (new Set(value.stageIds).size !== value.stageIds.length) {
      context.addIssue({ code: "custom", path: ["stageIds"], message: "No se puede repetir una etapa." });
    }

    if (new Set(value.expectedStageIds).size !== value.expectedStageIds.length) {
      context.addIssue({ code: "custom", path: ["expectedStageIds"], message: "La versión de las etapas no es válida." });
    }

    if (value.stageIds.length !== value.expectedStageIds.length) {
      context.addIssue({ code: "custom", path: ["stageIds"], message: "El reordenamiento debe incluir las mismas etapas." });
    }
  });

export const retireWorkflowStageSchema = z.object({
  stageId,
  expectedUpdatedAt,
  idempotencyKey,
});

export type CreateWorkflowStageValues = z.infer<typeof createWorkflowStageSchema>;
export type RenameWorkflowStageValues = z.infer<typeof renameWorkflowStageSchema>;
export type ReorderWorkflowStagesValues = z.infer<typeof reorderWorkflowStagesSchema>;
export type RetireWorkflowStageValues = z.infer<typeof retireWorkflowStageSchema>;
