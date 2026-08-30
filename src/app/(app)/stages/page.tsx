import { Layers, ListChecks } from "lucide-react";
import { redirect } from "next/navigation";

import { WorkflowStageManager } from "@/features/stages/components/workflow-stage-manager";
import { getWorkflowStages } from "@/features/stages/queries";
import { requireActiveProfile } from "@/lib/auth/guards";
import { canManageStages } from "@/lib/auth/permissions";

export default async function StagesPage() {
  const profile = await requireActiveProfile();
  if (!canManageStages(profile.role)) redirect("/dashboard");

  const stages = await getWorkflowStages();
  if (!stages) redirect("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-label text-muted-foreground">
            <Layers aria-hidden="true" className="size-3" /> Administración
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-display">Etapas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Configurá el recorrido operativo del tablero. Las etapas protegidas conservan su código semántico.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-3 py-1.5 text-xs font-medium text-success-foreground">
            <ListChecks aria-hidden="true" className="size-3" /> {stages.filter((stage) => stage.is_active).length} activas
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            {stages.filter((stage) => !stage.is_active).length} retiradas
          </span>
        </div>
      </header>

      <WorkflowStageManager stages={stages} />
    </main>
  );
}
