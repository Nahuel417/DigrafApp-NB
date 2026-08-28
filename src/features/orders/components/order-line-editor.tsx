"use client";

import { ArrowDown, ArrowUp, Layers, Palette, Plus, Scissors, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { LegacyCatalogOption, OrderCatalogOption, OrderCatalogProduct, OrderFormCatalogs } from "../queries";
import type { CatalogOptionSelection, LegacyLineOptions, OrderLineInput, OrderLineType } from "../line-contracts";

type EditableLine = OrderLineInput & { key: string };
const emptySelectValue = "__empty__";
const compactSelectClassName = "h-9 rounded-full bg-card px-3 text-xs shadow-none transition-colors focus-visible:bg-card md:h-9";
const lineTypeSelectClassName = `${compactSelectClassName} max-w-56`;

const lineTypeLabels: Record<OrderLineType, string> = {
  individual: "Prenda individual",
  set: "Conjunto",
  flag: "Bandera",
  bag: "Bolso",
  shield: "Escudo",
};

function line(type: OrderLineType = "individual"): EditableLine {
  return { key: crypto.randomUUID(), position: 0, line_type: type, quantity: 1, color: "", options: [] };
}

function hasNoConfiguredOptions(product: OrderCatalogProduct | undefined, hasLegacyOptions: boolean) {
  return !product || (product.options.length === 0 && !hasLegacyOptions);
}

function productOptions(product: OrderCatalogProduct | undefined, selections: CatalogOptionSelection[] | undefined, hasLegacyOptions: boolean, onChange: (options: CatalogOptionSelection[]) => void) {
  if (!product || hasNoConfiguredOptions(product, hasLegacyOptions)) return null;

  function selected(optionId: string) {
    return selections?.find((item) => item.option_id === optionId)?.value_ids ?? [];
  }

  function update(option: OrderCatalogOption, valueIds: string[]) {
    const next = (selections ?? []).filter((item) => item.option_id !== option.id);
    if (valueIds.length > 0) next.push({ option_id: option.id, value_ids: valueIds });
    onChange(next);
  }

  return <div className="mt-3 grid gap-3 md:grid-cols-2">
      {product.options.map((option) => option.selectionMode === "single" ? (
        <Field key={option.id}>
          <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={`option-${option.id}`}>{option.name} <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
          <Select onValueChange={(value) => update(option, value === emptySelectValue ? [] : [value])} value={selected(option.id)[0] ?? emptySelectValue}>
            <SelectTrigger className={compactSelectClassName} id={`option-${option.id}`}><SelectValue placeholder="Sin seleccionar" /></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value={emptySelectValue}>Sin seleccionar</SelectItem>{option.values.map((value) => <SelectItem key={value.id} value={value.id}>{value.value}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
      ) : (
        <Field key={option.id}>
          <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground">{option.name} <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
          <div className="flex flex-wrap gap-2">
            {option.values.map((value) => {
              const checked = selected(option.id).includes(value.id);
              return <label className="flex min-h-8 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs transition-colors hover:border-primary/40" key={value.id}><input checked={checked} className="size-3.5 accent-primary" onChange={(event) => update(option, event.target.checked ? [...selected(option.id), value.id] : selected(option.id).filter((id) => id !== value.id))} type="checkbox" />{value.value}</label>;
            })}
          </div>
        </Field>
      ))}
  </div>;
}

function ProductSelect({ id, label, products, value, onChange }: { id: string; label: string; products: OrderCatalogProduct[]; value: string; onChange: (value: string) => void }) {
  return <Field>
    <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={id}>{label}</FieldLabel>
    <Select onValueChange={(nextValue) => onChange(nextValue === emptySelectValue ? "" : nextValue)} value={value || emptySelectValue}>
      <SelectTrigger className={compactSelectClassName} id={id}><SelectValue placeholder="Elegí un producto" /></SelectTrigger>
      <SelectContent><SelectGroup><SelectItem value={emptySelectValue}>Elegí un producto</SelectItem>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
    {products.length === 0 ? <FieldDescription>No hay productos activos para este tipo.</FieldDescription> : null}
  </Field>;
}

function ProductOptions({ hasLegacyOptions, product, selections, onChange }: { hasLegacyOptions: boolean; product: OrderCatalogProduct | undefined; selections: CatalogOptionSelection[] | undefined; onChange: (options: CatalogOptionSelection[]) => void }) {
  return productOptions(product, selections, hasLegacyOptions, onChange);
}

function LegacySelect({ id, label, options, value, onChange }: { id: string; label: string; options: LegacyCatalogOption[]; value: string; onChange: (value: string) => void }) {
  return <Field>
    <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={id}>{label}</FieldLabel>
    <Select onValueChange={(nextValue) => onChange(nextValue === emptySelectValue ? "" : nextValue)} value={value || emptySelectValue}>
      <SelectTrigger className={compactSelectClassName} id={id}><SelectValue placeholder="Elegí una opción" /></SelectTrigger>
      <SelectContent><SelectGroup><SelectItem value={emptySelectValue}>Elegí una opción</SelectItem>{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  </Field>;
}

function LegacyOptions({ catalogs, id, needsLower, needsUpper, options, onChange }: { catalogs: OrderFormCatalogs; id: string; needsLower: boolean; needsUpper: boolean; options: LegacyLineOptions; onChange: (options: LegacyLineOptions) => void }) {
  const update = (patch: Partial<LegacyLineOptions>) => onChange({ ...options, ...patch });
  return <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-3.5 sm:p-4">
    <p className="mb-4 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-label text-muted-foreground"><Scissors aria-hidden="true" className="size-3 text-primary" />Opciones existentes</p>
    <div className="grid gap-4 md:grid-cols-2">
      {needsUpper ? <LegacySelect id={`${id}-neckline`} label="Cuello" onChange={(value) => update({ neckline_id: value })} options={catalogs.necklines} value={options.neckline_id ?? ""} /> : null}
      {needsUpper ? <LegacySelect id={`${id}-upper-pattern`} label="Molde superior" onChange={(value) => update({ upper_pattern_id: value })} options={catalogs.upperPatterns} value={options.upper_pattern_id ?? ""} /> : null}
      {needsLower ? <LegacySelect id={`${id}-lower-pattern`} label="Molde de short/pollera" onChange={(value) => update({ lower_pattern_id: value })} options={catalogs.lowerPatterns} value={options.lower_pattern_id ?? ""} /> : null}
      <LegacySelect id={`${id}-fabric`} label="Tela" onChange={(value) => update({ fabric_id: value })} options={catalogs.fabrics} value={options.fabric_id ?? ""} />
    </div>
    <Field className="mt-4">
      <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground">Extras <span className="font-normal text-muted-foreground">(opcionales, múltiples)</span></FieldLabel>
      <div className="flex flex-wrap gap-2">
        {catalogs.extras.length ? catalogs.extras.map((extra) => {
          const checked = (options.extra_ids ?? []).includes(extra.id);
          return <label className="flex min-h-8 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs transition-colors hover:border-primary/40" key={extra.id}><input checked={checked} className="size-3.5 accent-primary" onChange={(event) => update({ extra_ids: event.target.checked ? [...new Set([...(options.extra_ids ?? []), extra.id])] : (options.extra_ids ?? []).filter((value) => value !== extra.id) })} type="checkbox" />{extra.name}</label>;
        }) : <span className="text-sm text-muted-foreground">No hay extras activos.</span>}
      </div>
    </Field>
  </div>;
}

function LineEditor({ catalogs, item, index, lineCount, onChange, onMove, onRemove }: { catalogs: OrderFormCatalogs; item: EditableLine; index: number; lineCount: number; onChange: (line: EditableLine) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void }) {
  const products = item.line_type === "individual" || item.line_type === "set" ? catalogs.garments : item.line_type === "flag" ? catalogs.flags : item.line_type === "bag" ? catalogs.bags : catalogs.shields;
  const product = products.find((candidate) => candidate.id === item.product_id);
  const upperProduct = catalogs.garments.find((candidate) => candidate.id === item.configuration?.upper?.product_id);
  const lowerProduct = catalogs.garments.find((candidate) => candidate.id === item.configuration?.lower?.product_id);
  const update = (patch: Partial<EditableLine>) => onChange({ ...item, ...patch });
  const legacyOptions = item.configuration?.legacy_options ?? {};
  const updateLegacyOptions = (options: LegacyLineOptions) => update({ configuration: { ...item.configuration, legacy_options: options } });
  const individualLayer = product?.garmentLayer;
  const legacyOptionLists = item.line_type === "set"
    ? [catalogs.necklines, catalogs.upperPatterns, catalogs.lowerPatterns, catalogs.fabrics, catalogs.extras]
    : item.line_type === "individual" && individualLayer
      ? [individualLayer === "upper" ? catalogs.necklines : catalogs.lowerPatterns, ...(individualLayer === "upper" ? [catalogs.upperPatterns] : []), catalogs.fabrics, catalogs.extras]
      : [];
  const hasLegacyOptions = legacyOptionLists.some((options) => options.length > 0);

  return <article className="group/r overflow-hidden rounded-2xl border border-border bg-card shadow-none transition-colors duration-200 hover:border-primary/30">
    <div className="grid-paper flex min-h-12 flex-wrap items-center gap-3 border-b border-border px-3 py-2.5 sm:px-4">
      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 font-mono text-[11px] font-semibold text-primary">{index + 1}</span>
      <div className="min-w-0 flex-1"><p className="text-[10px] font-medium uppercase tracking-label text-muted-foreground">Renglón</p><h3 className="truncate text-sm font-semibold tracking-tight">{lineTypeLabels[item.line_type]}</h3></div>
      <div className="flex gap-1 opacity-60 transition-opacity group-hover/r:opacity-100">
        <Button aria-label={`Subir renglón ${index + 1}`} className="size-8 rounded-full border border-border bg-card shadow-none hover:bg-muted" disabled={index === 0} onClick={() => onMove(-1)} size="icon" type="button" variant="ghost"><ArrowUp aria-hidden="true" /></Button>
        <Button aria-label={`Bajar renglón ${index + 1}`} className="size-8 rounded-full border border-border bg-card shadow-none hover:bg-muted" disabled={index === lineCount - 1} onClick={() => onMove(1)} size="icon" type="button" variant="ghost"><ArrowDown aria-hidden="true" /></Button>
        <Button aria-label={`Quitar renglón ${index + 1}`} className="size-8 rounded-full shadow-none" onClick={onRemove} size="icon" type="button" variant="destructive-outline"><Trash2 aria-hidden="true" /></Button>
      </div>
    </div>
    <div className="flex flex-col gap-4 p-3.5 sm:p-4">
      <div className="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_13rem]">
      <Field>
        <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={`line-type-${item.key}`}>Tipo de renglón</FieldLabel>
        <Select onValueChange={(value) => onChange({ ...line(), key: item.key, line_type: value as OrderLineType, quantity: item.quantity, color: item.color })} value={item.line_type}>
          <SelectTrigger className={lineTypeSelectClassName} id={`line-type-${item.key}`}><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{Object.entries(lineTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={`line-quantity-${item.key}`}>Cantidad</FieldLabel>
        <Input className="h-9 rounded-full bg-card shadow-none transition-colors focus-visible:bg-card md:h-9" id={`line-quantity-${item.key}`} inputMode="numeric" min={1} onChange={(event) => update({ quantity: Number(event.target.value) })} type="number" value={item.quantity} />
      </Field>
      </div>
      <Field>
        <FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground" htmlFor={`line-color-${item.key}`}>Color <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
        <div className="relative">
          <Palette aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 rounded-full bg-card pl-10 shadow-none transition-colors focus-visible:bg-card md:h-9" id={`line-color-${item.key}`} maxLength={100} onChange={(event) => update({ color: event.target.value })} placeholder="Ej. verde / blanco" value={item.color ?? ""} />
        </div>
      </Field>
    {item.line_type !== "set" ? <div className="min-w-0"><ProductSelect id={`line-product-${item.key}`} label="Producto de catálogo" onChange={(productId) => update({ product_id: productId, options: [], configuration: { ...item.configuration, legacy_options: {} } })} products={products} value={item.product_id ?? ""} /><ProductOptions hasLegacyOptions={hasLegacyOptions} product={product} selections={item.options} onChange={(options) => update({ options })} />{hasNoConfiguredOptions(product, hasLegacyOptions) ? <p className="mt-2 text-sm text-muted-foreground">Este producto no tiene opciones configuradas.</p> : null}</div> : null}
    {item.line_type === "set" ? <>
      <div className="grid gap-4 md:grid-cols-2">
      <div><ProductSelect id={`line-upper-${item.key}`} label="Parte superior" onChange={(productId) => update({ configuration: { ...item.configuration, upper: { product_id: productId, options: [] } } })} products={catalogs.garments.filter((candidate) => candidate.garmentLayer === "upper")} value={item.configuration?.upper?.product_id ?? ""} /><ProductOptions hasLegacyOptions={hasLegacyOptions} product={upperProduct} selections={item.configuration?.upper?.options} onChange={(options) => update({ configuration: { ...item.configuration, upper: { product_id: item.configuration?.upper?.product_id ?? "", options } } })} /></div>
      <div><ProductSelect id={`line-lower-${item.key}`} label="Parte inferior" onChange={(productId) => update({ configuration: { ...item.configuration, lower: { product_id: productId, options: [] } } })} products={catalogs.garments.filter((candidate) => candidate.garmentLayer === "lower")} value={item.configuration?.lower?.product_id ?? ""} /><ProductOptions hasLegacyOptions={hasLegacyOptions} product={lowerProduct} selections={item.configuration?.lower?.options} onChange={(options) => update({ configuration: { ...item.configuration, lower: { product_id: item.configuration?.lower?.product_id ?? "", options } } })} /></div>
      </div>
      {hasNoConfiguredOptions(upperProduct, hasLegacyOptions) || hasNoConfiguredOptions(lowerProduct, hasLegacyOptions) ? <p className="text-sm text-muted-foreground">No hay opciones configuradas para las partes seleccionadas.</p> : null}
    </> : null}
    {item.line_type === "set" ? <LegacyOptions catalogs={catalogs} id={`line-${item.key}`} needsLower needsUpper onChange={updateLegacyOptions} options={legacyOptions} /> : item.line_type === "individual" && individualLayer ? <LegacyOptions catalogs={catalogs} id={`line-${item.key}`} needsLower={individualLayer === "lower"} needsUpper={individualLayer === "upper"} onChange={updateLegacyOptions} options={legacyOptions} /> : null}
    <Field><FieldLabel className="text-[11px] font-medium uppercase tracking-label text-muted-foreground">Escudos <span className="font-normal text-muted-foreground">(opcionales, múltiples)</span></FieldLabel><div className="flex flex-wrap gap-2">{catalogs.shields.length ? catalogs.shields.map((shield) => <label className="flex min-h-8 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs transition-colors hover:border-primary/40" key={shield.id}><input checked={(item.shield_product_ids ?? []).includes(shield.id)} className="size-3.5 accent-primary" onChange={(event) => update({ shield_product_ids: event.target.checked ? [...new Set([...(item.shield_product_ids ?? []), shield.id])] : (item.shield_product_ids ?? []).filter((id) => id !== shield.id) })} type="checkbox" />{shield.name}</label>) : <span className="text-sm text-muted-foreground">No hay escudos activos.</span>}</div></Field>
    </div>
  </article>;
}

export function OrderLineEditor({ catalogs, initialLines = [], name = "lines", onSummaryChange }: { catalogs: OrderFormCatalogs; initialLines?: OrderLineInput[]; name?: string; onSummaryChange?: (summary: { lineCount: number; unitCount: number }) => void }) {
  const lineId = useId();
  const [lines, setLines] = useState<EditableLine[]>(() => {
    const initial = initialLines.length ? initialLines : [{ position: 0, line_type: "individual" as const, quantity: 1, color: "", options: [] }];
    return initial.map((item, index) => ({ ...item, key: `${lineId}-${index}` }));
  });
  useEffect(() => {
    onSummaryChange?.({
      lineCount: lines.length,
      unitCount: lines.reduce((total, item) => total + (Number.isFinite(item.quantity) ? item.quantity : 0), 0),
    });
  }, [lines, onSummaryChange]);
  function replace(index: number, value: EditableLine) { setLines((current) => current.map((item, itemIndex) => itemIndex === index ? value : item)); }
  function move(index: number, direction: -1 | 1) { setLines((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target]!, next[index]!]; return next; }); }

  return <FieldSet className="gap-0 rounded-2xl border border-border bg-card p-4 shadow-xs sm:p-5">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Layers aria-hidden="true" className="size-4" /></span>
        <div className="min-w-0">
          <FieldLabel className="text-sm font-semibold tracking-tight">Renglones del pedido</FieldLabel>
          <FieldDescription className="text-xs leading-5">Agregá cada producto, con su cantidad, color y opciones. No se cargan importes por renglón.</FieldDescription>
        </div>
      </div>
      <Button className="h-9 rounded-full px-3 text-xs" onClick={() => setLines((current) => [...current, line()])} type="button" variant="outline"><Plus data-icon="inline-start" />Agregar renglón</Button>
    </div>
    <input name={name} type="hidden" value={JSON.stringify(lines.map(({ key: _key, ...item }, position) => ({ ...item, position, color: item.color?.trim() || null })))} readOnly />
    <div className="flex flex-col gap-4">{lines.map((item, index) => <LineEditor catalogs={catalogs} index={index} item={item} key={item.key} lineCount={lines.length} onChange={(value) => replace(index, value)} onMove={(direction) => move(index, direction)} onRemove={() => setLines((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))} />)}</div>
  </FieldSet>;
}
