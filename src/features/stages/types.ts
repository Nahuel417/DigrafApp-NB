import type { Database, Tables } from "@/lib/supabase/database.types";

import type { MutationState } from "@/lib/action-state";

export type WorkflowStage = Tables<"workflow_stages">;
export type WorkflowStageEvent = Tables<"workflow_stage_events">;

export type CreateWorkflowStageResult = Database["public"]["Functions"]["create_workflow_stage"]["Returns"][number];
export type RenameWorkflowStageResult = Database["public"]["Functions"]["rename_workflow_stage"]["Returns"][number];

export type WorkflowStageActionState = MutationState & {
  stage?: CreateWorkflowStageResult | RenameWorkflowStageResult;
  eventId?: string;
  stageId?: string;
};
