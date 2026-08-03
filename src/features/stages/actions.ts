"use server";

import { revalidatePath } from "next/cache";

import { mutationResult } from "@/lib/action-state";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canManageStages } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { workflowStageErrorMessage } from "./errors";
import {
  createWorkflowStageSchema,
  renameWorkflowStageSchema,
  reorderWorkflowStagesSchema,
  retireWorkflowStageSchema,
} from "./schemas";
import type { WorkflowStageActionState } from "./types";

function formValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function formValues(formData: FormData, name: string) {
  const values = formData.getAll(name).map(String);
  if (values.length !== 1) return values;

  try {
    const parsed: unknown = JSON.parse(values[0]!);
    return Array.isArray(parsed) ? parsed.map(String) : values;
  } catch {
    return values;
  }
}

async function currentStageManager() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canManageStages(profile.role)) return null;
  return profile;
}

function invalidStageRequest(message: string, fieldErrors?: Record<string, string[] | undefined>) {
  return mutationResult("error", message, fieldErrors);
}

export async function createWorkflowStageAction(
  _previous: WorkflowStageActionState,
  formData: FormData,
): Promise<WorkflowStageActionState> {
  const parsed = createWorkflowStageSchema.safeParse({ name: formValue(formData, "name"), idempotencyKey: formValue(formData, "idempotencyKey") });
  if (!parsed.success) return invalidStageRequest(parsed.error.issues[0]?.message ?? "Revisá los datos de la etapa.", parsed.error.flatten().fieldErrors);
  if (!await currentStageManager()) return invalidStageRequest("No tenés permiso para administrar etapas.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workflow_stage", {
    p_name: parsed.data.name,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) return invalidStageRequest(workflowStageErrorMessage(error.message));

  const stage = data?.[0];
  if (!stage) return invalidStageRequest("La creación de etapa no devolvió un resultado válido.");

  revalidatePath("/orders");
  return { ...mutationResult("success", "Etapa creada correctamente."), stage, resetKey: crypto.randomUUID() };
}

export async function renameWorkflowStageAction(
  _previous: WorkflowStageActionState,
  formData: FormData,
): Promise<WorkflowStageActionState> {
  const parsed = renameWorkflowStageSchema.safeParse({
    stageId: formValue(formData, "stageId"),
    name: formValue(formData, "name"),
    expectedUpdatedAt: formValue(formData, "expectedUpdatedAt"),
    idempotencyKey: formValue(formData, "idempotencyKey"),
  });
  if (!parsed.success) return invalidStageRequest(parsed.error.issues[0]?.message ?? "Revisá el nombre de la etapa.", parsed.error.flatten().fieldErrors);
  if (!await currentStageManager()) return invalidStageRequest("No tenés permiso para administrar etapas.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rename_workflow_stage", {
    p_stage_id: parsed.data.stageId,
    p_name: parsed.data.name,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) return invalidStageRequest(workflowStageErrorMessage(error.message));

  const stage = data?.[0];
  if (!stage) return invalidStageRequest("El renombrado no devolvió un resultado válido.");

  revalidatePath("/orders");
  return { ...mutationResult("success", "Etapa renombrada correctamente."), stage };
}

export async function reorderWorkflowStagesAction(
  _previous: WorkflowStageActionState,
  formData: FormData,
): Promise<WorkflowStageActionState> {
  const parsed = reorderWorkflowStagesSchema.safeParse({
    stageIds: formValues(formData, "stageIds"),
    expectedStageIds: formValues(formData, "expectedStageIds"),
    idempotencyKey: formValue(formData, "idempotencyKey"),
  });
  if (!parsed.success) return invalidStageRequest(parsed.error.issues[0]?.message ?? "Revisá el orden de las etapas.", parsed.error.flatten().fieldErrors);
  if (!await currentStageManager()) return invalidStageRequest("No tenés permiso para administrar etapas.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reorder_workflow_stages", {
    p_stage_ids: parsed.data.stageIds,
    p_expected_stage_ids: parsed.data.expectedStageIds,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) return invalidStageRequest(workflowStageErrorMessage(error.message));

  const result = data?.[0];
  if (!result) return invalidStageRequest("El reordenamiento no devolvió un resultado válido.");

  revalidatePath("/orders");
  return { ...mutationResult("success", "Etapas reordenadas correctamente."), eventId: result.event_id };
}

export async function retireWorkflowStageAction(
  _previous: WorkflowStageActionState,
  formData: FormData,
): Promise<WorkflowStageActionState> {
  const parsed = retireWorkflowStageSchema.safeParse({
    stageId: formValue(formData, "stageId"),
    expectedUpdatedAt: formValue(formData, "expectedUpdatedAt"),
    idempotencyKey: formValue(formData, "idempotencyKey"),
  });
  if (!parsed.success) return invalidStageRequest(parsed.error.issues[0]?.message ?? "Revisá el retiro de la etapa.", parsed.error.flatten().fieldErrors);
  if (!await currentStageManager()) return invalidStageRequest("No tenés permiso para administrar etapas.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("retire_workflow_stage", {
    p_stage_id: parsed.data.stageId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) return invalidStageRequest(workflowStageErrorMessage(error.message));

  const result = data?.[0];
  if (!result) return invalidStageRequest("El retiro no devolvió un resultado válido.");

  revalidatePath("/orders");
  return { ...mutationResult("success", "Etapa retirada correctamente."), stageId: result.stage_id, eventId: result.event_id };
}
