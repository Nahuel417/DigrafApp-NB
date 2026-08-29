"use client";

import { Eye, PencilLine } from "lucide-react";
import { createContext, useContext, useState } from "react";

import { cn } from "@/lib/utils";

type Tab = "details" | "edit";

const OrderDetailTabContext = createContext<{ activeTab: Tab; setActiveTab: (tab: Tab) => void } | null>(null);

function useOrderDetailTab() {
  const context = useContext(OrderDetailTabContext);
  if (!context) throw new Error("Order detail tab components must be nested inside OrderDetailTabs.");
  return context;
}

export function OrderDetailTabs({ children, initialTab = "details" }: { children: React.ReactNode; initialTab?: Tab }) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  return <OrderDetailTabContext value={{ activeTab, setActiveTab }}><div className="min-w-0">{children}</div></OrderDetailTabContext>;
}

export function OrderDetailTabList({ showEdit }: { showEdit: boolean }) {
  const { activeTab, setActiveTab } = useOrderDetailTab();
  const tabClassName = (active: boolean) => cn(
    "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    active ? "bg-card font-medium text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
  );

  return (
    <div aria-label="Vista del pedido" className="inline-flex rounded-xl border border-border bg-surface-muted p-1" role="tablist">
      <button aria-controls="order-detail-panel-details" aria-selected={activeTab === "details"} className={tabClassName(activeTab === "details")} id="order-detail-tab-details" onClick={() => setActiveTab("details")} role="tab" type="button">
        <Eye aria-hidden="true" className="size-4" />
        Detalles
      </button>
      {showEdit ? (
        <button aria-controls="edit-order" aria-selected={activeTab === "edit"} className={tabClassName(activeTab === "edit")} id="order-detail-tab-edit" onClick={() => setActiveTab("edit")} role="tab" type="button">
          <PencilLine aria-hidden="true" className="size-4" />
          Editar
        </button>
      ) : null}
    </div>
  );
}

export function OrderDetailTabPanel({ children, className, id, tab }: { children: React.ReactNode; className?: string; id?: string; tab: Tab }) {
  const { activeTab } = useOrderDetailTab();
  return (
    <div aria-labelledby={`order-detail-tab-${tab}`} className={activeTab === tab ? className : "hidden"} id={id ?? `order-detail-panel-${tab}`} role="tabpanel">
      {children}
    </div>
  );
}
