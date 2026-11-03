import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Package } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { StockOperationForm } from "@/features/stock/components/stock-operation-form";
import { canManageFabricStock } from "@/features/stock/permissions";
import {
  formatStockDate,
  formatStockDateTime,
  formatStockQuantity,
  getStockHistory,
  listStockItems,
} from "@/features/stock/queries";
import { currentStockDate } from "@/features/stock/schemas";
import { requireActiveProfile } from "@/lib/auth/guards";

function movementKind(kind: "opening" | "purchase" | "consumption") {
  switch (kind) {
    case "opening": return "Cantidad inicial";
    case "purchase": return "Compra";
    case "consumption": return "Salida";
  }
}

function signedQuantity(kind: "opening" | "purchase" | "consumption", quantity: number) {
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-label text-muted-foreground">
            <Package aria-hidden="true" className="size-3" />Operaciones
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-display">Stock</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Control manual de telas por rollo. Las compras y salidas no se vinculan con pedidos ni Caja.</p>
        </div>
      </header>

      {canManage ? (
        <section aria-labelledby="stock-create-heading" className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold" id="stock-create-heading">Agregar material</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ingresá el precio por rollo y una cantidad de rollos enteros o medios.</p>
          </div>
          <StockOperationForm action="create" initialDate={operationalDate} initialKey={randomUUID()} />
        </section>
      ) : null}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(15rem,0.7fr)_minmax(0,1.6fr)]">
        <section aria-labelledby="stock-items-heading" className="min-w-0 rounded-xl border bg-card">
          <header className="border-b px-4 py-3 sm:px-5">
              <h2 className="font-semibold" id="stock-items-heading">Materiales</h2>
            <p className="mt-1 text-sm text-muted-foreground">Saldo y estado actual.</p>
          </header>
          {items.length ? (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    aria-current={item.id === selectedItem?.id ? "page" : undefined}
                    className={`flex min-h-16 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5 ${item.id === selectedItem?.id ? "bg-muted/50" : ""}`}
                    href={`/stock?item=${item.id}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{item.name}</span>
                      <span className="mt-1 block font-mono text-sm tabular-nums text-muted-foreground">{formatStockQuantity(item.quantity)} rollos</span>
                    </span>
                    <Badge variant={item.is_active ? "outline" : "secondary"}>{item.is_active ? "Activa" : "Desactivada"}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-5 text-sm text-muted-foreground sm:px-5">Todavía no hay materiales cargados.</p>
          )}
        </section>

        <section aria-labelledby="stock-detail-heading" className="min-w-0 rounded-xl border bg-card">
          {!selectedItem ? (
            <div className="px-4 py-5 sm:px-5">
              <h2 className="font-semibold" id="stock-detail-heading">Detalle de tela</h2>
              <p className="mt-2 text-sm text-muted-foreground">Elegí una tela para consultar sus movimientos y fechas.</p>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold" id="stock-detail-heading">{selectedItem.name}</h2>
                  <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">Saldo: {formatStockQuantity(selectedItem.quantity)} rollos</p>
                </div>
                <Badge variant={selectedItem.is_active ? "outline" : "secondary"}>{selectedItem.is_active ? "Activa" : "Desactivada"}</Badge>
              </header>

              {canManage ? (
                <div className="flex flex-col gap-6 border-b p-4 sm:p-5">
                  {selectedItem.is_active ? (
                    <section aria-labelledby="stock-operation-heading">
                      <h3 className="mb-3 font-medium" id="stock-operation-heading">Compras y consumo</h3>
                      <StockOperationForm action="purchase" allowMovementSelection availableQuantity={selectedItem.quantity} initialDate={operationalDate} initialKey={randomUUID()} itemId={selectedItem.id} itemName={selectedItem.name} />
                    </section>
                  ) : (
                    <p className="text-sm text-muted-foreground">La tela está desactivada. Reactivala para registrar compras o salidas.</p>
                  )}
                  <div className="grid gap-6 border-t pt-5 sm:grid-cols-2">
                    <section aria-labelledby="stock-rename-heading">
                      <h3 className="mb-3 font-medium" id="stock-rename-heading">Renombrar tela</h3>
                      <StockOperationForm action="rename" initialDate={operationalDate} initialKey={randomUUID()} itemId={selectedItem.id} itemName={selectedItem.name} />
                    </section>
                    <section aria-labelledby="stock-active-heading">
                      <h3 className="mb-3 font-medium" id="stock-active-heading">Estado</h3>
                      <StockOperationForm action="activate" active={!selectedItem.is_active} initialDate={operationalDate} initialKey={randomUUID()} itemId={selectedItem.id} itemName={selectedItem.name} />
                      {!selectedItem.is_active ? null : selectedItem.quantity === 0 ? null : <p className="mt-2 text-sm text-muted-foreground">Para desactivarla, primero dejá el saldo en cero.</p>}
                    </section>
                  </div>
                </div>
              ) : null}

              <section aria-labelledby="stock-history-heading" className="p-4 sm:p-5">
                <div className="mb-4">
                  <h3 className="font-semibold" id="stock-history-heading">Movimientos</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Entradas, salidas y anulaciones con sus fechas.</p>
                </div>
                {historyError ? (
                  <Alert variant="destructive">
                    <AlertTitle>No se pudo cargar el historial</AlertTitle>
                    <AlertDescription>Actualizá la pantalla e intentá nuevamente.</AlertDescription>
                  </Alert>
                ) : history?.movements.length ? (
                  <ol className="divide-y">
                    {history.movements.map((movement) => {
                      const cancellation = history.cancellationsByMovementId.get(movement.id);
                      const price = history.pricesByMovementId.get(movement.id);
                      const label = `${movementKind(movement.kind).toLowerCase()} de ${formatStockQuantity(movement.quantity)} rollos del ${formatStockDate(movement.movement_date)}`;
                      return (
                        <li className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between" key={movement.id}>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{movementKind(movement.kind)}</span>
                              {cancellation ? <Badge variant="destructive">Anulado</Badge> : null}
                            </div>
                            <p className="mt-1 font-mono text-sm tabular-nums">{signedQuantity(movement.kind, movement.quantity)}</p>
                            <p className="mt-1 text-sm text-muted-foreground">Fecha: {formatStockDate(movement.movement_date)}</p>
                            {price ? <p className="mt-1 text-sm text-muted-foreground">Precio por rollo: <span className="font-mono tabular-nums">{price}</span></p> : null}
                            {cancellation ? (
                              <p className="mt-2 text-sm text-muted-foreground">
                                Anulado el {formatStockDateTime(cancellation.created_at)}. Motivo: {cancellation.reason}
                              </p>
                            ) : null}
                          </div>
                          {canManage && selectedItem.is_active && !cancellation ? (
                            <div className="w-full shrink-0 sm:max-w-xs">
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
