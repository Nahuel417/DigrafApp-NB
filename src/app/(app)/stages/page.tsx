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
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <p className="text-sm text-muted-foreground">Administración</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Etapas</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Configurá el recorrido operativo del tablero. Las etapas protegidas conservan su código semántico.
        </p>
      </header>

      <WorkflowStageManager stages={stages} />
    </main>
  );
}
