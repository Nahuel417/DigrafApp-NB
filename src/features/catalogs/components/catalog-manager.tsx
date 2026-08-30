"use client";

import { Flag, Layers, Ruler, Scissors, Shield, Shirt, ShoppingBag, Sparkles, Tags } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CatalogItemForm } from "./catalog-item-form";
import { CatalogItemList } from "./catalog-item-list";
import { CatalogProductManager } from "./catalog-product-manager";
import { catalogItemKinds, catalogManagerKindLabel, catalogManagerKinds, type CatalogItemKind, type CatalogManagerKind, type ProductCatalogKind } from "../schemas";
import type { CatalogItem, CatalogProduct } from "../queries";

const catalogKindIcons: Record<CatalogManagerKind, LucideIcon> = {
  garment: Shirt,
  neckline: Tags,
  upper_pattern: Ruler,
  lower_pattern: Scissors,
  fabric: Layers,
  extra: Sparkles,
  flag: Flag,
  bag: ShoppingBag,
  shield: Shield,
};

function catalogKindCount(kind: CatalogManagerKind, items: CatalogItem[], products: CatalogProduct[]) {
  return catalogItemKinds.includes(kind as CatalogItemKind)
    ? items.filter((item) => item.kind === (kind as CatalogItemKind)).length
    : products.filter((product) => product.kind === kind).length;
}

export function CatalogManager({ items, products }: { items: CatalogItem[]; products: CatalogProduct[] }) {
  const [selectedKind, setSelectedKind] = useState<CatalogManagerKind>("garment");
  const isLegacyKind = catalogItemKinds.includes(selectedKind as CatalogItemKind);
  const SelectedIcon = catalogKindIcons[selectedKind];

  return (
    <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Tipos de catálogo" className="h-fit overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-xs md:sticky md:top-6">
        <div className="grid min-w-0 grid-cols-2 gap-1 sm:grid-cols-3 md:flex md:flex-col">
          {catalogManagerKinds.map((kind) => {
            const selected = selectedKind === kind;
            const Icon = catalogKindIcons[kind];
            return (
              <Button
                aria-pressed={selected}
                className={cn(
                  "group flex min-h-11 min-w-0 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-200",
                  selected
                    ? "bg-primary font-medium text-primary-foreground shadow-xs hover:shadow-md"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                key={kind}
                onClick={() => setSelectedKind(kind)}
                type="button"
                variant={selected ? "default" : "ghost"}
              >
                <Icon aria-hidden="true" className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
                <span className="min-w-0 flex-1 leading-tight lg:leading-normal lg:truncate">{catalogManagerKindLabel(kind)}</span>
                <span className={cn("tabular-nums rounded-full px-1.5 text-[11px]", selected ? "bg-primary-foreground/15" : "text-muted-foreground")}>
                  {catalogKindCount(kind, items, products)}
                </span>
              </Button>
            );
          })}
        </div>
      </nav>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
        <div className="grid-paper flex items-center gap-3 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <SelectedIcon aria-hidden="true" />
          </span>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Alta rápida</p>
            <h2 className="text-sm font-semibold tracking-tight">Nuevo ítem · {catalogManagerKindLabel(selectedKind)}</h2>
          </div>
        </div>

        {isLegacyKind ? (
          <>
            <div className="border-b border-border px-4 py-4 sm:px-6 sm:py-5">
              <p className="text-xs text-muted-foreground">El nombre queda disponible para los nuevos pedidos cuando lo guardes.</p>
              <div className="mt-4">
                <CatalogItemForm key={selectedKind} kind={selectedKind as CatalogItemKind} />
              </div>
            </div>
            <div className="px-4 py-4 sm:px-6 sm:py-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Listado</p>
              <h3 className="mt-1 text-sm font-semibold tracking-tight">{catalogManagerKindLabel(selectedKind)}</h3>
              <div className="mt-4">
                <CatalogItemList items={items} kind={selectedKind as CatalogItemKind} />
              </div>
            </div>
          </>
        ) : (
          <CatalogProductManager kind={selectedKind as ProductCatalogKind} products={products} />
        )}
      </section>
    </div>
  );
}
