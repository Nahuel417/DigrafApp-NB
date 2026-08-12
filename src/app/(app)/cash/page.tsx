import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CashDashboard } from "@/features/cash/components/cash-dashboard";
import { getCashDaySummary, getCurrentCash, listClosedCashDays } from "@/features/cash/queries";
import { requireActiveProfile } from "@/lib/auth/guards";
import { canCloseCash, canOperateCash, canReopenCash } from "@/lib/auth/permissions";

export default async function CashPage({ searchParams }: { searchParams: Promise<{ cashDay?: string }> }) {
  const profile = await requireActiveProfile();
  const canOperate = canOperateCash(profile);
  if (!canOperate) {
    redirect("/dashboard");
  }

  let summary;
  let closedDays;
  let selectedHistory = null;
  let historyError = false;
  try {
    const { cashDay } = await searchParams;
    [summary, closedDays] = await Promise.all([getCurrentCash(), listClosedCashDays()]);
    if (cashDay && (cashDay !== summary.cashDayId || Boolean(summary.closedAt))) {
      try {
        selectedHistory = await getCashDaySummary(cashDay);
      } catch {
        historyError = true;
      }
    }
  } catch {
    return (
      <main className="mx-auto flex w-full max-w-[72rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
        <Alert variant="destructive"><AlertTitle>No se pudo cargar la caja</AlertTitle><AlertDescription>Actualizá la pantalla e intentá nuevamente. Si el problema continúa, avisá a administración.</AlertDescription></Alert>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <p className="text-sm text-muted-foreground">Operaciones</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Caja diaria</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Consultá el saldo de hoy y registrá movimientos manuales trazables.</p>
      </header>
       {historyError ? <Alert variant="destructive"><AlertTitle>No se pudo cargar el historial</AlertTitle><AlertDescription>La caja de hoy sigue disponible. Elegí nuevamente un día cerrado para reintentar la consulta.</AlertDescription></Alert> : null}
       <CashDashboard canClose={canCloseCash(profile.role)} canOperate={canOperate} canReopen={canReopenCash(profile.role)} closedDays={closedDays} requiresVoidReason={profile.role === "attention"} selectedHistory={selectedHistory} summary={summary} />
    </main>
  );
}
