"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import type { OrderQuickView } from "../actions";

function formatOrderNumber(publicNumber: number) {
  return `PED-${String(publicNumber).padStart(6, "0")}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Cordoba" }).format(new Date(value));
}

export function OrderQuickView({ data, onClose, stageNames }: { data: OrderQuickView; onClose: () => void; stageNames: Record<string, string> }) {
  const detailPath = `/orders/${data.id}`;
  const editPath = `${detailPath}#${data.canEditSensitive ? "edit-order" : "order-description"}`;
  const movement = data.lastMovement
    ? `Movido de ${data.lastMovement.fromStageId ? stageNames[data.lastMovement.fromStageId] ?? "una etapa no disponible" : "inicio"} a ${data.lastMovement.toStageId ? stageNames[data.lastMovement.toStageId] ?? "una etapa no disponible" : "una etapa no disponible"}`
    : "Todavía no hay movimientos registrados.";

  return (
    <aside aria-label={`Vista rápida de ${formatOrderNumber(data.publicNumber)}`} className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold tracking-data text-muted-foreground">{formatOrderNumber(data.publicNumber)}</p>
          <h2 className="mt-1 break-words text-lg font-semibold">{data.customerName}</h2>
        </div>
        <Button aria-label="Cerrar vista rápida" data-no-drag="true" onClick={onClose} size="icon" type="button" variant="ghost"><X aria-hidden="true" /></Button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2"><Badge variant="outline">{data.stageName}</Badge><span className="text-sm text-muted-foreground">{data.quantity} unidades · {data.orderType === "set" ? "Conjunto" : "Prenda individual"}</span></div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Entrega prometida</dt><dd className="mt-1 font-mono text-sm font-medium">{formatDate(data.promisedDeliveryDate)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Descripción</dt><dd className="mt-1 text-sm">{data.description?.trim() || "Sin descripción."}</dd></div>
      </dl>
      <section className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Último movimiento</h3>
        <p className="mt-2 text-sm">{movement}</p>
        {data.lastMovement ? <p className="mt-1 text-xs text-muted-foreground">{data.lastMovement.actor} · {formatDateTime(data.lastMovement.occurredAt)}</p> : null}
      </section>
      <section className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Comentarios recientes</h3>
        {data.comments.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Todavía no hay comentarios.</p> : <ul className="mt-3 flex flex-col gap-3">{data.comments.map((comment) => <li className="text-sm" key={comment.id}><p className="font-medium">{comment.actor} <span className="font-mono text-xs font-normal text-muted-foreground">{formatDateTime(comment.occurredAt)}</span></p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{comment.body}</p></li>)}</ul>}
      </section>
      <div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-4">
        <Button asChild data-no-drag="true" variant="outline"><Link href={detailPath}>Ver detalle <ArrowRight data-icon="inline-end" /></Link></Button>
        {data.canEditDescription ? <Button asChild data-no-drag="true"><Link href={editPath}>Editar pedido</Link></Button> : null}
      </div>
    </aside>
  );
}
