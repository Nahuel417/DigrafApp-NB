import { redirect } from "next/navigation";

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
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <p className="text-sm text-muted-foreground">Administración</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Catálogos</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Configurá las opciones que se pueden elegir al crear un pedido. Los catálogos no contienen precios.
        </p>
      </header>

      <CatalogManager categories={productCatalogs.categories} items={items} products={productCatalogs.products} shieldSectionId={productCatalogs.shieldSectionId} />
    </main>
  );
}
