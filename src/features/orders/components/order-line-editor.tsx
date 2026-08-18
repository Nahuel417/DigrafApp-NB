"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { LegacyCatalogOption, OrderCatalogOption, OrderCatalogProduct, OrderFormCatalogs } from "../queries";
import type { CatalogOptionSelection, LegacyLineOptions, OrderLineInput, OrderLineType } from "../line-contracts";

type EditableLine = OrderLineInput & { key: string };

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

function productOptions(product: OrderCatalogProduct | undefined, selections: CatalogOptionSelection[] | undefined, onChange: (options: CatalogOptionSelection[]) => void) {
  if (!product || product.options.length === 0) return <p className="text-sm text-muted-foreground">Este producto no tiene opciones configuradas.</p>;

  function selected(optionId: string) {
    return selections?.find((item) => item.option_id === optionId)?.value_ids ?? [];
  }

  function update(option: OrderCatalogOption, valueIds: string[]) {
    const next = (selections ?? []).filter((item) => item.option_id !== option.id);
    if (valueIds.length > 0) next.push({ option_id: option.id, value_ids: valueIds });
    onChange(next);
  }

  return <div className="mt-3 grid gap-3 sm:grid-cols-2">
    {product.options.map((option) => option.selectionMode === "single" ? (
      <Field key={option.id}>
        <FieldLabel htmlFor={`option-${option.id}`}>{option.name} <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
        <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" id={`option-${option.id}`} onChange={(event) => update(option, event.target.value ? [event.target.value] : [])} value={selected(option.id)[0] ?? ""}>
          <option value="">Sin seleccionar</option>
          {option.values.map((value) => <option key={value.id} value={value.id}>{value.value}</option>)}
        </select>
      </Field>
    ) : (
      <Field key={option.id}>
        <FieldLabel>{option.name} <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
        <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-input p-3">
          {option.values.map((value) => {
            const checked = selected(option.id).includes(value.id);
            return <label className="flex min-h-8 items-center gap-2 text-sm" key={value.id}><input checked={checked} onChange={(event) => update(option, event.target.checked ? [...selected(option.id), value.id] : selected(option.id).filter((id) => id !== value.id))} type="checkbox" />{value.value}</label>;
          })}
        </div>
      </Field>
    ))}
  </div>;
}

