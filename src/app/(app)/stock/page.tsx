import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, Package, Scissors } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { StockDetailActions } from "@/features/stock/components/stock-detail-actions";
import { StockOperationForm } from "@/features/stock/components/stock-operation-form";
import { canManageFabricStock } from "@/features/stock/permissions";
import {
  formatStockDate,
  formatStockDateTime,
  formatStockQuantity,
  getStockHistory,
  listStockItems,
  type StockMovement,
} from "@/features/stock/queries";
import { currentStockDate } from "@/features/stock/schemas";
import { requireActiveProfile } from "@/lib/auth/guards";
import { cn } from "@/lib/utils";

function movementKind(kind: StockMovement["kind"]) {
  switch (kind) {
    case "opening": return "Cantidad inicial";
    case "purchase": return "Compra";
    case "consumption": return "Salida";
    default: throw new Error("El tipo de movimiento de stock no es válido.");
  }
}

function signedQuantity(kind: StockMovement["kind"], quantity: number) {
  const prefix = kind === "consumption" ? "−" : "+";
  return `${prefix}${formatStockQuantity(quantity)} rollos`;
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const profile = await requireActiveProfile();
  const canManage = canManageFabricStock(profile.role);
  const { item: selectedItemId } = await searchParams;
  const operationalDate = currentStockDate();

  let items;
  try {
    items = await listStockItems();
  } catch {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <Alert variant="destructive">
          <AlertTitle>No se pudo cargar el stock</AlertTitle>
          <AlertDescription>Actualizá la pantalla e intentá nuevamente. Si el problema continúa, avisá a administración.</AlertDescription>
        </Alert>
      </main>
    );
  }

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  let history = null;
  let historyError = false;
  if (selectedItem) {
    try {
      history = await getStockHistory(selectedItem.id, canManage);
    } catch {
      historyError = true;
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="grid-paper flex flex-wrap items-end justify-between gap-4 rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-label text-muted-foreground">
            <Package aria-hidden="true" className="size-3" />Control manual de telas
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-display">Stock</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Control manual de telas por rollo. Las compras y salidas no se vinculan con pedidos ni Caja.</p>
        </div>
      </header>

      {canManage ? (
        <section aria-labelledby="stock-create-heading" className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold" id="stock-create-heading">Agregar material</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ingresá el precio por rollo y una cantidad de rollos enteros o medios.</p>
          </div>
          <StockOperationForm action="create" initialDate={operationalDate} initialKey={randomUUID()} />
        </section>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:gap-6">
        <div className="min-w-0">
          <section aria-labelledby="stock-items-heading" className="min-w-0 rounded-3xl border bg-card shadow-sm">
            <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
              <div>
              <h2 className="font-semibold" id="stock-items-heading">Materiales</h2>
              <p className="mt-1 text-sm text-muted-foreground">Saldo y estado actual.</p>
              </div>
              <Badge className="shrink-0 tabular-nums" variant="secondary">{items.length} {items.length === 1 ? "material" : "materiales"}</Badge>
            </header>
            {items.length ? (
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      aria-current={item.id === selectedItem?.id ? "page" : undefined}
                      className={cn(
                        "group relative flex min-h-16 items-center gap-3 px-4 py-3 transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card sm:px-5",
                        item.id === selectedItem?.id
                          ? "bg-primary/5 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary before:content-['']"
                          : "hover:bg-muted/50",
                      )}
                      href={`/stock?item=${item.id}`}
                    >
                      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Scissors className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.name}</span>
                        <span className={cn("mt-1 flex flex-wrap items-baseline gap-x-1.5", item.quantity === 0 || item.quantity === 1 ? "text-destructive" : "text-success-foreground")}>
                          <span className="font-mono text-xl font-semibold leading-tight tabular-nums">{formatStockQuantity(item.quantity)}</span>
                          <span className="text-xs text-muted-foreground">rollos</span>
                        </span>
                      </span>
                      <Badge className="shrink-0 px-2 py-0.5 text-xs" variant={item.is_active ? "active" : "secondary"}>{item.is_active ? "Activa" : "Desactivada"}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-sm text-muted-foreground sm:px-5">Todavía no hay materiales cargados.</p>
            )}
          </section>
        </div>

        <section aria-labelledby="stock-detail-heading" className="min-w-0 rounded-3xl border bg-card shadow-sm">
          {!selectedItem ? (
            <div className="px-5 py-6 sm:px-6">
              <h2 className="font-semibold" id="stock-detail-heading">Detalle de tela</h2>
              <p className="mt-2 text-sm text-muted-foreground">Elegí una tela para consultar sus movimientos y fechas.</p>
            </div>
          ) : (
            <>
              <header className="grid-paper flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-lg font-semibold" id="stock-detail-heading">{selectedItem.name}</h2>
                  <Badge className="shrink-0 px-2 py-0.5 text-xs" variant={selectedItem.is_active ? "active" : "secondary"}>{selectedItem.is_active ? "Activa" : "Desactivada"}</Badge>
                </div>
                <p className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-1", selectedItem.quantity === 0 || selectedItem.quantity === 1 ? "text-destructive" : "text-success-foreground")}>
                  <span className="text-xs font-medium text-muted-foreground">Saldo:</span>{" "}
                  <span className="font-mono text-3xl font-semibold leading-tight tabular-nums">{formatStockQuantity(selectedItem.quantity)}</span>{" "}
                  <span className="text-sm text-muted-foreground">rollos</span>
                </p>
              </header>

              {canManage ? (
                <div className="flex flex-col gap-3 border-b p-4 sm:p-5">
                  <StockDetailActions
                    initialDate={operationalDate}
                    initialKeys={{ activate: randomUUID(), consumption: randomUUID(), purchase: randomUUID(), rename: randomUUID() }}
                    isActive={selectedItem.is_active}
                    itemId={selectedItem.id}
                    itemName={selectedItem.name}
                    key={selectedItem.id}
                  />
                  {!selectedItem.is_active ? (
                    <p className="text-sm text-muted-foreground">La tela está desactivada. Reactivala para registrar compras o salidas.</p>
                  ) : selectedItem.quantity === 0 ? null : (
                    <p className="text-sm text-muted-foreground">Para desactivarla, primero dejá el saldo en cero.</p>
                  )}
                </div>
              ) : null}

              <section aria-labelledby="stock-history-heading" className="p-4 sm:p-5">
                <div className="mb-3">
                  <h3 className="font-semibold" id="stock-history-heading">Movimientos</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Entradas, salidas y anulaciones con sus fechas.</p>
                </div>
                {historyError ? (
                  <Alert variant="destructive">
                    <AlertTitle>No se pudo cargar el historial</AlertTitle>
                    <AlertDescription>Actualizá la pantalla e intentá nuevamente.</AlertDescription>
                  </Alert>
                ) : history?.movements.length ? (
                  <ol className="flex flex-col gap-2">
                    {history.movements.map((movement) => {
                      const cancellation = history.cancellationsByMovementId.get(movement.id);
                      const price = history.pricesByMovementId.get(movement.id);
                      const label = `${movementKind(movement.kind).toLowerCase()} de ${formatStockQuantity(movement.quantity)} rollos del ${formatStockDate(movement.movement_date)}`;
                      return (
                        <li className={cn("flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between", cancellation ? "border-destructive/20 bg-destructive/5" : "border-border bg-card")} key={movement.id}>
                          <div className="flex min-w-0 gap-2.5">
                            <span
                              aria-hidden="true"
                              className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                                cancellation
                                  ? "bg-destructive/10 text-destructive"
                                  : movement.kind === "consumption"
                                    ? "bg-warning text-warning-foreground"
                                    : movement.kind === "purchase"
                                      ? "bg-success text-success-foreground"
                                      : "bg-info text-info-foreground",
                              )}
                            >
                              {movement.kind === "consumption" ? <ArrowUpFromLine className="size-4" /> : <ArrowDownToLine className="size-4" />}
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={cn(
                                  "font-medium",
                                  cancellation
                                    ? "text-muted-foreground line-through"
                                    : movement.kind === "consumption"
                                      ? "text-warning-foreground"
                                      : movement.kind === "purchase"
                                        ? "text-success-foreground"
                                        : "text-info-foreground",
                                )}>{movementKind(movement.kind)}</span>
                                {cancellation ? <Badge className="border-destructive/20 bg-destructive/10 text-destructive" variant="outline">Anulado</Badge> : null}
                              </div>
                              <p className={cn(
                                "font-mono text-sm tabular-nums",
                                cancellation
                                  ? "text-muted-foreground line-through"
                                  : movement.kind === "consumption"
                                    ? "text-warning-foreground"
                                    : movement.kind === "purchase"
                                      ? "text-success-foreground"
                                      : "text-info-foreground",
                              )}>{signedQuantity(movement.kind, movement.quantity)}</p>
                              <p className="text-xs text-muted-foreground">Fecha: {formatStockDate(movement.movement_date)}</p>
                              {price ? <p className="text-xs text-muted-foreground">Precio por rollo: <span className="font-mono tabular-nums">{price}</span></p> : null}
                              {cancellation ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Anulado el {formatStockDateTime(cancellation.created_at)}. Motivo: {cancellation.reason}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          {canManage && selectedItem.is_active && !cancellation ? (
                            <div className="w-full shrink-0 sm:w-auto">
                              <StockOperationForm action="cancel" initialDate={operationalDate} initialKey={randomUUID()} itemId={selectedItem.id} itemName={selectedItem.name} movementId={movement.id} movementLabel={label} />
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay movimientos para mostrar.</p>
                )}
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
