import { redirect } from "next/navigation";
import { Layers } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CatalogManager } from "@/features/catalogs/components/catalog-manager";
import { getCatalogItems, getProductCatalogs } from "@/features/catalogs/queries";
import { requireActiveProfile } from "@/lib/auth/guards";
import { canManageCatalogs } from "@/lib/auth/permissions";

export default async function CatalogsPage() {
  const profile = await requireActiveProfile();
  if (!canManageCatalogs(profile.role)) redirect("/dashboard");

  const [items, productCatalogs] = await Promise.all([getCatalogItems(), getProductCatalogs()]);
  if (!items || !productCatalogs) redirect("/dashboard");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            <Layers aria-hidden="true" className="size-3" /> Administración
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-display sm:text-3xl">Catálogos</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Configurá las opciones que se pueden elegir al crear un pedido. Los catálogos no contienen precios.
          </p>
        </div>
        <Badge className="rounded-full border-border bg-card px-3 py-1.5 text-xs font-normal text-muted-foreground" variant="outline">
          <span className="tabular-nums text-foreground">{items.length + productCatalogs.products.length}</span>
          ítems cargados
        </Badge>
      </header>

      <div className="mt-8">
        <CatalogManager items={items} products={productCatalogs.products} />
      </div>
    </main>
  );
}
