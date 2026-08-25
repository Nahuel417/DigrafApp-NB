"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

import {
  createCatalogProductAction,
  renameCatalogProductAction,
  setCatalogProductActiveAction,
  type CatalogActionState,
} from "../actions";
import type { CatalogProduct } from "../queries";
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

export function CatalogProductManager({ kind, products }: { kind: ProductCatalogKind; products: CatalogProduct[] }) {
  const [state, action] = useActionState(createCatalogProductAction, initialState);
  const visibleProducts = products.filter((product) => product.kind === kind);
  return <div className="flex flex-col gap-5">
    <form action={action} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <input name="kind" type="hidden" value={kind} />
      <Field><FieldLabel htmlFor={`new-${kind}`}>Nombre de {productCatalogKindLabels[kind].toLowerCase()}</FieldLabel><Input id={`new-${kind}`} name="name" required /></Field>
      <SubmitButton pendingLabel="Agregando producto">Agregar producto</SubmitButton>
    </form>
    <Feedback state={state} />
    <Separator />
    {visibleProducts.length ? <ul aria-label={productCatalogKindLabels[kind]} className="flex flex-col gap-3">{visibleProducts.map((product) => <ProductRow key={product.id} product={product} />)}</ul> : <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Todavía no hay productos en {productCatalogKindLabels[kind].toLowerCase()}.</p>}
  </div>;
}
