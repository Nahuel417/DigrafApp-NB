import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canManageStages } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import type { WorkflowStage, WorkflowStageEvent } from "./types";

async function currentStageManager() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.isActive || profile.mustChangePassword || !canManageStages(profile.role)) return null;
  return profile;
}

export async function getWorkflowStages(): Promise<WorkflowStage[] | null> {
  if (!await currentStageManager()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_stages")
    .select("id, code, name, position, is_active, created_at, updated_at")
    .order("is_active", { ascending: false })
    .order("position")
    .order("id");

  if (error) throw new Error("No se pudieron cargar las etapas.");
  return data;
}

export async function getWorkflowStageEvents(): Promise<WorkflowStageEvent[] | null> {
  if (!await currentStageManager()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_stage_events")
    .select("id, workflow_stage_id, actor_id, action, details, idempotency_key, idempotency_fingerprint, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw new Error("No se pudo cargar el historial de etapas.");
  return data;
}
