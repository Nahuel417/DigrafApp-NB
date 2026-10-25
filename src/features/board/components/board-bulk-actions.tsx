"use client";

import { AlertCircle, Archive, Ban, CheckCheck, X } from "lucide-react";
import { useState } from "react";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { formatOrderNumber } from "@/features/orders/detail-format";

import type { BoardOrder } from "../queries";

export type BoardBulkLifecycleAction = "archive" | "cancel";

export type BoardBulkActionResult = {
  message: string;
  orderId: string;
  publicNumber: number;
  status: "success" | "error";
};

export function BoardBulkActions({
  archivableOrderCount,
  cancelBlockedReason = null,
  isPending,
  onClearSelection,
  onConfirm,
  results,
  selectedOrders,
}: {
  archivableOrderCount: number;
  cancelBlockedReason?: string | null;
  isPending: boolean;
  onClearSelection: () => void;
  onConfirm: (action: BoardBulkLifecycleAction, reason: string) => Promise<void>;
  results: BoardBulkActionResult[];
  selectedOrders: BoardOrder[];
}) {
  const [activeAction, setActiveAction] = useState<BoardBulkLifecycleAction | null>(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pending = isPending || isSubmitting;
  const cancellationBlocked = Boolean(cancelBlockedReason);
  const isReasonValid = reason.trim().length >= 2 && reason.trim().length <= 500;
  const failedResults = results.filter((result) => result.status === "error");

  function handleOpenChange(action: BoardBulkLifecycleAction, open: boolean) {
    if (pending || (action === "cancel" && open && cancellationBlocked)) return;
    setActiveAction(open ? action : null);
    if (!open || action === "cancel") setReason("");
  }

  async function confirmAction(action: BoardBulkLifecycleAction) {
    if (pending || (action === "archive" && archivableOrderCount === 0) || (action === "cancel" && (cancellationBlocked || !isReasonValid))) return;
    setIsSubmitting(true);
    try {
      await onConfirm(action, action === "cancel" ? reason.trim() : "");
      setActiveAction(null);
      setReason("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {selectedOrders.length > 0 ? (
        <div aria-label="Acciones para pedidos seleccionados" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2" role="group">
          <p className="mr-auto inline-flex items-center gap-2 text-xs font-medium text-foreground"><span className="flex size-7 items-center justify-center rounded-lg bg-surface-muted text-primary"><CheckCheck aria-hidden="true" className="size-4" /></span>{selectedOrders.length} {selectedOrders.length === 1 ? "pedido seleccionado" : "pedidos seleccionados"}</p>
          <AlertDialog onOpenChange={(open) => handleOpenChange("archive", open)} open={activeAction === "archive"}>
            <AlertDialogTrigger asChild>
              <Button className="h-11 rounded-lg px-3 text-xs shadow-none lg:h-9" disabled={pending || archivableOrderCount === 0} type="button" variant="outline">
                <Archive aria-hidden="true" className="size-3.5" data-icon="inline-start" />
                Archivar entregados ({archivableOrderCount})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archivar pedidos entregados</AlertDialogTitle>
                <AlertDialogDescription>
                  Solo se archivarán los pedidos de la etapa Entregado. Los demás pedidos seleccionados permanecerán en el tablero. El archivo conserva sus datos y se puede retirar.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
                <Button disabled={pending || archivableOrderCount === 0} onClick={() => void confirmAction("archive")} type="button">
                  <Archive aria-hidden="true" data-icon="inline-start" />
                  {pending ? "Archivando..." : "Confirmar archivo"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog onOpenChange={(open) => handleOpenChange("cancel", open)} open={activeAction === "cancel"}>
            <AlertDialogTrigger asChild>
              <Button aria-describedby={cancellationBlocked ? "board-bulk-cancel-disabled-reason" : undefined} className="h-11 rounded-lg border border-destructive/25 px-3 text-xs text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive lg:h-9" disabled={pending || cancellationBlocked} type="button" variant="outline">
                <Ban aria-hidden="true" className="size-3.5" data-icon="inline-start" />
                Anular pedidos ({selectedOrders.length})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Anular pedidos seleccionados</AlertDialogTitle>
                <AlertDialogDescription>
                  Los pedidos saldrán del tablero y quedarán en el Archivo durante 30 días, donde podrán restaurarse. Se conservarán sus relaciones, finanzas e imágenes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {cancelBlockedReason ? <p className="text-sm text-muted-foreground" role="alert">{cancelBlockedReason}</p> : null}
              <Field>
                <FieldLabel htmlFor="board-bulk-cancel-reason">Motivo de anulación para todos los pedidos</FieldLabel>
                <Textarea
                  id="board-bulk-cancel-reason"
                  maxLength={500}
                  minLength={2}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  rows={4}
                  value={reason}
                />
                <FieldDescription>Entre 2 y 500 caracteres. Se guardará en el historial de cada pedido.</FieldDescription>
              </Field>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
                <Button disabled={pending || cancellationBlocked || !isReasonValid} onClick={() => void confirmAction("cancel")} type="button" variant="destructive">
                  <Ban aria-hidden="true" data-icon="inline-start" />
                  {pending ? "Anulando..." : "Confirmar anulación"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button aria-label="Limpiar selección" className="size-11 shrink-0 rounded-lg text-muted-foreground lg:size-9" disabled={pending} onClick={onClearSelection} title="Limpiar selección" type="button" variant="ghost"><X aria-hidden="true" className="size-4" /></Button>
          {cancelBlockedReason ? <p className="w-full text-xs text-muted-foreground" id="board-bulk-cancel-disabled-reason">{cancelBlockedReason}</p> : null}
        </div>
      ) : null}
      {failedResults.length > 0 ? (
        <div aria-label="Resultados de acciones masivas" className="flex flex-col gap-2" role="region">
          {failedResults.map((result) => (
            <div className="flex w-fit max-w-full items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-foreground" key={result.orderId} role="alert">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"><AlertCircle aria-hidden="true" className="size-3.5" /></span>
              <p className="min-w-0 self-center leading-5"><span className="mr-2 font-mono font-medium text-destructive">{formatOrderNumber(result.publicNumber)}</span>{result.message}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
