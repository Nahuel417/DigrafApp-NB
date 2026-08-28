"use client";

import { Pencil, Plus, Power } from "lucide-react";
import { useActionState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
  return state.message ? <p aria-live="polite" className={state.status === "error" ? "mt-3 text-sm text-destructive" : "mt-3 text-sm text-success-foreground"}>{state.message}</p> : null;
}

function ProductRow({ product }: { product: CatalogProduct }) {
  const [renameState, renameAction] = useActionState(renameCatalogProductAction, initialState);
  const [activeState, activeAction] = useActionState(setCatalogProductActiveAction, initialState);
  return <li className="rounded-xl border border-border bg-muted/50 p-4 transition-colors duration-200 hover:bg-muted">
    <form action={renameAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input name="itemId" type="hidden" value={product.id} />
      <Field className="min-w-0 flex-1"><FieldLabel className="sr-only" htmlFor={`product-${product.id}`}>Nombre de {product.name}</FieldLabel><Input className="rounded-xl bg-muted/40 shadow-none transition-all duration-200 focus-visible:bg-card" defaultValue={product.name} id={`product-${product.id}`} name="name" /></Field>
      <SubmitButton className="group min-h-11 shrink-0 rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs md:min-h-10" pendingLabel="Renombrando" variant="outline">
        <Pencil aria-hidden="true" data-icon="inline-start" />
        Renombrar
      </SubmitButton>
    </form>
    <form action={activeAction} className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
      <input name="itemId" type="hidden" value={product.id} /><input name="isActive" type="hidden" value={String(!product.is_active)} />
      <Badge className="rounded-full px-2.5 py-1 text-[11px] font-medium" variant={product.is_active ? "active" : "inactive"}>{product.is_active ? "Activo" : "Inactivo"}</Badge>
      <SubmitButton className="group min-h-11 shrink-0 rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs md:min-h-10" pendingLabel={product.is_active ? "Desactivando" : "Activando"} variant="outline">
        <Power aria-hidden="true" data-icon="inline-start" />
        {product.is_active ? "Desactivar" : "Activar"}
      </SubmitButton>
    </form>
    <Feedback state={renameState.status === "error" ? renameState : activeState} />
  </li>;
}

export function CatalogProductManager({ kind, products }: { kind: ProductCatalogKind; products: CatalogProduct[] }) {
  const [state, action] = useActionState(createCatalogProductAction, initialState);
  const visibleProducts = products.filter((product) => product.kind === kind);
  return <div className="flex flex-col">
    <div className="border-b border-border px-4 py-4 sm:px-6 sm:py-5">
      <p className="mb-4 text-xs text-muted-foreground">El nombre queda disponible para los nuevos pedidos cuando lo guardes.</p>
      <form action={action} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <input name="kind" type="hidden" value={kind} />
        <Field>
          <FieldLabel className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground" htmlFor={`new-${kind}`}>Nombre de {productCatalogKindLabels[kind].toLowerCase()}</FieldLabel>
          <Input className="rounded-xl bg-muted/40 shadow-none transition-all duration-200 focus-visible:bg-card" id={`new-${kind}`} name="name" required />
        </Field>
        <SubmitButton className="group min-h-11 rounded-xl px-4 shadow-xs transition-all duration-200 hover:shadow-md active:scale-[0.98] md:min-h-10" pendingLabel="Agregando producto">
          <Plus aria-hidden="true" className="transition-transform duration-200 group-hover:rotate-90" data-icon="inline-start" />
          Agregar producto
        </SubmitButton>
      </form>
      <Feedback state={state} />
    </div>
    <div className="px-4 py-4 sm:px-6 sm:py-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Listado</p>
      <h3 className="mb-4 mt-1 text-sm font-semibold tracking-tight">{productCatalogKindLabels[kind]}</h3>
      {visibleProducts.length ? <ul aria-label={productCatalogKindLabels[kind]} className="flex flex-col gap-2">{visibleProducts.map((product) => <ProductRow key={product.id} product={product} />)}</ul> : <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-xs text-muted-foreground">Todavía no hay productos en {productCatalogKindLabels[kind].toLowerCase()}.</p>}
    </div>
  </div>;
}
