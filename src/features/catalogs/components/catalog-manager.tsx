"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { CatalogItemForm } from "./catalog-item-form";
import { CatalogItemList } from "./catalog-item-list";
import { CatalogProductManager } from "./catalog-product-manager";
import { catalogItemKinds, catalogManagerKindLabel, catalogManagerKinds, type CatalogItemKind, type CatalogManagerKind, type ProductCatalogKind } from "../schemas";
import type { CatalogCategory, CatalogItem, CatalogProduct } from "../queries";

export function CatalogManager({ categories, items, products, shieldSectionId }: { categories: CatalogCategory[]; items: CatalogItem[]; products: CatalogProduct[]; shieldSectionId: string | null }) {
  const [selectedKind, setSelectedKind] = useState<CatalogManagerKind>("garment");
  const isLegacyKind = catalogItemKinds.includes(selectedKind as CatalogItemKind);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold">Opciones disponibles</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Administrá nombres sin precios. Los moldes superiores y de short/pollera se mantienen separados.
        </p>
      </div>

      <div className="grid lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Tipos de catálogo" className="overflow-x-auto border-b border-border p-3 lg:border-b-0 lg:border-r">
          <div className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col">
            {catalogManagerKinds.map((kind) => {
              const selected = selectedKind === kind;
              return (
                <Button
                  aria-pressed={selected}
                  className="min-h-11 justify-start text-left lg:w-full"
                  key={kind}
                  onClick={() => setSelectedKind(kind)}
                  type="button"
                  variant={selected ? "default" : "ghost"}
                >
                  {catalogManagerKindLabel(kind)}
                </Button>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0 p-5">
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-label text-muted-foreground">Alta rápida</p>
              <h3 className="mt-1 text-lg font-semibold">Nuevo ítem</h3>
              <p className="mt-1 text-sm text-muted-foreground">El nombre queda disponible para los nuevos pedidos cuando lo guardes.</p>
            </div>
             {isLegacyKind ? <><CatalogItemForm key={selectedKind} kind={selectedKind as CatalogItemKind} /><Separator /><div><p className="text-xs font-semibold uppercase tracking-label text-muted-foreground">Listado</p><h3 className="mt-1 text-lg font-semibold">{catalogManagerKindLabel(selectedKind)}</h3></div><CatalogItemList items={items} kind={selectedKind as CatalogItemKind} /></> : <CatalogProductManager categories={categories} kind={selectedKind as ProductCatalogKind} products={products} shieldSectionId={shieldSectionId} />}
          </div>
        </div>
      </div>
    </section>
  );
}
