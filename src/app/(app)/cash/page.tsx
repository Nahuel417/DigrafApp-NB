import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CashDashboard, type CashTab, type CashView } from "@/features/cash/components/cash-dashboard";
import { getCashDaySummary, getCurrentCash, listClosedCashDays, shouldLoadCashHistory } from "@/features/cash/queries";
import { requireActiveProfile } from "@/lib/auth/guards";
import { canCloseCash, canOperateCash, canReopenCash } from "@/lib/auth/permissions";

const CASH_PAGE_SIZE = 10;

function normalizeTab(raw: string | undefined): CashTab {
  return raw === "expense" ? "expense" : "income";
}

function normalizeView(raw: string | undefined): CashView {
  return raw === "movements" ? "movements" : "daily";
}

function normalizePage(raw: string | undefined) {
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizeOperationalDate(raw: string | undefined) {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? raw : undefined;
}

export default async function CashPage({ searchParams }: { searchParams: Promise<{ cashDay?: string; date?: string; page?: string; tab?: string; historyPage?: string; view?: string }> }) {
  const profile = await requireActiveProfile();
  const canOperate = canOperateCash(profile);
  if (!canOperate) {
    redirect("/dashboard");
  }

  let summary;
  let closedDays;
  let selectedHistory = null;
  let historyError = false;
  const { cashDay: rawCashDay, date: rawDate, historyPage: rawHistoryPage, page: rawPage, tab: rawTab, view: rawView } = await searchParams;
  const tab = normalizeTab(rawTab);
  const view = normalizeView(rawView);
  const page = normalizePage(rawPage);
  const historyPage = normalizePage(rawHistoryPage);
  const requestedDate = normalizeOperationalDate(rawDate);
  let cashDay = rawCashDay;
  try {
    [summary, closedDays] = await Promise.all([getCurrentCash(), listClosedCashDays()]);
    if (!cashDay && requestedDate && requestedDate !== summary.operationalDate) {
      cashDay = closedDays.find((day) => day.operationalDate === requestedDate)?.cashDayId;
    }
    if (shouldLoadCashHistory(cashDay, summary)) {
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

  const totalPages = Math.max(1, Math.ceil(summary.movements.length / CASH_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const historyTotalPages = selectedHistory ? Math.max(1, Math.ceil(selectedHistory.movements.length / CASH_PAGE_SIZE)) : 1;
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);
  const tabInvalid = rawTab !== undefined && rawTab !== tab;
  const viewInvalid = rawView !== undefined && rawView !== view;
  const pageInvalid = rawPage !== undefined && rawPage !== String(safePage);
  const historyPageInvalid = rawHistoryPage !== undefined && rawHistoryPage !== String(safeHistoryPage);
  if (tabInvalid || viewInvalid || pageInvalid || historyPageInvalid || rawDate !== undefined) {
    const params = new URLSearchParams({ tab, page: String(safePage), view });
    if (cashDay !== undefined) params.set("cashDay", cashDay);
    if (cashDay !== undefined) params.set("historyPage", String(safeHistoryPage));
    redirect(`/cash?${params.toString()}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <p className="text-sm text-muted-foreground">Operaciones</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">{view === "movements" ? "Movimientos" : "Caja diaria"}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{view === "movements" ? "Consultá los movimientos de caja por día operativo." : "Consultá el saldo de hoy y registrá movimientos manuales trazables."}</p>
      </header>
       {historyError ? <Alert variant="destructive"><AlertTitle>No se pudo cargar el historial</AlertTitle><AlertDescription>La caja de hoy sigue disponible. Elegí nuevamente un día cerrado para reintentar la consulta.</AlertDescription></Alert> : null}
       <CashDashboard canClose={canCloseCash(profile.role)} canOperate={canOperate} canReopen={canReopenCash(profile.role)} cashDay={cashDay} closedDays={closedDays} historyPage={safeHistoryPage} page={safePage} requiresVoidReason={profile.role === "attention"} selectedHistory={selectedHistory} summary={summary} tab={tab} view={view} />
    </main>
  );
}
