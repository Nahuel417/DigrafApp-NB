"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

import {
  createCatalogCategoryAction,
  createCatalogProductAction,
  renameCatalogCategoryAction,
  renameCatalogProductAction,
  setCatalogCategoryActiveAction,
  setCatalogProductActiveAction,
  type CatalogActionState,
} from "../actions";
import type { CatalogCategory, CatalogProduct } from "../queries";
import { productCatalogKindLabels, type ProductCatalogKind } from "../schemas";

const initialState: CatalogActionState = {};

function Feedback({ state }: { state: CatalogActionState }) {
  return state.message ? <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-success-foreground"}>{state.message}</p> : null;
}

function ProductRow({ product }: { product: CatalogProduct }) {
  const [renameState, renameAction] = useActionState(renameCatalogProductAction, initialState);
  const [activeState, activeAction] = useActionState(setCatalogProductActiveAction, initialState);
  return <li className="rounded-lg border border-border p-4">
    <form action={renameAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input name="itemId" type="hidden" value={product.id} />
      <Field className="min-w-0 flex-1"><FieldLabel className="sr-only" htmlFor={`product-${product.id}`}>Nombre de {product.name}</FieldLabel><Input defaultValue={product.name} id={`product-${product.id}`} name="name" /></Field>
      <SubmitButton pendingLabel="Renombrando" variant="outline">Renombrar</SubmitButton>
    </form>
    <form action={activeAction} className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
      <input name="itemId" type="hidden" value={product.id} /><input name="isActive" type="hidden" value={String(!product.is_active)} />
      <span className="text-sm text-muted-foreground">{product.is_active ? "Activo" : "Inactivo"}</span><SubmitButton pendingLabel={product.is_active ? "Desactivando" : "Activando"} variant="outline">{product.is_active ? "Desactivar" : "Activar"}</SubmitButton>
    </form>
    <Feedback state={renameState.status === "error" ? renameState : activeState} />
  </li>;
}

function CategoryManager({ categories }: { categories: CatalogCategory[] }) {
  const [createState, createAction] = useActionState(createCatalogCategoryAction, initialState);
  return <section className="rounded-lg border border-border bg-muted/20 p-4">
    <h4 className="font-semibold">Categorías de escudos</h4>
    <form action={createAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"><Field className="min-w-0 flex-1"><FieldLabel htmlFor="shield-category-name">Nueva categoría</FieldLabel><Input id="shield-category-name" name="name" required /></Field><SubmitButton pendingLabel="Agregando categoría">Agregar categoría</SubmitButton></form>
    <Feedback state={createState} />
    <ul className="mt-4 flex flex-col gap-3">{categories.map((category) => <CategoryRow category={category} key={category.id} />)}</ul>
  </section>;
}

function CategoryRow({ category }: { category: CatalogCategory }) {
  const [renameState, renameAction] = useActionState(renameCatalogCategoryAction, initialState);
  const [activeState, activeAction] = useActionState(setCatalogCategoryActiveAction, initialState);
  return <li className="rounded-md border border-border bg-card p-3"><form action={renameAction} className="flex flex-col gap-2 sm:flex-row sm:items-end"><input name="itemId" type="hidden" value={category.id} /><Field className="min-w-0 flex-1"><FieldLabel className="sr-only" htmlFor={`category-${category.id}`}>Nombre de {category.name}</FieldLabel><Input defaultValue={category.name} id={`category-${category.id}`} name="name" /></Field><SubmitButton pendingLabel="Renombrando" variant="outline">Renombrar</SubmitButton></form><form action={activeAction} className="mt-2 flex items-center justify-between"><input name="itemId" type="hidden" value={category.id} /><input name="isActive" type="hidden" value={String(!category.is_active)} /><span className="text-xs text-muted-foreground">{category.is_active ? "Activa" : "Inactiva"}</span><SubmitButton pendingLabel={category.is_active ? "Desactivando" : "Activando"} variant="outline">{category.is_active ? "Desactivar" : "Activar"}</SubmitButton></form><Feedback state={renameState.status === "error" ? renameState : activeState} /></li>;
}

export function CatalogProductManager({ categories, kind, products, shieldSectionId }: { categories: CatalogCategory[]; kind: ProductCatalogKind; products: CatalogProduct[]; shieldSectionId: string | null }) {
  const [state, action] = useActionState(createCatalogProductAction, initialState);
  const visibleProducts = products.filter((product) => product.kind === kind);
  const shieldCategories = categories.filter((category) => category.section_id === shieldSectionId);
  return <div className="flex flex-col gap-5">
    {kind === "shield" ? <CategoryManager categories={shieldCategories} /> : null}
    <form action={action} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <input name="kind" type="hidden" value={kind} />
      <Field><FieldLabel htmlFor={`new-${kind}`}>Nombre de {productCatalogKindLabels[kind].toLowerCase()}</FieldLabel><Input id={`new-${kind}`} name="name" required /></Field>
      {kind === "shield" ? <Field className="sm:col-span-2"><FieldLabel htmlFor="shield-category">Categoría (opcional)</FieldLabel><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" id="shield-category" name="categoryId"><option value="">Sin categoría</option>{shieldCategories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field> : <input name="categoryId" type="hidden" value="" />}
      <SubmitButton pendingLabel="Agregando producto">Agregar producto</SubmitButton>
    </form>
    <Feedback state={state} />
    <Separator />
    {visibleProducts.length ? <ul aria-label={productCatalogKindLabels[kind]} className="flex flex-col gap-3">{visibleProducts.map((product) => <ProductRow key={product.id} product={product} />)}</ul> : <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Todavía no hay productos en {productCatalogKindLabels[kind].toLowerCase()}.</p>}
  </div>;
}
