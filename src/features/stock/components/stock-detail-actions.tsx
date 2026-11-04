"use client";

import { useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Power, PowerOff, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import { StockOperationForm } from "./stock-operation-form";

type StockDetailOperation = "activate" | "consumption" | "purchase" | "rename";

export type StockDetailOperationKeys = Record<StockDetailOperation, string>;

type StockDetailActionsProps = {
  initialDate: string;
  initialKeys: StockDetailOperationKeys;
  isActive: boolean;
  itemId: string;
  itemName: string;
};

const actionIcons = {
  activate: Power,
  consumption: ArrowUpRight,
  purchase: ArrowDownLeft,
  rename: Save,
};

function actionLabel(action: StockDetailOperation, isActive: boolean) {
  switch (action) {
    case "activate": return isActive ? "Desactivar" : "Reactivar";
    case "consumption": return "Registrar salida";
    case "purchase": return "Registrar compra";
    case "rename": return "Renombrar";
  }
}

export function StockDetailActions({ initialDate, initialKeys, isActive, itemId, itemName }: StockDetailActionsProps) {
  const [activeAction, setActiveAction] = useState<StockDetailOperation | null>(null);
  const [operationPending, setOperationPending] = useState(false);
  const [operationKeys, setOperationKeys] = useState(initialKeys);
  const triggerRefs = useRef<Partial<Record<StockDetailOperation, HTMLButtonElement | null>>>({});
  const panelId = `stock-${itemId}-operation-panel`;
  const headingId = `stock-${itemId}-operation-heading`;
  const actions: StockDetailOperation[] = ["rename", "activate"];
  const operationHeading = activeAction === "activate"
    ? `${actionLabel(activeAction, isActive)} tela`
    : activeAction === "rename"
      ? "Renombrar tela"
      : activeAction === "purchase"
        ? "Registrar compra"
        : activeAction === "consumption"
          ? "Registrar salida"
          : "";

  function closePanel() {
    if (!activeAction) return;
    const closingAction = activeAction;
    setActiveAction(null);
    triggerRefs.current[closingAction]?.focus();
  }

  function handleSuccess(resetKey: string) {
    if (!activeAction) return;
    setOperationKeys((current) => ({ ...current, [activeAction]: resetKey }));
    closePanel();
  }

  return (
    <div className="flex flex-col gap-2">
      <div aria-label="Acciones de tela" className="flex flex-wrap items-center gap-2" role="group">
        {isActive ? (
          <ToggleGroup
            aria-label="Tipo de movimiento"
            className="w-fit gap-0 rounded-xl bg-muted p-1"
            disabled={operationPending}
            onValueChange={(value) => {
              if (!value) closePanel();
              else setActiveAction(value as "purchase" | "consumption");
            }}
            type="single"
            value={activeAction === "purchase" || activeAction === "consumption" ? activeAction : ""}
          >
            {(["purchase", "consumption"] as const).map((action) => {
              const Icon = actionIcons[action];
              return (
                <ToggleGroupItem
                  aria-controls={panelId}
                  className="min-h-10 gap-2 rounded-lg px-4 py-2 text-sm font-normal text-muted-foreground transition-colors duration-150 hover:bg-transparent hover:text-foreground focus-visible:ring-2 focus-visible:ring-offset-2 data-[state=on]:bg-card data-[state=on]:font-medium data-[state=on]:text-foreground data-[state=on]:shadow-xs motion-reduce:transition-none"
                  key={action}
                  ref={(node) => { triggerRefs.current[action] = node; }}
                  size="sm"
                  value={action}
                >
                  <Icon aria-hidden="true" className={action === "purchase" ? "text-success-foreground" : "text-destructive"} data-icon="inline-start" />
                  {action === "purchase" ? "Compra" : "Salida"}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        ) : null}
        {actions.map((action) => {
          const Icon = action === "activate" && isActive ? PowerOff : actionIcons[action];
          const selected = activeAction === action;
          return (
            <Button
              aria-controls={panelId}
              aria-expanded={selected}
              className={cn(
                "group min-h-11 rounded-lg px-3 shadow-none sm:min-h-10",
                selected && action !== "activate" && "text-primary",
                action === "activate" && isActive && "text-destructive hover:bg-destructive/10 hover:text-destructive",
                action === "activate" && !isActive && "text-success-foreground hover:bg-success hover:text-success-foreground",
              )}
              disabled={operationPending}
              key={action}
              onClick={() => {
                if (selected) closePanel();
                else setActiveAction(action);
              }}
              ref={(node) => { triggerRefs.current[action] = node; }}
              type="button"
              variant="ghost"
            >
              <Icon aria-hidden="true" className="transition-transform duration-150 group-hover:scale-110 group-focus-visible:scale-110 group-active:scale-95 motion-reduce:transform-none" data-icon="inline-start" />
              {actionLabel(action, isActive)}
            </Button>
          );
        })}
      </div>

      <section aria-labelledby={headingId} className="rounded-xl border border-border bg-muted/30 p-2.5 sm:p-3" hidden={!activeAction} id={panelId}>
        <header className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium" id={headingId}>{operationHeading}</h3>
          <Button aria-label="Cancelar" className="group min-h-9 px-2.5" disabled={operationPending} onClick={closePanel} type="button" variant="ghost">
            <X aria-hidden="true" className="transition-transform duration-150 group-hover:rotate-90 group-focus-visible:rotate-90 group-active:rotate-0 motion-reduce:transform-none" data-icon="inline-start" />
            Cancelar
          </Button>
        </header>
        {activeAction ? (
          <StockOperationForm
            action={activeAction}
            active={!isActive}
            initialDate={initialDate}
            initialKey={operationKeys[activeAction]}
            itemId={itemId}
            itemName={itemName}
            key={activeAction}
            onPendingChange={setOperationPending}
            onSuccess={handleSuccess}
          />
        ) : null}
      </section>
    </div>
  );
}