function ProductSelect({ id, label, products, value, onChange }: { id: string; label: string; products: OrderCatalogProduct[]; value: string; onChange: (value: string) => void }) {
  return <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" id={id} onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="">Elegí un producto</option>
      {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
    </select>
    {products.length === 0 ? <FieldDescription>No hay productos activos para este tipo.</FieldDescription> : null}
  </Field>;
}

function ProductOptions({ product, selections, onChange }: { product: OrderCatalogProduct | undefined; selections: CatalogOptionSelection[] | undefined; onChange: (options: CatalogOptionSelection[]) => void }) {
  return productOptions(product, selections, onChange);
}

function LegacySelect({ id, label, options, value, onChange }: { id: string; label: string; options: LegacyCatalogOption[]; value: string; onChange: (value: string) => void }) {
  return <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" id={id} onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="">Elegí una opción</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select>
  </Field>;
}

function LegacyOptions({ catalogs, id, needsLower, needsUpper, options, onChange }: { catalogs: OrderFormCatalogs; id: string; needsLower: boolean; needsUpper: boolean; options: LegacyLineOptions; onChange: (options: LegacyLineOptions) => void }) {
  const update = (patch: Partial<LegacyLineOptions>) => onChange({ ...options, ...patch });
  return <div className="mt-4 rounded-md border border-border bg-background p-4">
    <p className="text-sm font-medium">Opciones existentes</p>
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      {needsUpper ? <LegacySelect id={`${id}-neckline`} label="Cuello" onChange={(value) => update({ neckline_id: value })} options={catalogs.necklines} value={options.neckline_id ?? ""} /> : null}
      {needsUpper ? <LegacySelect id={`${id}-upper-pattern`} label="Molde superior" onChange={(value) => update({ upper_pattern_id: value })} options={catalogs.upperPatterns} value={options.upper_pattern_id ?? ""} /> : null}
      {needsLower ? <LegacySelect id={`${id}-lower-pattern`} label="Molde de short/pollera" onChange={(value) => update({ lower_pattern_id: value })} options={catalogs.lowerPatterns} value={options.lower_pattern_id ?? ""} /> : null}
      <LegacySelect id={`${id}-fabric`} label="Tela" onChange={(value) => update({ fabric_id: value })} options={catalogs.fabrics} value={options.fabric_id ?? ""} />
    </div>
    <Field className="mt-4">
      <FieldLabel>Extras <span className="font-normal text-muted-foreground">(opcionales, múltiples)</span></FieldLabel>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-input p-3">
        {catalogs.extras.length ? catalogs.extras.map((extra) => {
          const checked = (options.extra_ids ?? []).includes(extra.id);
          return <label className="flex min-h-8 items-center gap-2 text-sm" key={extra.id}><input checked={checked} onChange={(event) => update({ extra_ids: event.target.checked ? [...new Set([...(options.extra_ids ?? []), extra.id])] : (options.extra_ids ?? []).filter((value) => value !== extra.id) })} type="checkbox" />{extra.name}</label>;
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

  return <article className="rounded-lg border border-border bg-muted/20 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="font-mono text-xs text-muted-foreground">Renglón {index + 1}</p><h3 className="mt-1 font-semibold">{lineTypeLabels[item.line_type]}</h3></div>
      <div className="flex gap-1">
        <Button aria-label={`Subir renglón ${index + 1}`} disabled={index === 0} onClick={() => onMove(-1)} size="icon" type="button" variant="ghost"><ArrowUp aria-hidden="true" /></Button>
        <Button aria-label={`Bajar renglón ${index + 1}`} disabled={index === lineCount - 1} onClick={() => onMove(1)} size="icon" type="button" variant="ghost"><ArrowDown aria-hidden="true" /></Button>
        <Button aria-label={`Quitar renglón ${index + 1}`} onClick={onRemove} size="icon" type="button" variant="ghost"><Trash2 aria-hidden="true" /></Button>
      </div>
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`line-type-${item.key}`}>Tipo de renglón</FieldLabel>
        <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" id={`line-type-${item.key}`} onChange={(event) => onChange({ ...line(), key: item.key, line_type: event.target.value as OrderLineType, quantity: item.quantity, color: item.color })} value={item.line_type}>
          {Object.entries(lineTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`line-quantity-${item.key}`}>Cantidad</FieldLabel>
        <Input id={`line-quantity-${item.key}`} inputMode="numeric" min={1} onChange={(event) => update({ quantity: Number(event.target.value) })} type="number" value={item.quantity} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`line-color-${item.key}`}>Color <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
        <Input id={`line-color-${item.key}`} maxLength={100} onChange={(event) => update({ color: event.target.value })} value={item.color ?? ""} />
      </Field>
      {item.line_type !== "set" ? <ProductSelect id={`line-product-${item.key}`} label="Producto de catálogo" onChange={(productId) => update({ product_id: productId, options: [], configuration: { ...item.configuration, legacy_options: {} } })} products={products} value={item.product_id ?? ""} /> : null}
    </div>
    {item.line_type === "set" ? <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div><ProductSelect id={`line-upper-${item.key}`} label="Parte superior" onChange={(productId) => update({ configuration: { ...item.configuration, upper: { product_id: productId, options: [] } } })} products={catalogs.garments.filter((candidate) => candidate.garmentLayer === "upper")} value={item.configuration?.upper?.product_id ?? ""} /><ProductOptions product={upperProduct} selections={item.configuration?.upper?.options} onChange={(options) => update({ configuration: { ...item.configuration, upper: { product_id: item.configuration?.upper?.product_id ?? "", options } } })} /></div>
      <div><ProductSelect id={`line-lower-${item.key}`} label="Parte inferior" onChange={(productId) => update({ configuration: { ...item.configuration, lower: { product_id: productId, options: [] } } })} products={catalogs.garments.filter((candidate) => candidate.garmentLayer === "lower")} value={item.configuration?.lower?.product_id ?? ""} /><ProductOptions product={lowerProduct} selections={item.configuration?.lower?.options} onChange={(options) => update({ configuration: { ...item.configuration, lower: { product_id: item.configuration?.lower?.product_id ?? "", options } } })} /></div>
    </div> : <ProductOptions product={product} selections={item.options} onChange={(options) => update({ options })} />}
    {item.line_type === "set" ? <LegacyOptions catalogs={catalogs} id={`line-${item.key}`} needsLower needsUpper onChange={updateLegacyOptions} options={legacyOptions} /> : item.line_type === "individual" && individualLayer ? <LegacyOptions catalogs={catalogs} id={`line-${item.key}`} needsLower={individualLayer === "lower"} needsUpper={individualLayer === "upper"} onChange={updateLegacyOptions} options={legacyOptions} /> : null}
    <Field className="mt-4"><FieldLabel>Escudos <span className="font-normal text-muted-foreground">(opcionales, múltiples)</span></FieldLabel><div className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-input p-3">{catalogs.shields.length ? catalogs.shields.map((shield) => <label className="flex min-h-8 items-center gap-2 text-sm" key={shield.id}><input checked={(item.shield_product_ids ?? []).includes(shield.id)} onChange={(event) => update({ shield_product_ids: event.target.checked ? [...new Set([...(item.shield_product_ids ?? []), shield.id])] : (item.shield_product_ids ?? []).filter((id) => id !== shield.id) })} type="checkbox" />{shield.name}</label>) : <span className="text-sm text-muted-foreground">No hay escudos activos.</span>}</div></Field>
  </article>;
}

export function OrderLineEditor({ catalogs, initialLines = [], name = "lines" }: { catalogs: OrderFormCatalogs; initialLines?: OrderLineInput[]; name?: string }) {
  const lineId = useId();
  const [lines, setLines] = useState<EditableLine[]>(() => {
    const initial = initialLines.length ? initialLines : [{ position: 0, line_type: "individual" as const, quantity: 1, color: "", options: [] }];
    return initial.map((item, index) => ({ ...item, key: `${lineId}-${index}` }));
  });
  function replace(index: number, value: EditableLine) { setLines((current) => current.map((item, itemIndex) => itemIndex === index ? value : item)); }
  function move(index: number, direction: -1 | 1) { setLines((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target]!, next[index]!]; return next; }); }

  return <FieldSet>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><FieldLabel>Renglones del pedido</FieldLabel><FieldDescription>Agregá cada producto, con su cantidad, color y opciones. No se cargan importes por renglón.</FieldDescription></div><Button onClick={() => setLines((current) => [...current, line()])} type="button" variant="outline"><Plus data-icon="inline-start" />Agregar renglón</Button></div>
    <input name={name} type="hidden" value={JSON.stringify(lines.map(({ key: _key, ...item }, position) => ({ ...item, position, color: item.color?.trim() || null })))} readOnly />
    <div className="mt-4 flex flex-col gap-4">{lines.map((item, index) => <LineEditor catalogs={catalogs} index={index} item={item} key={item.key} lineCount={lines.length} onChange={(value) => replace(index, value)} onMove={(direction) => move(index, direction)} onRemove={() => setLines((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))} />)}</div>
  </FieldSet>;
}
